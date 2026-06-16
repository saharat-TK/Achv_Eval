'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile, isImpersonating } from '@/lib/firebase/auth-server';
import { deleteStoredPdf } from '@/lib/data/reportStorage';
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
  if (await isImpersonating()) return { error: 'read_only_impersonation' };

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

/**
 * Reverses a signed-off (`assessed`) offering back to `pending_assessment` so it
 * can be re-assessed. Super-admin only — voiding a signed verification is a
 * sensitive action. Unlocks the assessment and its follow-up review, clears the
 * signature + report link, deletes the stored combined PDF (best-effort; the
 * voided report must not remain reachable by its token URL), and re-opens the
 * offering. Re-signing regenerates a fresh report.
 */
export async function reverseAssessedSignOff(
  offeringId: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await getSessionUser();
  if (!user) return { error: 'not_authenticated' };
  const profile = await getCurrentProfile();
  if (!profile) return { error: 'no_profile' };
  if (profile.roles.isSuperAdmin !== true) return { error: 'not_authorized' };

  const db = getAdminDb();
  const offeringRef = db.collection('offerings').doc(offeringId);
  const KNOWN_ERRORS = ['offering_not_found', 'not_assessed', 'assessment_not_found'];

  let pdf: { path: string; url: string | null } | null = null;
  try {
    await db.runTransaction(async (tx) => {
      const offeringSnap = await tx.get(offeringRef);
      if (!offeringSnap.exists) throw new Error('offering_not_found');
      const offering = offeringSnap.data()!;
      if (offering.status !== 'assessed') throw new Error('not_assessed');
      if (!offering.assessmentId) throw new Error('assessment_not_found');

      const assessmentRef = offeringRef
        .collection('assessments')
        .doc(offering.assessmentId);
      const reviewRef = offeringRef.collection('followUpReview').doc('review');

      // All reads must precede writes within the transaction.
      const assessmentSnap = await tx.get(assessmentRef);
      if (!assessmentSnap.exists) throw new Error('assessment_not_found');
      const reviewSnap = await tx.get(reviewRef);

      const a = assessmentSnap.data() as {
        signedPdfStoragePath?: string | null;
        signedPdfUrl?: string | null;
      };
      if (a.signedPdfStoragePath) {
        pdf = { path: a.signedPdfStoragePath, url: a.signedPdfUrl ?? null };
      }

      const now = FieldValue.serverTimestamp();
      tx.update(assessmentRef, {
        isLocked: false,
        signedAt: null,
        followUpStatus: null,
        signedPdfStoragePath: null,
        signedPdfUrl: null,
        updatedAt: now,
      });
      if (reviewSnap.exists) {
        tx.update(reviewRef, { isLocked: false, updatedAt: now });
      }
      tx.update(offeringRef, {
        status: 'pending_assessment',
        updatedAt: now,
        updatedBy: user.uid,
      });
    });
  } catch (err: any) {
    if (KNOWN_ERRORS.includes(err?.message)) return { error: err.message };
    console.error('reverseAssessedSignOff error', err);
    return { error: 'reverse_failed' };
  }

  // Storage is not transactional — delete the voided report after the commit.
  if (pdf) await deleteStoredPdf(pdf);

  await db.collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: user.uid,
    actorEmail: user.email,
    action: 'assessment_signoff_reversed',
    entityType: 'offerings',
    entityId: offeringId,
    before: null,
    after: { targetStatus: 'pending_assessment' },
  });

  revalidatePath(`/assessor/${offeringId}`);
  return { ok: true };
}
