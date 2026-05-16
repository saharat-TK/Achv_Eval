import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { OfferingDoc, UploadDoc, AiReportDoc } from '@/lib/types/models';

export type OfferingWithId = OfferingDoc & { id: string };
export type UploadWithId = UploadDoc & { id: string };
export type AiReportWithId = AiReportDoc & { id: string };

/**
 * Offerings where the given user is the assigned corresponding lecturer,
 * most recently updated first. Requires the (lecturerId, updatedAt) index.
 */
export async function getOfferingsForLecturer(uid: string): Promise<OfferingWithId[]> {
  const snap = await getAdminDb()
    .collection('offerings')
    .where('lecturerId', '==', uid)
    .orderBy('updatedAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as OfferingDoc) }));
}

export async function getOffering(offeringId: string): Promise<OfferingWithId | null> {
  const snap = await getAdminDb().collection('offerings').doc(offeringId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as OfferingDoc) };
}

/** Non-superseded uploads for an offering. */
export async function getUploadsForOffering(offeringId: string): Promise<UploadWithId[]> {
  const snap = await getAdminDb()
    .collection('offerings')
    .doc(offeringId)
    .collection('uploads')
    .where('isSuperseded', '==', false)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as UploadDoc) }));
}

/** AI reports for an offering, newest version first. */
export async function getAiReportsForOffering(offeringId: string): Promise<AiReportWithId[]> {
  const snap = await getAdminDb()
    .collection('offerings')
    .doc(offeringId)
    .collection('aiReports')
    .orderBy('version', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AiReportDoc) }));
}
