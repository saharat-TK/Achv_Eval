import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile, isImpersonating } from '@/lib/firebase/auth-server';
import { computeRubricResult } from '@/lib/types/models';
import type { AssessmentDoc } from '@/lib/types/models';
import {
  createNotification,
  createNotifications,
  getProgramVerifierIds,
  notifySafely,
} from '@/lib/data/notifications';
import {
  getOfferingCommittee,
  deriveUserCommitteeRole,
} from '@/lib/data/assessmentCommittee';
import type { OfferingStatus } from '@/lib/types/models';

export const runtime = 'nodejs';
const ASSESSMENT_ALLOWED_STATUSES: OfferingStatus[] = [
  'pending_assessment',
  'assessor_review',
  'pending_head_signoff',
  'assessed',
];

/** Two-step sign-off actions:
 *  - `draft`   secretary saves progress (stays editable)
 *  - `submit`  secretary sends to the head (→ pending_head_signoff)
 *  - `sign`    head signs off (→ assessed, locked)
 *  - `return`  head sends back to the secretary (→ assessor_review) */
type AssessorAction = 'draft' | 'submit' | 'sign' | 'return';
const ASSESSOR_ACTIONS: AssessorAction[] = ['draft', 'submit', 'sign', 'return'];

/**
 * POST /api/assessor/submit
 *
 * Records a step in the two-step sign-off for an offering's assessment. The
 * caller must be an assessor for the offering's program; with a standing
 * committee, `draft`/`submit` are secretary-only and `sign`/`return` are
 * head-only (admins and committee-less programs fall back to the original
 * single-assessor flow).
 *
 * Body: { offeringId, assessmentId?, scores, comments, generalNotes, action }
 *   action: 'draft' | 'submit' | 'sign' | 'return' (legacy: lock=true ⇒ sign)
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
  if (await isImpersonating()) {
    return NextResponse.json({ error: 'read_only_impersonation' }, { status: 403 });
  }

  // 2. Parse body
  let body: {
    offeringId: string;
    assessmentId?: string | null;
    scores: AssessmentDoc['scores'];
    comments: AssessmentDoc['comments'];
    generalNotes: string;
    action?: AssessorAction;
    /** Legacy flag (pre two-step). `true` is treated as `action: 'sign'`. */
    lock?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { offeringId, assessmentId, scores, comments, generalNotes } = body;
  const action: AssessorAction = ASSESSOR_ACTIONS.includes(body.action as AssessorAction)
    ? (body.action as AssessorAction)
    : body.lock
      ? 'sign'
      : 'draft';
  const lock = action === 'sign';

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
  const isAdmin = profile.roles.isAdmin === true;
  if (!profile.roles.assessorOf.includes(offering.programId) && !isAdmin) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }
  if (!ASSESSMENT_ALLOWED_STATUSES.includes(offering.status)) {
    return NextResponse.json({ error: 'not_pending_assessment' }, { status: 409 });
  }

  // Two-step authorization. With a standing assessment committee, the secretary
  // drafts/submits and the head signs/returns. Without a committee — or for an
  // admin override — it falls back to the original single-assessor flow (the
  // caller can both draft and sign). UI gating mirrors this; this is the gate.
  const committee = await getOfferingCommittee(offering.programId);
  const role = deriveUserCommitteeRole(committee, user.uid);
  // Admins keep an override only when they hold no committee position, so an
  // admin who is the head/secretary still acts in that committee role.
  const onCommittee = role.isHead || role.isSecretary || role.isInternal;
  const free = !committee.hasCommittee || (isAdmin && !onCommittee);
  // The head also covers the secretary stage when no secretary is assigned.
  const isSecretaryActor = role.isSecretary || (role.isHead && !role.hasSecretary);
  const status = offering.status as OfferingStatus;
  const preSubmit = status === 'pending_assessment' || status === 'assessor_review';

  const deny = () => NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  const conflict = () =>
    NextResponse.json({ error: 'invalid_status' }, { status: 409 });

  if (action === 'draft' || action === 'submit') {
    if (!(free || isSecretaryActor)) return deny();
    if (!preSubmit) return conflict();
    if (action === 'submit' && !committee.hasCommittee) return conflict();
  } else if (action === 'sign') {
    if (!(free || role.isHead)) return deny();
    if (committee.hasCommittee && !free) {
      if (status !== 'pending_head_signoff') return conflict();
    } else if (!(preSubmit || status === 'pending_head_signoff')) {
      return conflict();
    }
  } else {
    // return
    if (!committee.hasCommittee) return conflict();
    if (!(role.isHead || isAdmin)) return deny();
    if (status !== 'pending_head_signoff') return conflict();
  }

  // 3b. Before advancing toward sign-off (secretary `submit`, or `sign` in the
  // single-assessor flow), require a follow-up review when one applies — i.e.
  // there is a previous offering with a signed assessment to follow up on.
  // Mirrors the client-side gate so a direct API call cannot bypass it.
  if ((action === 'submit' || action === 'sign') && offering.previousOfferingId) {
    const prevSnap = await db
      .collection('offerings')
      .doc(offering.previousOfferingId)
      .get();
    const prevAssessmentId = prevSnap.exists
      ? (prevSnap.data()?.assessmentId as string | undefined)
      : undefined;
    if (prevAssessmentId) {
      const reviewSnap = await offeringRef
        .collection('followUpReview')
        .doc('review')
        .get();
      if (!reviewSnap.exists) {
        return NextResponse.json({ error: 'followup_required' }, { status: 409 });
      }
    }
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

    // 7. Advance the offering status for the action taken.
    if (action === 'sign') {
      await offeringRef.update({
        status: 'assessed',
        assessmentId: docId,
        updatedAt: now,
        updatedBy: user.uid,
      });

      // Freeze the follow-up review alongside the assessment, if one exists,
      // so its inputs can no longer be changed after sign-off.
      const reviewRef = offeringRef.collection('followUpReview').doc('review');
      const reviewSnap = await reviewRef.get();
      if (reviewSnap.exists) {
        await reviewRef.update({ isLocked: true, updatedAt: now });
      }
    } else if (action === 'submit') {
      // Secretary sends the draft to the head for sign-off.
      await offeringRef.update({
        status: 'pending_head_signoff',
        updatedAt: now,
        updatedBy: user.uid,
      });
    } else if (action === 'return') {
      // Head sends it back to the secretary for edits.
      await offeringRef.update({
        status: 'assessor_review',
        updatedAt: now,
        updatedBy: user.uid,
      });
    } else if (offering.status === 'pending_assessment') {
      // Move to assessor_review on first draft save.
      await offeringRef.update({
        status: 'assessor_review',
        updatedAt: now,
        updatedBy: user.uid,
      });
    }

    // 8. Audit log
    const AUDIT_ACTION: Record<AssessorAction, string> = {
      draft: 'assessment_draft',
      submit: 'assessment_submitted',
      sign: 'sign_off',
      return: 'assessment_returned',
    };
    await db.collection('auditLog').add({
      occurredAt: now,
      actorId: user.uid,
      actorEmail: user.email,
      action: AUDIT_ACTION[action],
      entityType: 'assessments',
      entityId: docId,
      before: null,
      after: { offeringId, action, totalScore: result.totalScore },
    });

    // 9a. On submit, alert the head that a draft is awaiting their sign-off.
    if (action === 'submit' && committee.headUid) {
      const courseCode = (offering.courseCode as string | undefined) ?? '';
      await notifySafely(
        createNotification({
          recipientId: committee.headUid,
          type: 'assessment_awaiting_signoff',
          title: 'มีผลการทวนสอบรอการลงนาม',
          body: `รายวิชา ${courseCode} รอประธานผู้ทวนสอบลงนาม`.trim(),
          relatedOfferingId: offeringId,
        }),
      );
    }

    // 9b. On return, tell the secretary the head sent it back for edits.
    if (action === 'return' && committee.secretaryUid) {
      const courseCode = (offering.courseCode as string | undefined) ?? '';
      await notifySafely(
        createNotification({
          recipientId: committee.secretaryUid,
          type: 'assessment_returned',
          title: 'ผลการทวนสอบถูกส่งกลับให้แก้ไข',
          body: `รายวิชา ${courseCode} ถูกส่งกลับโดยประธานผู้ทวนสอบ`.trim(),
          relatedOfferingId: offeringId,
        }),
      );
    }

    // 9c. On sign-off, notify the lecturer and the program's verifiers.
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
