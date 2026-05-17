import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type {
  AssessmentDoc,
  OfferingDoc,
  OfferingStatus,
  UserDoc,
  VerificationDoc,
} from '@/lib/types/models';

export type OfferingWithId = OfferingDoc & { id: string };
export type AssessmentWithId = AssessmentDoc & { id: string };
export type VerificationWithId = VerificationDoc & { id: string };

export interface VerificationQueueItem {
  offering: OfferingWithId;
  assessment: AssessmentWithId | null;
  latestVerification: VerificationWithId | null;
}

const VERIFICATION_STATUSES: OfferingStatus[] = [
  'assessed',
  'verification_review',
  'needs_follow_up',
  'verified',
];

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function getVerificationProgramIds(profile: UserDoc): string[] | null {
  if (profile.roles.isAdmin) return null;
  return unique([
    ...(profile.roles.directorOf ?? []),
    ...(profile.roles.verifierOf ?? []),
  ]);
}

export function canAccessVerificationProgram(
  profile: UserDoc,
  programId: string,
): boolean {
  return (
    profile.roles.isAdmin ||
    (profile.roles.directorOf ?? []).includes(programId) ||
    (profile.roles.verifierOf ?? []).includes(programId)
  );
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

export async function getLatestVerification(
  offeringId: string,
): Promise<VerificationWithId | null> {
  const snap = await getAdminDb()
    .collection('offerings')
    .doc(offeringId)
    .collection('verifications')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as VerificationDoc) };
}

async function buildQueueItem(offering: OfferingWithId): Promise<VerificationQueueItem> {
  const [assessment, latestVerification] = await Promise.all([
    getAssessment(offering.id, offering.assessmentId),
    getLatestVerification(offering.id),
  ]);
  return { offering, assessment, latestVerification };
}

/**
 * Final verification queue after assessor sign-off. Admins see all programs;
 * directors and verification committee members see only their programs.
 */
export async function getVerificationQueue(
  programIds: string[] | null,
): Promise<VerificationQueueItem[]> {
  if (programIds !== null && programIds.length === 0) return [];

  let query = getAdminDb()
    .collection('offerings')
    .where('status', 'in', VERIFICATION_STATUSES);

  if (programIds !== null) {
    query = query.where('programId', 'in', programIds.slice(0, 30));
  }

  const snap = await query.get();
  const offerings = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as OfferingDoc) }))
    .sort(
      (a, b) =>
        b.academicYear - a.academicYear ||
        b.semester.localeCompare(a.semester) ||
        a.courseCode.localeCompare(b.courseCode),
    );

  return Promise.all(offerings.map(buildQueueItem));
}

export async function getVerificationQueueItem(
  offeringId: string,
): Promise<VerificationQueueItem | null> {
  const snap = await getAdminDb().collection('offerings').doc(offeringId).get();
  if (!snap.exists) return null;
  const offering = { id: snap.id, ...(snap.data() as OfferingDoc) };
  return buildQueueItem(offering);
}
