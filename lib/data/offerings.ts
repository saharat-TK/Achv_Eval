import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { OfferingDoc } from '@/lib/types/models';

export type OfferingWithId = OfferingDoc & { id: string };

/**
 * Fetch a single offering server-side (Admin SDK).
 *
 * Lists of offerings/reports are read client-side via realtime listeners
 * (see LecturerOfferingsTable, AiReportsList) so their status updates live.
 */
export async function getOffering(offeringId: string): Promise<OfferingWithId | null> {
  const snap = await getAdminDb().collection('offerings').doc(offeringId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as OfferingDoc) };
}

/**
 * All offerings of a program, newest academic year/semester first, then by
 * course code. Sorted in code so no composite index is needed.
 */
export async function getOfferingsForProgram(
  programId: string,
): Promise<OfferingWithId[]> {
  const snap = await getAdminDb()
    .collection('offerings')
    .where('programId', '==', programId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as OfferingDoc) }))
    .sort(
      (a, b) =>
        b.academicYear - a.academicYear ||
        b.semester.localeCompare(a.semester) ||
        a.courseCode.localeCompare(b.courseCode),
    );
}
