import type { DashboardProgramRow } from '@/lib/data/dashboard';
import type { ProgramWithId } from '@/lib/data/dashboard';

export interface ApConsolidatedRow {
  /** null when the program has no parentProgramId. */
  academicProgramId: string | null;
  code: string;
  nameTh: string;
  totalOfferings: number;
  aiCompleted: number;
  assessed: number;
  finalVerified: number;
  needsFollowUp: number;
  followUpCompleted: number;
  averagePercentScore: number | null;
  /** How many curriculum revisions (ProgramDocs) are grouped into this row. */
  programCount: number;
}

export interface ApOption {
  id: string;
  code: string;
  nameTh: string;
}

/**
 * Consolidates per-curriculum `programRows` into one row per Academic Program.
 *
 * @param programRows   Per-curriculum rows from `ExecutiveDashboardData`.
 * @param programs      Full program list — used to resolve each row's `parentProgramId`.
 * @param academicPrograms  AP list — used to look up AP code / nameTh.
 *
 * Numeric counts (totalOfferings, aiCompleted, …) are summed.
 * `averagePercentScore` is weighted by `signedCount`, which represents
 * committee-scored signed assessments rather than every signed-off offering.
 *
 * Programs with no `parentProgramId` appear as individual rows using their
 * own code / nameTh.
 */
export function consolidateByAcademicProgram(
  programRows: DashboardProgramRow[],
  programs: ProgramWithId[],
  academicPrograms: ApOption[],
): ApConsolidatedRow[] {
  const parentMap = new Map(programs.map((p) => [p.id, p.parentProgramId ?? null]));
  const apMap = new Map(academicPrograms.map((ap) => [ap.id, ap]));

  // Group rows by parentProgramId (null = standalone).
  const groups = new Map<string | null, DashboardProgramRow[]>();
  for (const row of programRows) {
    const apId = parentMap.get(row.programId) ?? null;
    const key = apId; // null groups become individual rows later
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const result: ApConsolidatedRow[] = [];

  for (const [apId, rows] of groups.entries()) {
    if (apId === null) {
      // No parent AP — each program becomes its own row.
      for (const row of rows) {
        result.push({
          academicProgramId: null,
          code: row.code,
          nameTh: row.nameTh,
          totalOfferings: row.totalOfferings,
          aiCompleted: row.aiCompleted,
          assessed: row.assessed,
          finalVerified: row.finalVerified,
          needsFollowUp: row.needsFollowUp,
          followUpCompleted: row.followUpCompleted,
          averagePercentScore: row.averagePercentScore,
          programCount: 1,
        });
      }
      continue;
    }

    const ap = apMap.get(apId);
    const totalSignedCount = rows.reduce((sum, r) => sum + r.signedCount, 0);
    const weightedScoreSum = rows.reduce((sum, r) => {
      if (r.averagePercentScore === null) return sum;
      return sum + r.averagePercentScore * r.signedCount;
    }, 0);

    result.push({
      academicProgramId: apId,
      code: ap?.code ?? apId,
      nameTh: ap?.nameTh ?? '(หลักสูตรที่ถูกลบ)',
      totalOfferings: rows.reduce((s, r) => s + r.totalOfferings, 0),
      aiCompleted: rows.reduce((s, r) => s + r.aiCompleted, 0),
      assessed: rows.reduce((s, r) => s + r.assessed, 0),
      finalVerified: rows.reduce((s, r) => s + r.finalVerified, 0),
      needsFollowUp: rows.reduce((s, r) => s + r.needsFollowUp, 0),
      followUpCompleted: rows.reduce((s, r) => s + r.followUpCompleted, 0),
      averagePercentScore:
        totalSignedCount === 0
          ? null
          : Math.round((weightedScoreSum / totalSignedCount) * 10) / 10,
      programCount: rows.length,
    });
  }

  // Sort: APs with a parentProgramId first (by AP code), then standalones.
  return result.sort((a, b) => a.code.localeCompare(b.code));
}
