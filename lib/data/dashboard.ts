import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type {
  AssessmentBand,
  AssessmentDoc,
  OfferingDoc,
  OfferingStatus,
  ProgramDoc,
  RubricScore,
  Semester,
} from '@/lib/types/models';

export type ProgramWithId = ProgramDoc & { id: string };
export type OfferingWithId = OfferingDoc & { id: string };
export type AssessmentWithId = AssessmentDoc & { id: string };

export interface DashboardProgramRow {
  programId: string;
  code: string;
  nameTh: string;
  totalOfferings: number;
  aiCompleted: number;
  assessed: number;
  finalVerified: number;
  needsFollowUp: number;
  /** # offerings with a saved follow-up review (assessor's next-semester follow-up). */
  followUpCompleted: number;
  averagePercentScore: number | null;
  /** # offerings with a signed assessment — denominator used when averaging scores. */
  signedCount: number;
}

export interface DashboardAttentionItem {
  offeringId: string;
  programId: string;
  courseCode: string;
  courseNameTh: string;
  academicYear: number;
  semester: OfferingDoc['semester'];
  section: string;
  status: OfferingStatus;
  percentScore: number | null;
  band: AssessmentBand | null;
  reason: string;
}

export interface RubricAverage {
  key: keyof AssessmentDoc['scores'];
  number: string;
  labelTh: string;
  averageScore: number;
  count: number;
}

/** One (academic year, semester) term in the cross-semester trend. */
export interface DashboardTrendPoint {
  termKey: string; // "2568-2"
  label: string; // "2568/2"
  academicYear: number;
  semester: Semester;
  totalOfferings: number;
  assessedCount: number; // # offerings in an assessed/verified state
  completionRate: number; // 0–100, assessed ÷ total
  averagePercentScore: number | null;
  excellent: number;
  good: number;
  improve: number;
}

/** One course where a rubric item scored at the lowest level. */
export interface WeaknessCourse {
  offeringId: string;
  programId: string;
  courseCode: string;
  courseNameTh: string;
  academicYear: number;
  semester: Semester;
  section: string;
}

/** A rubric item that recurs as a low score across courses. */
export interface RecurringWeakness {
  key: keyof AssessmentDoc['scores'];
  number: string;
  labelTh: string;
  lowCount: number; // # signed assessments scoring this item 1
  scoredCount: number; // # signed assessments where the item is not N/A
  lowRate: number; // 0–100, lowCount ÷ scoredCount
  affectedCourses: WeaknessCourse[];
}

export interface ExecutiveDashboardData {
  availableAcademicYears: number[];
  trend: DashboardTrendPoint[];
  recurringWeaknesses: RecurringWeakness[];
  summary: {
    totalPrograms: number;
    totalOfferings: number;
    aiCompleted: number;
    assessed: number;
    finalVerified: number;
    needsFollowUp: number;
    followUpCompleted: number;
    averagePercentScore: number | null;
    implementationRate: number | null;
  };
  statusCounts: Partial<Record<OfferingStatus, number>>;
  bandCounts: Record<AssessmentBand, number>;
  programRows: DashboardProgramRow[];
  weakestRubricItems: RubricAverage[];
  attentionItems: DashboardAttentionItem[];
}

export interface DashboardFilters {
  departmentId?: string;
  academicProgramId?: string; // parentProgramId on ProgramDoc
  programId?: string;
  academicYear?: number;
  semester?: Semester;
}

const AI_COMPLETED_STATUSES: OfferingStatus[] = [
  'ai_complete',
  'pending_assessment',
  'assessor_review',
  'assessed',
  'verification_review',
  'verified',
  'needs_follow_up',
  'pending_review_next_semester',
  'implemented',
  'not_implemented',
];

const ASSESSED_STATUSES: OfferingStatus[] = [
  'assessed',
  'verification_review',
  'verified',
  'needs_follow_up',
  'pending_review_next_semester',
  'implemented',
  'not_implemented',
];

const FINAL_VERIFIED_STATUSES: OfferingStatus[] = ['verified', 'needs_follow_up'];

const FOLLOW_UP_STATUSES: OfferingStatus[] = [
  'needs_follow_up',
  'pending_review_next_semester',
  'not_implemented',
];

const ACTIONABLE_STATUSES: OfferingStatus[] = [
  'ai_complete',
  'pending_assessment',
  'assessor_review',
  'needs_follow_up',
  'pending_review_next_semester',
  'not_implemented',
];

const RUBRIC_ITEMS: {
  key: keyof AssessmentDoc['scores'];
  number: string;
  labelTh: string;
}[] = [
  { key: 'item1Clo', number: '1', labelTh: 'ผลลัพธ์การเรียนรู้รายวิชา' },
  { key: 'item21Content', number: '2.1', labelTh: 'เนื้อหาการเรียนการสอน' },
  { key: 'item22Methods', number: '2.2', labelTh: 'วิธีการเรียนการสอน' },
  {
    key: 'item31AssessmentMethods',
    number: '3.1',
    labelTh: 'วิธีการวัดและประเมินผล',
  },
  { key: 'item32AssessmentForms', number: '3.2', labelTh: 'รูปแบบการประเมินผล' },
  {
    key: 'item33Proportions',
    number: '3.3',
    labelTh: 'สัดส่วนในแต่ละวิธีการวัดและประเมินผล',
  },
  { key: 'item34ExamQuality', number: '3.4', labelTh: 'คุณภาพข้อสอบ' },
];

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function numericScore(score: RubricScore): number | null {
  return score === 'na' ? null : score;
}

function assessmentReason(
  offering: OfferingWithId,
  assessment: AssessmentWithId | null,
): string | null {
  if (offering.status === 'ai_complete') return 'รออาจารย์ส่งผลเพื่อทวนสอบ';
  if (offering.status === 'pending_assessment') return 'รอผู้ทวนสอบเริ่มประเมิน';
  if (offering.status === 'assessor_review') return 'รอผู้ทวนสอบลงนาม';
  if (offering.status === 'needs_follow_up') return 'รับรองแบบมีเงื่อนไข';
  if (offering.status === 'pending_review_next_semester') {
    return 'รอติดตามภาคการศึกษาถัดไป';
  }
  if (offering.status === 'not_implemented') return 'ยังไม่ดำเนินการตามข้อเสนอแนะ';
  if (assessment && assessment.percentScore < 70) return 'คะแนนทวนสอบต่ำกว่า 70%';
  return null;
}

function buildTrend(
  offerings: OfferingWithId[],
  assessmentByOffering: Map<string, AssessmentWithId | null>,
): DashboardTrendPoint[] {
  const groups = new Map<string, OfferingWithId[]>();
  for (const offering of offerings) {
    const key = `${offering.academicYear}-${offering.semester}`;
    const group = groups.get(key);
    if (group) group.push(offering);
    else groups.set(key, [offering]);
  }

  return [...groups.entries()]
    .map(([termKey, group]) => {
      const { academicYear, semester } = group[0];
      const signed = group
        .map((offering) => assessmentByOffering.get(offering.id))
        .filter((a): a is AssessmentWithId => Boolean(a?.isLocked));
      const assessedCount = group.filter((o) =>
        ASSESSED_STATUSES.includes(o.status),
      ).length;
      const bands: Record<AssessmentBand, number> = {
        excellent: 0,
        good: 0,
        improve: 0,
      };
      for (const assessment of signed) bands[assessment.band] += 1;
      return {
        termKey,
        label: `${academicYear}/${semester}`,
        academicYear,
        semester,
        totalOfferings: group.length,
        assessedCount,
        completionRate: Math.round((assessedCount / group.length) * 1000) / 10,
        averagePercentScore: average(signed.map((a) => a.percentScore)),
        excellent: bands.excellent,
        good: bands.good,
        improve: bands.improve,
      };
    })
    .sort(
      (a, b) =>
        a.academicYear - b.academicYear || a.semester.localeCompare(b.semester),
    );
}

function buildRecurringWeaknesses(
  offerings: OfferingWithId[],
  assessmentByOffering: Map<string, AssessmentWithId | null>,
): RecurringWeakness[] {
  return RUBRIC_ITEMS.map((item) => {
    let scoredCount = 0;
    const affectedCourses: WeaknessCourse[] = [];
    for (const offering of offerings) {
      const assessment = assessmentByOffering.get(offering.id);
      if (!assessment?.isLocked) continue;
      const score = assessment.scores[item.key];
      if (score === undefined || score === 'na') continue;
      scoredCount += 1;
      if (score === 1) {
        affectedCourses.push({
          offeringId: offering.id,
          programId: offering.programId,
          courseCode: offering.courseCode,
          courseNameTh: offering.courseNameTh,
          academicYear: offering.academicYear,
          semester: offering.semester,
          section: offering.section,
        });
      }
    }
    return {
      ...item,
      lowCount: affectedCourses.length,
      scoredCount,
      lowRate:
        scoredCount === 0
          ? 0
          : Math.round((affectedCourses.length / scoredCount) * 1000) / 10,
      affectedCourses,
    };
  })
    .filter((weakness) => weakness.lowCount > 0)
    .sort((a, b) => b.lowCount - a.lowCount || b.lowRate - a.lowRate);
}

function sortOfferings(a: OfferingWithId, b: OfferingWithId): number {
  return (
    b.academicYear - a.academicYear ||
    b.semester.localeCompare(a.semester) ||
    a.courseCode.localeCompare(b.courseCode) ||
    a.section.localeCompare(b.section)
  );
}

async function getOfferingsForPrograms(programIds: string[]): Promise<OfferingWithId[]> {
  if (programIds.length === 0) return [];

  const db = getAdminDb();
  const snaps = await Promise.all(
    chunks(programIds, 30).map((ids) =>
      db.collection('offerings').where('programId', 'in', ids).get(),
    ),
  );

  return snaps
    .flatMap((snap) =>
      snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as OfferingDoc) })),
    )
    .sort(sortOfferings);
}

function toMillis(value: unknown): number {
  if (
    value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/**
 * Resolves the relevant assessment for every offering using one
 * collection-group query per 30-id chunk — instead of a read per offering.
 * The linked assessment (offering.assessmentId) wins; otherwise the latest
 * assessment is used once the offering has reached an assessment stage.
 */
async function getAssessmentsByOffering(
  offerings: OfferingWithId[],
): Promise<Map<string, AssessmentWithId | null>> {
  const result = new Map<string, AssessmentWithId | null>();
  if (offerings.length === 0) return result;

  const db = getAdminDb();
  const snaps = await Promise.all(
    chunks(
      offerings.map((offering) => offering.id),
      30,
    ).map((ids) =>
      db.collectionGroup('assessments').where('offeringId', 'in', ids).get(),
    ),
  );

  const byOffering = new Map<string, AssessmentWithId[]>();
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const data = doc.data() as AssessmentDoc;
      const list = byOffering.get(data.offeringId) ?? [];
      list.push({ id: doc.id, ...data });
      byOffering.set(data.offeringId, list);
    }
  }

  for (const offering of offerings) {
    const list = byOffering.get(offering.id) ?? [];
    let picked: AssessmentWithId | null = null;
    if (offering.assessmentId) {
      picked = list.find((a) => a.id === offering.assessmentId) ?? null;
    }
    if (
      !picked &&
      ['assessor_review', ...ASSESSED_STATUSES].includes(offering.status)
    ) {
      picked =
        [...list].sort(
          (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt),
        )[0] ?? null;
    }
    result.set(offering.id, picked);
  }
  return result;
}

/**
 * Returns the set of offeringIds that have a saved follow-up review doc
 * (`offerings/{id}/followUpReview/review`). Uses one collection-group query;
 * the offeringId is resolved from each doc's grandparent ref. Callers
 * intersect this with their already-filtered offering scope.
 */
async function getOfferingsWithFollowUp(): Promise<Set<string>> {
  const db = getAdminDb();
  const snap = await db.collectionGroup('followUpReview').get();
  const result = new Set<string>();
  for (const doc of snap.docs) {
    const offeringId = doc.ref.parent.parent?.id;
    if (offeringId) result.add(offeringId);
  }
  return result;
}

export async function getExecutiveDashboardData(
  programs: ProgramWithId[],
  filters: DashboardFilters = {},
): Promise<ExecutiveDashboardData> {
  // Apply department / academic-program filters first to narrow the program scope.
  let scopedPrograms = programs;
  if (filters.departmentId) {
    scopedPrograms = scopedPrograms.filter(
      (p) => p.departmentId === filters.departmentId,
    );
  }
  if (filters.academicProgramId) {
    scopedPrograms = scopedPrograms.filter(
      (p) => p.parentProgramId === filters.academicProgramId,
    );
  }

  const programIds = scopedPrograms.map((program) => program.id);
  const allOfferings = await getOfferingsForPrograms(programIds);
  const availableAcademicYears = [
    ...new Set(allOfferings.map((offering) => offering.academicYear)),
  ].sort((a, b) => b - a);
  const visiblePrograms = filters.programId
    ? scopedPrograms.filter((program) => program.id === filters.programId)
    : scopedPrograms;
  // Program-scoped (but every term): the basis for the cross-semester trend.
  const programScopedOfferings = filters.programId
    ? allOfferings.filter((offering) => offering.programId === filters.programId)
    : allOfferings;
  // Snapshot scope: also constrained by the year/semester filters.
  const offerings = programScopedOfferings.filter((offering) => {
    if (
      filters.academicYear &&
      offering.academicYear !== filters.academicYear
    ) {
      return false;
    }
    if (filters.semester && offering.semester !== filters.semester) return false;
    return true;
  });
  const assessmentByOffering = await getAssessmentsByOffering(
    programScopedOfferings,
  );
  const followUpOfferingIds = await getOfferingsWithFollowUp();
  const trend = buildTrend(programScopedOfferings, assessmentByOffering);

  const statusCounts: Partial<Record<OfferingStatus, number>> = {};
  for (const offering of offerings) {
    statusCounts[offering.status] = (statusCounts[offering.status] ?? 0) + 1;
  }

  const signedAssessments = offerings
    .map((offering) => assessmentByOffering.get(offering.id))
    .filter((assessment): assessment is AssessmentWithId =>
      Boolean(assessment?.isLocked),
    );
  const percentScores = signedAssessments.map((assessment) => assessment.percentScore);
  const implementedCount = offerings.filter((o) => o.status === 'implemented').length;
  const reviewedImplementationCount = offerings.filter((o) =>
    ['implemented', 'not_implemented'].includes(o.status),
  ).length;

  const bandCounts: Record<AssessmentBand, number> = {
    excellent: 0,
    good: 0,
    improve: 0,
  };
  for (const assessment of signedAssessments) {
    bandCounts[assessment.band] += 1;
  }

  const rubricAverages = RUBRIC_ITEMS.map((item) => {
    const values = signedAssessments
      .map((assessment) => numericScore(assessment.scores[item.key]))
      .filter((score): score is number => score !== null);
    return {
      ...item,
      averageScore: average(values) ?? 0,
      count: values.length,
    };
  })
    .filter((item) => item.count > 0)
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, 4);

  const programRows = visiblePrograms.map((program) => {
    const programOfferings = offerings.filter((o) => o.programId === program.id);
    const programScores = programOfferings
      .map((offering) => {
        const assessment = assessmentByOffering.get(offering.id);
        return assessment?.isLocked ? assessment.percentScore : undefined;
      })
      .filter((score): score is number => typeof score === 'number');

    return {
      programId: program.id,
      code: program.code,
      nameTh: program.nameTh,
      totalOfferings: programOfferings.length,
      aiCompleted: programOfferings.filter((o) => AI_COMPLETED_STATUSES.includes(o.status))
        .length,
      assessed: programOfferings.filter((o) => ASSESSED_STATUSES.includes(o.status)).length,
      finalVerified: programOfferings.filter((o) =>
        FINAL_VERIFIED_STATUSES.includes(o.status),
      ).length,
      needsFollowUp: programOfferings.filter((o) => FOLLOW_UP_STATUSES.includes(o.status))
        .length,
      followUpCompleted: programOfferings.filter((o) => followUpOfferingIds.has(o.id))
        .length,
      averagePercentScore: average(programScores),
      signedCount: programScores.length,
    };
  });

  const attentionItems = offerings
    .map((offering) => {
      const assessment = assessmentByOffering.get(offering.id) ?? null;
      const reason = assessmentReason(offering, assessment);
      if (!reason && !ACTIONABLE_STATUSES.includes(offering.status)) return null;
      return {
        offeringId: offering.id,
        programId: offering.programId,
        courseCode: offering.courseCode,
        courseNameTh: offering.courseNameTh,
        academicYear: offering.academicYear,
        semester: offering.semester,
        section: offering.section,
        status: offering.status,
        percentScore: assessment?.percentScore ?? null,
        band: assessment?.band ?? null,
        reason: reason ?? 'ต้องตรวจสอบสถานะ',
      };
    })
    .filter((item): item is DashboardAttentionItem => item !== null)
    .slice(0, 12);

  return {
    availableAcademicYears,
    trend,
    recurringWeaknesses: buildRecurringWeaknesses(offerings, assessmentByOffering),
    summary: {
      totalPrograms: visiblePrograms.length,
      totalOfferings: offerings.length,
      aiCompleted: offerings.filter((o) => AI_COMPLETED_STATUSES.includes(o.status)).length,
      assessed: offerings.filter((o) => ASSESSED_STATUSES.includes(o.status)).length,
      finalVerified: offerings.filter((o) => FINAL_VERIFIED_STATUSES.includes(o.status))
        .length,
      needsFollowUp: offerings.filter((o) => FOLLOW_UP_STATUSES.includes(o.status)).length,
      followUpCompleted: offerings.filter((o) => followUpOfferingIds.has(o.id)).length,
      averagePercentScore: average(percentScores),
      implementationRate:
        reviewedImplementationCount === 0
          ? null
          : Math.round((implementedCount / reviewedImplementationCount) * 1000) / 10,
    },
    statusCounts,
    bandCounts,
    programRows,
    weakestRubricItems: rubricAverages,
    attentionItems,
  };
}
