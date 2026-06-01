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
  const offering = { id: snap.id, ...(snap.data() as OfferingDoc) };
  if (typeof offering.analysisAttemptCount !== 'number') {
    const reports = await snap.ref.collection('aiReports').count().get();
    offering.analysisAttemptCount = Math.min(
      reports.data().count,
      offering.analysisAttemptLimit ?? 4,
    );
  }
  return offering;
}

/**
 * Summary counts for a lecturer's offering list — used for the KPI strip on
 * the lecturer dashboard. Fetched once server-side; the live table uses its
 * own onSnapshot so no extra query is needed for real-time data.
 */
export async function getLecturerOfferingCounts(uid: string): Promise<{
  total: number;
  pendingDocs: number;     // draft | documents_pending | ready_for_ai | ai_in_progress
  aiDone: number;          // ai_complete (analysis ready, not yet at assessor)
  awaitingAssessor: number; // pending_assessment | assessor_review
  assessed: number;        // assessed and beyond
}> {
  const snap = await getAdminDb()
    .collection('offerings')
    .where('lecturerId', '==', uid)
    .get();

  const statuses = snap.docs
    .map((d) => (d.data() as OfferingDoc).status)
    .filter((_, i) => snap.docs[i].data().isActive !== false);

  return {
    total: statuses.length,
    pendingDocs: statuses.filter((s) =>
      ['draft', 'documents_pending', 'ready_for_ai', 'ai_in_progress'].includes(s),
    ).length,
    aiDone: statuses.filter((s) => s === 'ai_complete').length,
    awaitingAssessor: statuses.filter((s) =>
      ['pending_assessment', 'assessor_review'].includes(s),
    ).length,
    assessed: statuses.filter((s) =>
      [
        'assessed',
        'verification_review',
        'verified',
        'needs_follow_up',
        'pending_review_next_semester',
        'implemented',
        'not_implemented',
      ].includes(s),
    ).length,
  };
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
