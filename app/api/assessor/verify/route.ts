import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile, isImpersonating } from '@/lib/firebase/auth-server';
import type { ImplementationDecision } from '@/lib/types/models';

export const runtime = 'nodejs';

const DECISIONS: ImplementationDecision[] = [
  'implemented',
  'partially_implemented',
  'not_implemented',
];

/**
 * POST /api/assessor/verify
 *
 * Records a verification-committee follow-up review: whether the previous
 * semester's improvement recommendations were carried out in the
 * next-semester offering of the same course.
 *
 * Body: { previousOfferingId, decision, notes }
 *
 * Effects: creates an `implementationReviews` document, transitions the
 * previously-assessed offering to `implemented` / `not_implemented`, and
 * stamps the matching `followUpStatus` on its signed assessment.
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
    previousOfferingId: string;
    decision: ImplementationDecision;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { previousOfferingId, decision, notes } = body;

  if (!previousOfferingId || !DECISIONS.includes(decision)) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const db = getAdminDb();

  // 3. Load the previously-assessed offering
  const offeringRef = db.collection('offerings').doc(previousOfferingId);
  const offeringSnap = await offeringRef.get();
  if (!offeringSnap.exists) {
    return NextResponse.json({ error: 'offering_not_found' }, { status: 404 });
  }
  const offering = offeringSnap.data()!;

  // 4. Authorize: caller must be an assessor or committee member of the program
  const canReview =
    profile.roles.assessorOf.includes(offering.programId) ||
    (profile.roles.verifierOf ?? []).includes(offering.programId);
  if (!canReview) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }

  // 5. The offering must be awaiting verification (signed off, not yet reviewed)
  if (offering.status !== 'assessed') {
    return NextResponse.json({ error: 'not_pending_verification' }, { status: 409 });
  }

  // 6. The next-semester offering must exist — it is the context being verified
  const nextSnap = await db
    .collection('offerings')
    .where('previousOfferingId', '==', previousOfferingId)
    .limit(1)
    .get();
  if (nextSnap.empty) {
    return NextResponse.json({ error: 'no_next_offering' }, { status: 409 });
  }
  const newOfferingId = nextSnap.docs[0].id;

  // 7. Guard against a duplicate review
  const existing = await db
    .collection('implementationReviews')
    .where('previousOfferingId', '==', previousOfferingId)
    .limit(1)
    .get();
  if (!existing.empty) {
    return NextResponse.json({ error: 'already_reviewed' }, { status: 409 });
  }

  const now = FieldValue.serverTimestamp();
  // `implemented` is the only fully-positive outcome; partial counts as not
  // implemented for the advisory status gate, the nuance lives in `decision`.
  const newStatus =
    decision === 'implemented' ? 'implemented' : 'not_implemented';

  try {
    // 8. Create the implementation review
    const reviewRef = await db.collection('implementationReviews').add({
      previousAssessmentId: offering.assessmentId ?? '',
      previousOfferingId,
      newOfferingId,
      programId: offering.programId,
      decision,
      reviewerId: user.uid,
      reviewerName: profile.nameTh,
      notes: notes?.trim() || null,
      reviewedAt: now,
    });

    // 9. Transition the previous offering
    await offeringRef.update({
      status: newStatus,
      updatedAt: now,
      updatedBy: user.uid,
    });

    // 10. Stamp the assessment's follow-up status
    if (offering.assessmentId) {
      await offeringRef
        .collection('assessments')
        .doc(offering.assessmentId)
        .update({ followUpStatus: newStatus, updatedAt: now });
    }

    // 11. Audit log
    await db.collection('auditLog').add({
      occurredAt: now,
      actorId: user.uid,
      actorEmail: user.email,
      action: 'implementation_review',
      entityType: 'implementationReviews',
      entityId: reviewRef.id,
      before: null,
      after: { previousOfferingId, newOfferingId, decision },
    });

    return NextResponse.json({ ok: true, reviewId: reviewRef.id });
  } catch (err: any) {
    console.error('verification submit error', err);
    return NextResponse.json(
      { error: err.message || 'write_failed' },
      { status: 500 },
    );
  }
}
