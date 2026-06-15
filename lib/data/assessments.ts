import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { AssessmentDoc, FollowUpReviewDoc, OfferingDoc } from '@/lib/types/models';

export type OfferingWithId = OfferingDoc & { id: string };
export type AssessmentWithId = AssessmentDoc & { id: string };
export type FollowUpReviewWithId = FollowUpReviewDoc & { id: string };

/**
 * Fetch offerings for a set of programs with statuses relevant to an assessor.
 * Returns offerings where status is pending_assessment, assessor_review, or assessed.
 */
export async function getOfferingsForAssessor(
  programIds: string[],
): Promise<OfferingWithId[]> {
  if (programIds.length === 0) return [];

  const ASSESSOR_STATUSES = [
    'pending_assessment',
    'assessor_review',
    'pending_head_signoff',
    'assessed',
  ];
  const db = getAdminDb();

  // Firestore `in` supports up to 30 values; programIds is typically 1-3.
  const snap = await db
    .collection('offerings')
    .where('programId', 'in', programIds)
    .where('status', 'in', ASSESSOR_STATUSES)
    .orderBy('academicYear', 'desc')
    .orderBy('semester', 'desc')
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as OfferingDoc) }))
    .filter((o) => o.isActive !== false);
}

/**
 * Fetch a specific assessment by its ID.
 */
export async function getAssessmentById(
  offeringId: string,
  assessmentId: string,
): Promise<AssessmentWithId | null> {
  const snap = await getAdminDb()
    .collection('offerings')
    .doc(offeringId)
    .collection('assessments')
    .doc(assessmentId)
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as AssessmentDoc) };
}

/**
 * Fetch the follow-up review recorded by the assessor on a given offering,
 * if one has been saved.
 */
export async function getFollowUpReview(
  offeringId: string,
): Promise<FollowUpReviewDoc | null> {
  const snap = await getAdminDb()
    .collection('offerings')
    .doc(offeringId)
    .collection('followUpReview')
    .doc('review')
    .get();
  if (!snap.exists) return null;
  return snap.data() as FollowUpReviewDoc;
}

/**
 * Fetch the latest assessment for a given offering, if one exists.
 */
export async function getLatestAssessment(
  offeringId: string,
): Promise<AssessmentWithId | null> {
  const snap = await getAdminDb()
    .collection('offerings')
    .doc(offeringId)
    .collection('assessments')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as AssessmentDoc) };
}
