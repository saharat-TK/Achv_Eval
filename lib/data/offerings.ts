import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { OfferingDoc, AiRubricSuggestion } from '@/lib/types/models';

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
 * The 7 rubric evaluations from the offering's latest AI report (section 4).
 * Used to pre-fill the assessor's form with an editable AI draft.
 */
export async function getAiRubricSuggestions(
  offeringId: string,
  latestAiReportId: string | null,
): Promise<AiRubricSuggestion[] | null> {
  if (!latestAiReportId) return null;
  const snap = await getAdminDb()
    .collection('offerings')
    .doc(offeringId)
    .collection('aiReports')
    .doc(latestAiReportId)
    .get();

  const out = snap.data()?.structuredOutput as
    | { section4Verification?: { items?: AiRubricSuggestion[] } }
    | undefined;
  const items = out?.section4Verification?.items;
  if (!Array.isArray(items)) return null;

  return items.map((it) => ({
    key: String(it.key),
    score: Number(it.score) || 0,
    strengths: it.strengths ?? '',
    improvements: it.improvements ?? '',
  }));
}
