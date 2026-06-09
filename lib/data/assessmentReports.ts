import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import { RUBRIC_TOPICS } from '@/lib/constants';
import type {
  AssessmentDoc,
  AssessmentSummaryReportDoc,
  OfferingDoc,
  ProgramDoc,
  ReportCourseRow,
  ReportScope,
  ReportSnapshot,
  ReportTopicSummary,
  Semester,
} from '@/lib/types/models';

export type ReportWithId = AssessmentSummaryReportDoc & { id: string };

/** Firestore `in` supports up to 30 values. */
function chunk<T>(arr: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Deterministic doc id so creating again overwrites rather than duplicates. */
export function reportDocId(
  academicProgramId: string,
  academicYear: number,
  scope: ReportScope,
  semester: Semester | null,
): string {
  const suffix = scope === 'annual' ? 'annual' : `sem${semester}`;
  return `${academicProgramId}__${academicYear}__${suffix}`;
}

/** Curriculum ids (programs collection) belonging to an academic program. */
async function curriculumIdsOf(
  db: FirebaseFirestore.Firestore,
  academicProgramId: string,
): Promise<string[]> {
  const snap = await db
    .collection('programs')
    .where('parentProgramId', '==', academicProgramId)
    .get();
  return snap.docs.map((d) => d.id);
}

/** All active offerings of an academic program for a year (and optional sem). */
async function offeringsInScope(
  db: FirebaseFirestore.Firestore,
  academicProgramId: string,
  academicYear: number,
  semester: Semester | null,
): Promise<(OfferingDoc & { id: string })[]> {
  const curriculumIds = await curriculumIdsOf(db, academicProgramId);
  if (curriculumIds.length === 0) return [];

  const snaps = await Promise.all(
    chunk(curriculumIds).map((ids) =>
      db
        .collection('offerings')
        .where('programId', 'in', ids)
        .where('academicYear', '==', academicYear)
        .get(),
    ),
  );

  const out: (OfferingDoc & { id: string })[] = [];
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const o = d.data() as OfferingDoc;
      if (o.isActive === false) continue;
      if (semester && o.semester !== semester) continue;
      out.push({ id: d.id, ...o });
    }
  }
  return out;
}

async function lecturerNameOf(
  db: FirebaseFirestore.Firestore,
  o: OfferingDoc,
): Promise<string | null> {
  if (o.lecturerId) {
    const snap = await db.collection('users').doc(o.lecturerId).get();
    const nameTh = snap.exists ? (snap.data()?.nameTh as string | undefined) : undefined;
    return nameTh || o.lecturerEmail || null;
  }
  return o.pendingLecturerEmail || o.lecturerEmail || null;
}

/**
 * Build the frozen snapshot a report renders from: counts, band distribution,
 * per-course rows, and the Section 3.1 aggregation of assessor comments across
 * the 7 rubric topics. Reads each assessed offering's signed assessment.
 */
export async function buildReportSnapshot(
  academicProgramId: string,
  academicYear: number,
  scope: ReportScope,
  semester: Semester | null,
): Promise<ReportSnapshot> {
  const db = getAdminDb();
  const offerings = await offeringsInScope(db, academicProgramId, academicYear, semester);

  const totalOfferings = offerings.length;
  const bandDistribution = { improve: 0, good: 0, excellent: 0 };
  const courseRows: ReportCourseRow[] = [];

  // Per-topic comment buckets, seeded in rubric order.
  const topicMap = new Map<string, ReportTopicSummary>(
    RUBRIC_TOPICS.map((t) => [
      t.key,
      { key: t.key, number: t.number, labelTh: t.labelTh, strengths: [], improvements: [] },
    ]),
  );
  // Per-topic numeric score accumulators (N/A excluded), and overall percents.
  const topicScore = new Map<string, { sum: number; count: number }>(
    RUBRIC_TOPICS.map((t) => [t.key, { sum: 0, count: 0 }]),
  );
  const coursePercents: number[] = [];

  let assessedOfferings = 0;

  for (const o of offerings) {
    const isAssessed = o.status === 'assessed';
    const lecturerName = await lecturerNameOf(db, o);

    let band: ReportCourseRow['band'] = null;
    let percentScore: ReportCourseRow['percentScore'] = null;

    if (isAssessed) {
      assessedOfferings += 1;
      // Prefer the linked assessment; fall back to the latest one.
      let assessment: AssessmentDoc | null = null;
      if (o.assessmentId) {
        const s = await db
          .collection('offerings')
          .doc(o.id)
          .collection('assessments')
          .doc(o.assessmentId)
          .get();
        if (s.exists) assessment = s.data() as AssessmentDoc;
      }
      if (!assessment) {
        const s = await db
          .collection('offerings')
          .doc(o.id)
          .collection('assessments')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        if (!s.empty) assessment = s.docs[0].data() as AssessmentDoc;
      }

      if (assessment) {
        band = assessment.band;
        percentScore = assessment.percentScore;
        bandDistribution[assessment.band] += 1;
        coursePercents.push(assessment.percentScore);
        for (const t of RUBRIC_TOPICS) {
          const key = t.key as keyof AssessmentDoc['scores'];
          const c = assessment.comments?.[key];
          const bucket = topicMap.get(t.key)!;
          const s = c?.strengths?.trim();
          const imp = c?.improvements?.trim();
          if (s) bucket.strengths.push(s);
          if (imp) bucket.improvements.push(imp);
          const score = assessment.scores?.[key];
          if (typeof score === 'number') {
            const acc = topicScore.get(t.key)!;
            acc.sum += score;
            acc.count += 1;
          }
        }
      }
    }

    courseRows.push({
      offeringId: o.id,
      courseCode: o.courseCode,
      courseNameTh: o.courseNameTh,
      courseNameEn: o.courseNameEn,
      semester: o.semester,
      lecturerName,
      assessed: isAssessed,
      band,
      percentScore,
    });
  }

  courseRows.sort(
    (a, b) =>
      Number(a.semester) - Number(b.semester) ||
      a.courseCode.localeCompare(b.courseCode),
  );

  const percent =
    totalOfferings === 0
      ? 0
      : Math.round((1000 * assessedOfferings) / totalOfferings) / 10;

  const overallAveragePercent =
    coursePercents.length === 0
      ? null
      : Math.round(
          (10 * coursePercents.reduce((a, b) => a + b, 0)) / coursePercents.length,
        ) / 10;

  return {
    totalOfferings,
    assessedOfferings,
    percent,
    bandDistribution,
    overallAveragePercent,
    courseRows,
    assessorTopicSummary: RUBRIC_TOPICS.map((t) => {
      const base = topicMap.get(t.key)!;
      const acc = topicScore.get(t.key)!;
      return {
        ...base,
        averageScore: acc.count === 0 ? null : Math.round((10 * acc.sum) / acc.count) / 10,
        scoredCount: acc.count,
      };
    }),
  };
}

/** Lightweight existing-report summary for the list page. */
export interface ReportSummary {
  id: string;
  academicProgramId: string;
  academicYear: number;
  scope: ReportScope;
  semester: Semester | null;
  status: AssessmentSummaryReportDoc['status'];
}

export async function getReportsForAcademicPrograms(
  academicProgramIds: string[],
): Promise<ReportSummary[]> {
  if (academicProgramIds.length === 0) return [];
  const db = getAdminDb();
  const snaps = await Promise.all(
    chunk(academicProgramIds).map((ids) =>
      db.collection('assessmentSummaryReports').where('academicProgramId', 'in', ids).get(),
    ),
  );
  const out: ReportSummary[] = [];
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const r = d.data() as AssessmentSummaryReportDoc;
      out.push({
        id: d.id,
        academicProgramId: r.academicProgramId,
        academicYear: r.academicYear,
        scope: r.scope,
        semester: r.semester,
        status: r.status,
      });
    }
  }
  return out;
}

export interface CourseReportLinks {
  /** AI analysis report PDF — shown as the "draft" report. */
  aiReportUrl: string | null;
  /** Signed combined report PDF — shown as the "final" report. */
  combinedReportUrl: string | null;
}

/**
 * Resolve the downloadable AI-report and combined-report PDF URLs for each
 * offering, keyed by offering id. Reads the latest AI report doc and the
 * signed assessment doc only where their ids exist.
 */
export async function getCourseReportLinks(
  offerings: { id: string; latestAiReportId: string | null; assessmentId: string | null }[],
): Promise<Record<string, CourseReportLinks>> {
  const db = getAdminDb();
  const out: Record<string, CourseReportLinks> = {};
  await Promise.all(
    offerings.map(async (o) => {
      if (!o.latestAiReportId && !o.assessmentId) return;
      const offRef = db.collection('offerings').doc(o.id);
      const [aiSnap, aSnap] = await Promise.all([
        o.latestAiReportId
          ? offRef.collection('aiReports').doc(o.latestAiReportId).get()
          : Promise.resolve(null),
        o.assessmentId
          ? offRef.collection('assessments').doc(o.assessmentId).get()
          : Promise.resolve(null),
      ]);
      const aiReportUrl = (aiSnap?.data()?.reportDownloadUrl as string | undefined) ?? null;
      const combinedReportUrl = (aSnap?.data()?.signedPdfUrl as string | undefined) ?? null;
      if (aiReportUrl || combinedReportUrl) out[o.id] = { aiReportUrl, combinedReportUrl };
    }),
  );
  return out;
}

export async function getReportById(reportId: string): Promise<ReportWithId | null> {
  const snap = await getAdminDb()
    .collection('assessmentSummaryReports')
    .doc(reportId)
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as AssessmentSummaryReportDoc) };
}

/** Resolve an academic program's "code — nameTh" label for denormalization. */
export async function academicProgramLabel(academicProgramId: string): Promise<string> {
  const snap = await getAdminDb()
    .collection('academicPrograms')
    .doc(academicProgramId)
    .get();
  if (!snap.exists) return academicProgramId;
  const d = snap.data() as ProgramDoc;
  return `${d.code} — ${d.nameTh}`;
}
