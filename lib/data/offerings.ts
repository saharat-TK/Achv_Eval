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
