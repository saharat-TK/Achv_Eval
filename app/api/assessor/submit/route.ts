import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import { computeRubricResult } from '@/lib/types/models';
import type { AssessmentDoc } from '@/lib/types/models';
import {
  createNotification,
  createNotifications,
  getProgramVerifierIds,
  notifySafely,
} from '@/lib/data/notifications';
import type { OfferingStatus } from '@/lib/types/models';

export const runtime = 'nodejs';
const ASSESSMENT_ALLOWED_STATUSES: OfferingStatus[] = [
  'pending_assessment',
  'assessor_review',
  'assessed',
];

/**
 * POST /api/assessor/submit
 *
 * Saves or locks an assessment for an offering. Validates that the caller
 * is an assessor for the offering's program.
 *
 * Body: { offeringId, assessmentId?, scores, comments, generalNotes, lock }
 */
export async function POST(request: NextRequest) {
  // 1. Authenticate
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 403 });
  }

  // 2. Parse body
  let body: {
    offeringId: string;
    assessmentId?: string | null;
    scores: AssessmentDoc['scores'];
    comments: AssessmentDoc['comments'];
    generalNotes: string;
    lock: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { offeringId, assessmentId, scores, comments, generalNotes, lock } = body;

  if (!offeringId || !scores) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // 3. Load the offering and verify assessor authorization
  const db = getAdminDb();
  const offeringRef = db.collection('offerings').doc(offeringId);
  const offeringSnap = await offeringRef.get();

  if (!offeringSnap.exists) {
    return NextResponse.json({ error: 'offering_not_found' }, { status: 404 });
  }

  const offering = offeringSnap.data()!;
  if (!profile.roles.assessorOf.includes(offering.programId)) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }
  if (!ASSESSMENT_ALLOWED_STATUSES.includes(offering.status)) {
    return NextResponse.json({ error: 'not_pending_assessment' }, { status: 409 });
  }

  // 4. Compute rubric result
  const result = computeRubricResult(scores);

  // 5. Build the assessment document
  const now = FieldValue.serverTimestamp();
  const assessmentData: Omit<AssessmentDoc, 'createdAt' | 'updatedAt' | 'signedAt'> & {
    createdAt: any;
    updatedAt: any;
    signedAt: any;
  } = {
    offeringId,
    aiReportId: offering.latestAiReportId ?? '',
    assessorId: user.uid,
    assessorName: profile.nameTh,
    scores,
    totalScore: result.totalScore,
    maxScore: result.maxScore,
    percentScore: result.percentScore,
    band: result.band,
    comments: comments ?? {},
    sectionComments: [],
    generalNotes: generalNotes || null,
    signedPdfStoragePath: null,
    signedPdfUrl: null,
    signedAt: lock ? now : null,
    isLocked: lock,
    // On sign-off the record carries forward for next-semester verification.
    followUpStatus: lock ? 'pending_review_next_semester' : null,
    createdAt: now,
    updatedAt: now,
  };

  // 6. Write to Firestore
  const assessmentsCol = offeringRef.collection('assessments');
  let docId = assessmentId;

  try {
    if (docId) {
      // Check that the existing assessment is not locked
      const existingSnap = await assessmentsCol.doc(docId).get();
      if (existingSnap.exists && existingSnap.data()?.isLocked) {
        return NextResponse.json(
          { error: 'assessment_locked' },
          { status: 409 },
        );
      }

      // Update existing — preserve createdAt
      const { createdAt: _, ...updateData } = assessmentData;
      await assessmentsCol.doc(docId).update({
        ...updateData,
        updatedAt: now,
      });
    } else {
      // Create new
      const newRef = await assessmentsCol.add(assessmentData);
      docId = newRef.id;
    }

    // 7. If locking, update offering status and link
    if (lock) {
      await offeringRef.update({
        status: 'assessed',
        assessmentId: docId,
        updatedAt: now,
        updatedBy: user.uid,
      });
    } else if (offering.status === 'pending_assessment') {
      // Move to assessor_review on first draft save
      await offeringRef.update({
        status: 'assessor_review',
        updatedAt: now,
        updatedBy: user.uid,
      });
    }

    // 8. Audit log
    await db.collection('auditLog').add({
      occurredAt: now,
      actorId: user.uid,
      actorEmail: user.email,
      action: lock ? 'sign_off' : 'assessment_draft',
      entityType: 'assessments',
      entityId: docId,
      before: null,
      after: { offeringId, lock, totalScore: result.totalScore },
    });

    // 9. On sign-off, notify the lecturer and the program's verifiers.
    if (lock) {
      const courseCode = (offering.courseCode as string | undefined) ?? '';
      await notifySafely(
        Promise.all([
          offering.lecturerId
            ? createNotification({
                recipientId: offering.lecturerId,
                type: 'course_assessed',
                title: 'รายวิชาได้รับการทวนสอบแล้ว',
                body: `รายวิชา ${courseCode} ได้รับการประเมินจากผู้ทวนสอบ`.trim(),
                relatedOfferingId: offeringId,
              })
            : Promise.resolve(),
          getProgramVerifierIds(offering.programId).then((ids) =>
            createNotifications(ids, {
              type: 'verification_ready',
              title: 'มีรายวิชารอการรับรองผล',
              body: `รายวิชา ${courseCode} พร้อมรับรองผลขั้นสุดท้าย`.trim(),
              relatedOfferingId: offeringId,
            }),
          ),
        ]),
      );
    }
  } catch (err: any) {
    console.error('assessment submit error', err);
    return NextResponse.json(
      { error: err.message || 'write_failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, assessmentId: docId });
}
