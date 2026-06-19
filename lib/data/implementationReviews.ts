import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type {
  AssessmentDoc,
  ImplementationReviewDoc,
  OfferingDoc,
} from '@/lib/types/models';

export type OfferingWithId = OfferingDoc & { id: string };
export type AssessmentWithId = AssessmentDoc & { id: string };
export type ImplementationReviewWithId = ImplementationReviewDoc & { id: string };

/**
 * One item in the verification-committee queue: an offering that has been
 * signed off (`assessed`) and is awaiting next-semester follow-up review,
 * paired with its signed assessment and — if it exists — the next-semester
 * offering of the same course.
 */
export interface VerificationContext {
  offering: OfferingWithId;
  assessment: AssessmentWithId | null;
  nextOffering: OfferingWithId | null;
}

/** The next-semester offering that links back to a given offering, if any. */
async function findNextOffering(
  previousOfferingId: string,
): Promise<OfferingWithId | null> {
  const snap = await getAdminDb()
    .collection('offerings')
    .where('previousOfferingId', '==', previousOfferingId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as OfferingDoc) };
}

async function getAssessment(
  offeringId: string,
  assessmentId: string | null,
): Promise<AssessmentWithId | null> {
  if (!assessmentId) return null;
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
 * Offerings in the assessor's programs awaiting next-semester verification.
 * These are offerings with committee/self-only sign-off; once a committee
 * records an implementation review the status moves to
 * `implemented`/`not_implemented` and the offering leaves this queue.
 */
export async function getOfferingsPendingVerification(
  programIds: string[],
): Promise<VerificationContext[]> {
  if (programIds.length === 0) return [];

  const snap = await getAdminDb()
    .collection('offerings')
    .where('programId', 'in', programIds)
    .where('status', 'in', ['assessed', 'assessed_self_only'])
    .get();

  const offerings = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as OfferingDoc) }))
    .filter((o) => o.isActive !== false)
    .sort(
      (a, b) =>
        b.academicYear - a.academicYear ||
        b.semester.localeCompare(a.semester) ||
        a.courseCode.localeCompare(b.courseCode),
    );

  return Promise.all(
    offerings.map(async (offering) => ({
      offering,
      assessment: await getAssessment(offering.id, offering.assessmentId),
      nextOffering: await findNextOffering(offering.id),
    })),
  );
}

/** Full verification context for one offering (detail page). */
export async function getVerificationContext(
  offeringId: string,
): Promise<VerificationContext | null> {
  const snap = await getAdminDb().collection('offerings').doc(offeringId).get();
  if (!snap.exists) return null;
  const offering = { id: snap.id, ...(snap.data() as OfferingDoc) };

  return {
    offering,
    assessment: await getAssessment(offering.id, offering.assessmentId),
    nextOffering: await findNextOffering(offering.id),
  };
}

/** The implementation review recorded for an offering, if one exists. */
export async function getImplementationReview(
  previousOfferingId: string,
): Promise<ImplementationReviewWithId | null> {
  const snap = await getAdminDb()
    .collection('implementationReviews')
    .where('previousOfferingId', '==', previousOfferingId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as ImplementationReviewDoc) };
}
