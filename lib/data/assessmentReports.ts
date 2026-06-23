import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import { RUBRIC_TOPICS, SIGNED_OFF_STATUSES, isCommitteeSignOff } from '@/lib/constants';
import { bandFromPercent } from '@/lib/types/models';
import type {
  AssessmentBand,
  AssessmentDoc,
  AssessmentSummaryReportDoc,
  OfferingDoc,
  ProgramDoc,
  ProgramRollupRow,
  ReportCourseRow,
  ReportCoverage,
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

/** Read an offering's signed assessment (linked, else latest), or null. */
async function readAssessment(
  db: FirebaseFirestore.Firestore,
  offeringId: string,
  assessmentId: string | null | undefined,
): Promise<AssessmentDoc | null> {
  const col = db.collection('offerings').doc(offeringId).collection('assessments');
  if (assessmentId) {
    const s = await col.doc(assessmentId).get();
    if (s.exists) return s.data() as AssessmentDoc;
  }
  const s = await col.orderBy('createdAt', 'desc').limit(1).get();
  return s.empty ? null : (s.docs[0].data() as AssessmentDoc);
}

/** Mutable accumulators shared by the per-program and all-programs builders. */
interface SnapshotAcc {
  bandDistribution: { improve: number; good: number; excellent: number };
  topicMap: Map<string, ReportTopicSummary>;
  topicScore: Map<string, { sum: number; count: number }>;
  coursePercents: number[];
}

function newAcc(): SnapshotAcc {
  return {
    bandDistribution: { improve: 0, good: 0, excellent: 0 },
    topicMap: new Map(
      RUBRIC_TOPICS.map((t) => [
        t.key,
        { key: t.key, number: t.number, labelTh: t.labelTh, strengths: [], improvements: [] },
      ]),
    ),
    topicScore: new Map(RUBRIC_TOPICS.map((t) => [t.key, { sum: 0, count: 0 }])),
    coursePercents: [],
  };
}

/** Fold one signed assessment into the shared accumulators. */
function accumulate(acc: SnapshotAcc, assessment: AssessmentDoc): void {
  acc.bandDistribution[assessment.band] += 1;
  acc.coursePercents.push(assessment.percentScore);
  for (const t of RUBRIC_TOPICS) {
    const key = t.key as keyof AssessmentDoc['scores'];
    const c = assessment.comments?.[key];
    const bucket = acc.topicMap.get(t.key)!;
    const s = c?.strengths?.trim();
    const imp = c?.improvements?.trim();
    if (s) bucket.strengths.push(s);
    if (imp) bucket.improvements.push(imp);
    const score = assessment.scores?.[key];
    if (typeof score === 'number') {
      const sc = acc.topicScore.get(t.key)!;
      sc.sum += score;
      sc.count += 1;
    }
  }
}

function topicSummaries(acc: SnapshotAcc): ReportTopicSummary[] {
  return RUBRIC_TOPICS.map((t) => {
    const base = acc.topicMap.get(t.key)!;
    const sc = acc.topicScore.get(t.key)!;
    return {
      ...base,
      averageScore: sc.count === 0 ? null : Math.round((10 * sc.sum) / sc.count) / 10,
      scoredCount: sc.count,
    };
  });
}

const mean1 = (xs: number[]): number | null =>
  xs.length === 0 ? null : Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10;

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

  const acc = newAcc();
  const courseRows: ReportCourseRow[] = [];
  let assessedOfferings = 0;

  for (const o of offerings) {
    const isSignedOff = SIGNED_OFF_STATUSES.includes(o.status);
    const lecturerName = await lecturerNameOf(db, o);
    let band: ReportCourseRow['band'] = null;
    let percentScore: ReportCourseRow['percentScore'] = null;

    if (isSignedOff) {
      assessedOfferings += 1;
      const assessment = await readAssessment(db, o.id, o.assessmentId);
      if (assessment && isCommitteeSignOff(assessment.signOffKind)) {
        band = assessment.band;
        percentScore = assessment.percentScore;
        accumulate(acc, assessment);
      }
    }

    courseRows.push({
      offeringId: o.id,
      courseCode: o.courseCode,
      courseNameTh: o.courseNameTh,
      courseNameEn: o.courseNameEn,
      part: o.part ?? null,
      semester: o.semester,
      lecturerName,
      assessed: isSignedOff,
      band,
      percentScore,
    });
  }

  courseRows.sort(
    (a, b) =>
      Number(a.semester) - Number(b.semester) || a.courseCode.localeCompare(b.courseCode),
  );

  const totalOfferings = offerings.length;
  return {
    totalOfferings,
    assessedOfferings,
    percent: totalOfferings === 0 ? 0 : Math.round((1000 * assessedOfferings) / totalOfferings) / 10,
    bandDistribution: acc.bandDistribution,
    overallAveragePercent: mean1(acc.coursePercents),
    courseRows,
    assessorTopicSummary: topicSummaries(acc),
  };
}

/**
 * Build the school-wide snapshot: one accumulator across every given program,
 * a per-program rollup table, and per-course rows tagged with their program.
 */
export async function buildAllProgramsSnapshot(
  programs: { id: string; code: string; nameTh: string }[],
  academicYear: number,
  scope: ReportScope,
  semester: Semester | null,
): Promise<ReportSnapshot> {
  const db = getAdminDb();
  const acc = newAcc();
  const courseRows: ReportCourseRow[] = [];
  const programRollup: ProgramRollupRow[] = [];
  let totalOfferings = 0;
  let assessedOfferings = 0;

  for (const p of programs) {
    const offerings = await offeringsInScope(db, p.id, academicYear, semester);
    let pAssessed = 0;
    const pPercents: number[] = [];

    for (const o of offerings) {
      const isSignedOff = SIGNED_OFF_STATUSES.includes(o.status);
      const lecturerName = await lecturerNameOf(db, o);
      let band: ReportCourseRow['band'] = null;
      let percentScore: ReportCourseRow['percentScore'] = null;

      if (isSignedOff) {
        pAssessed += 1;
        const assessment = await readAssessment(db, o.id, o.assessmentId);
        if (assessment && isCommitteeSignOff(assessment.signOffKind)) {
          band = assessment.band;
          percentScore = assessment.percentScore;
          pPercents.push(assessment.percentScore);
          accumulate(acc, assessment);
        }
      }

      courseRows.push({
        offeringId: o.id,
        courseCode: o.courseCode,
        courseNameTh: o.courseNameTh,
        courseNameEn: o.courseNameEn,
        part: o.part ?? null,
        semester: o.semester,
        lecturerName,
        assessed: isSignedOff,
        band,
        percentScore,
        status: o.status,
        academicYear: o.academicYear,
        academicProgramId: p.id,
        academicProgramCode: p.code,
        academicProgramName: p.nameTh,
      });
    }

    totalOfferings += offerings.length;
    assessedOfferings += pAssessed;
    const avgScorePercent = mean1(pPercents);
    programRollup.push({
      academicProgramId: p.id,
      code: p.code,
      name: p.nameTh,
      totalOfferings: offerings.length,
      assessedOfferings: pAssessed,
      assessedPercent:
        offerings.length === 0 ? 0 : Math.round((1000 * pAssessed) / offerings.length) / 10,
      avgScorePercent,
      band: avgScorePercent == null ? null : bandFromPercent(avgScorePercent),
    });
  }

  programRollup.sort((a, b) => a.code.localeCompare(b.code));
  courseRows.sort(
    (a, b) =>
      (a.academicProgramCode ?? '').localeCompare(b.academicProgramCode ?? '') ||
      Number(a.semester) - Number(b.semester) ||
      a.courseCode.localeCompare(b.courseCode),
  );

  return {
    totalOfferings,
    assessedOfferings,
    percent: totalOfferings === 0 ? 0 : Math.round((1000 * assessedOfferings) / totalOfferings) / 10,
    bandDistribution: acc.bandDistribution,
    overallAveragePercent: mean1(acc.coursePercents),
    courseRows,
    assessorTopicSummary: topicSummaries(acc),
    programRollup,
  };
}

/** Lightweight existing-report summary for the list page. */
export interface ReportSummary {
  id: string;
  academicProgramId: string;
  coverage: ReportCoverage;
  academicYear: number;
  scope: ReportScope;
  semester: Semester | null;
  status: AssessmentSummaryReportDoc['status'];
  /** True when a director has used their one generation and must be reset. */
  directorLocked: boolean;
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
        coverage: r.coverage ?? 'program',
        academicYear: r.academicYear,
        scope: r.scope,
        semester: r.semester,
        status: r.status,
        directorLocked: r.directorLocked === true,
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
  /** Assessment result (from the signed assessment), null if not assessed. */
  totalScore: number | null;
  maxScore: number | null;
  percentScore: number | null;
  band: AssessmentBand | null;
}

/**
 * Resolve per-offering report links and the signed assessment result, keyed by
 * offering id. Reads the latest AI report doc and the signed assessment doc
 * only where their ids exist.
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
      const a = aSnap?.data() as AssessmentDoc | undefined;
      const committee = a ? isCommitteeSignOff(a.signOffKind) : false;
      const combinedReportUrl = a?.signedPdfUrl ?? null;
      const info: CourseReportLinks = {
        aiReportUrl,
        combinedReportUrl,
        totalScore: committee ? a?.totalScore ?? null : null,
        maxScore: committee ? a?.maxScore ?? null : null,
        percentScore: committee ? a?.percentScore ?? null : null,
        band: committee ? a?.band ?? null : null,
      };
      if (aiReportUrl || combinedReportUrl || a) out[o.id] = info;
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
