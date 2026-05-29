'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import type { ImplementationDecision, AssessmentDoc } from '@/lib/types/models';

type ScoreKey = keyof AssessmentDoc['scores'];

const VALID_DECISIONS: ImplementationDecision[] = [
  'implemented',
  'partially_implemented',
  'not_implemented',
];

export async function saveFollowUp(
  currentOfferingId: string,
  itemDecisions: Partial<Record<ScoreKey, ImplementationDecision>>,
  itemComments: Partial<Record<ScoreKey, string>>,
  notes: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await getSessionUser();
  if (!user) return { error: 'not_authenticated' };

  const profile = await getCurrentProfile();
  if (!profile) return { error: 'no_profile' };

  const db = getAdminDb();

  // Load the current offering to confirm program membership and get previousOfferingId.
  const offeringSnap = await db.collection('offerings').doc(currentOfferingId).get();
  if (!offeringSnap.exists) return { error: 'offering_not_found' };
  const offering = offeringSnap.data()!;

  const canReview =
    profile.roles.isAdmin ||
    profile.roles.assessorOf.includes(offering.programId);
  if (!canReview) return { error: 'not_authorized' };

  if (!offering.previousOfferingId) return { error: 'no_previous_offering' };

  // Reject edits once the follow-up review has been locked at sign-off.
  const reviewRef = db
    .collection('offerings')
    .doc(currentOfferingId)
    .collection('followUpReview')
    .doc('review');
  const existingReview = await reviewRef.get();
  if (existingReview.exists && existingReview.data()?.isLocked === true) {
    return { error: 'followup_locked' };
  }

  // Validate all provided decisions.
  for (const v of Object.values(itemDecisions)) {
    if (v !== undefined && !VALID_DECISIONS.includes(v as ImplementationDecision)) {
      return { error: 'invalid_decision' };
    }
  }

  // Load the previous offering to get its assessmentId.
  const prevSnap = await db.collection('offerings').doc(offering.previousOfferingId).get();
  if (!prevSnap.exists) return { error: 'previous_offering_not_found' };
  const prevOffering = prevSnap.data()!;

  const now = FieldValue.serverTimestamp();

  try {
    await reviewRef.set({
        previousOfferingId: offering.previousOfferingId,
        previousAssessmentId: prevOffering.assessmentId ?? '',
        programId: offering.programId,
        itemDecisions,
        itemComments,
        notes: notes.trim() || null,
        reviewerId: user.uid,
        reviewerName: profile.nameTh,
        updatedAt: now,
      });

    await db.collection('auditLog').add({
      occurredAt: now,
      actorId: user.uid,
      actorEmail: user.email,
      action: 'followup_review_saved',
      entityType: 'followUpReview',
      entityId: currentOfferingId,
      before: null,
      after: { currentOfferingId, itemDecisions, itemComments, notes: notes.trim() || null },
    });

    revalidatePath(`/assessor/${currentOfferingId}`);
    return { ok: true };
  } catch (err: any) {
    console.error('saveFollowUp error', err);
    return { error: err.message || 'write_failed' };
  }
}
