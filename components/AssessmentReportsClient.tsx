'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ManagedOffering } from '@/lib/data/offeringManager';
import type { ReportSummary, CourseReportLinks } from '@/lib/data/assessmentReports';
import {
  ALL_PROGRAMS_ID,
  bandFromPercent,
  type ReportCommitteeMember,
  type ReportCoverage,
  type ReportScope,
  type Semester,
} from '@/lib/types/models';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import {
  BAND_BADGE,
  BAND_LABEL,
  COMMITTEE_ROLES,
  REPORT_THRESHOLD,
  SEMESTER_LABEL,
  formatThaiMeeting,
} from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import {
  createAssessmentReport,
  deleteAssessmentReport,
  resetReport,
} from '@/app/admin/assessment-reports/actions';

interface ProgramOpt {
  id: string;
  code: string;
  nameTh: string;
}

/** Mirror of reportDocId() in lib/data/assessmentReports.ts. */
function reportKey(
  academicProgramId: string,
  academicYear: number,
  scope: ReportScope,
  semester: Semester | null,
): string {
  const suffix = scope === 'annual' ? 'annual' : `sem${semester}`;
  return `${academicProgramId}__${academicYear}__${suffix}`;
}

interface CreateTarget {
  academicProgramId: string;
  coverage: ReportCoverage;
  academicYear: number;
  scope: ReportScope;
  semester: Semester | null;
  label: string;
  /** A report already exists for this row — creating will overwrite it. */
  hasReport: boolean;
}

interface Stats {
  total: number;
  assessed: number;
  /** 0–1 share of active offerings that are assessed. */
  ratio: number;
  eligible: boolean;
}

/** Denominator = active offerings in scope (inactive offerings are hidden from
 *  the workspaces); numerator = those with status `assessed`. */
function computeStats(offerings: ManagedOffering[]): Stats {
  const active = offerings.filter((o) => o.isActive);
  const total = active.length;
  const assessed = active.filter((o) => o.status === 'assessed').length;
  const ratio = total === 0 ? 0 : assessed / total;
  return { total, assessed, ratio, eligible: total > 0 && ratio >= REPORT_THRESHOLD };
}

interface ProgramRow {
  academicProgramId: string | null;
  label: string;
  offerings: ManagedOffering[];
  stats: Stats;
}

/** Synthetic row aggregating every program's offerings (school-wide). */
function allProgramsRow(rows: ProgramRow[]): ProgramRow {
  const offerings = rows.flatMap((r) => r.offerings);
  return {
    academicProgramId: ALL_PROGRAMS_ID,
    label: 'ทุกหลักสูตร',
    offerings,
    stats: computeStats(offerings),
  };
}

interface SemGroup {
  sem: Semester;
  programs: ProgramRow[];
}

interface YearGroup {
  year: number;
  /** Per-program rollup across all semesters of the year (annual report scope). */
  annual: ProgramRow[];
  semesters: SemGroup[];
}

export interface CommitteeOption {
  id: string;
  name: string;
}

export default function AssessmentReportsClient({
  offerings,
  reports,
  courseReportLinks,
  isAdmin,
  committeeOptions,
  presetCommitteesByProgram,
  academicPrograms,
}: {
  offerings: ManagedOffering[];
  reports: ReportSummary[];
  courseReportLinks: Record<string, CourseReportLinks>;
  isAdmin: boolean;
  committeeOptions: CommitteeOption[];
  presetCommitteesByProgram: Record<string, ReportCommitteeMember[]>;
  academicPrograms: ProgramOpt[];
}) {
  const router = useRouter();
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  // Report keys whose AI synthesis is running in the background (after create).
  const [synthesizingKeys, setSynthesizingKeys] = useState<Set<string>>(new Set());

  const reportByKey = useMemo(() => {
    const m = new Map<string, ReportSummary>();
    reports.forEach((r) =>
      m.set(reportKey(r.academicProgramId, r.academicYear, r.scope, r.semester), r),
    );
    return m;
  }, [reports]);

  const apLabel = useMemo(() => {
    const m = new Map<string, string>();
    academicPrograms.forEach((p) => m.set(p.id, `${p.code} — ${p.nameTh}`));
    return m;
  }, [academicPrograms]);

  const labelFor = (apId: string | null) =>
    apId == null ? 'ไม่ระบุหลักสูตร' : apLabel.get(apId) ?? apId;

  const distinctYears = useMemo(
    () => [...new Set(offerings.map((o) => o.academicYear))].sort((a, b) => b - a),
    [offerings],
  );

  // Filters — same shape as the offering manager.
  const [yearFilter, setYearFilter] = useState<string>('recent'); // recent | all | <year>
  const [semFilter, setSemFilter] = useState<string>('all');
  const [apFilter, setApFilter] = useState<string>('all');
  const filtersActive = yearFilter !== 'recent' || semFilter !== 'all' || apFilter !== 'all';

  const recentYears = useMemo(() => new Set(distinctYears.slice(0, 2)), [distinctYears]);

  const filtered = useMemo(() => {
    return offerings.filter((o) => {
      if (yearFilter === 'recent' && !recentYears.has(o.academicYear)) return false;
      if (yearFilter !== 'recent' && yearFilter !== 'all' && o.academicYear !== Number(yearFilter))
        return false;
      if (semFilter !== 'all' && o.semester !== semFilter) return false;
      if (apFilter !== 'all' && (o.academicProgramId ?? '') !== apFilter) return false;
      return true;
    });
  }, [offerings, yearFilter, semFilter, apFilter, recentYears]);

  const groups = useMemo<YearGroup[]>(() => {
    const byYear = new Map<number, Map<Semester, Map<string, ManagedOffering[]>>>();
    for (const o of filtered) {
      if (!byYear.has(o.academicYear)) byYear.set(o.academicYear, new Map());
      const semMap = byYear.get(o.academicYear)!;
      if (!semMap.has(o.semester)) semMap.set(o.semester, new Map());
      const apMap = semMap.get(o.semester)!;
      const key = o.academicProgramId ?? '_none';
      if (!apMap.has(key)) apMap.set(key, []);
      apMap.get(key)!.push(o);
    }

    return [...byYear.keys()]
      .sort((a, b) => b - a)
      .map((year) => {
        const semMap = byYear.get(year)!;

        // Per-program rollup across the whole year (annual report scope).
        const annualByAp = new Map<string, ManagedOffering[]>();
        for (const apMap of semMap.values()) {
          for (const [apKey, list] of apMap) {
            if (!annualByAp.has(apKey)) annualByAp.set(apKey, []);
            annualByAp.get(apKey)!.push(...list);
          }
        }
        const annual: ProgramRow[] = [...annualByAp.entries()]
          .map(([apKey, list]) => ({
            academicProgramId: apKey === '_none' ? null : apKey,
            label: labelFor(apKey === '_none' ? null : apKey),
            offerings: list,
            stats: computeStats(list),
          }))
          .sort((a, b) => a.label.localeCompare(b.label, 'th'));

        // Display order per year: Summer (3) → second (2) → first (1).
        const semesters: SemGroup[] = [...semMap.keys()]
          .sort((a, b) => Number(b) - Number(a))
          .map((sem) => {
            const apMap = semMap.get(sem)!;
            const programs: ProgramRow[] = [...apMap.entries()]
              .map(([apKey, list]) => ({
                academicProgramId: apKey === '_none' ? null : apKey,
                label: labelFor(apKey === '_none' ? null : apKey),
                offerings: list,
                stats: computeStats(list),
              }))
              .sort((a, b) => a.label.localeCompare(b.label, 'th'));
            return { sem, programs };
          });

        return { year, annual, semesters };
      });
    // labelFor is derived from apLabel; depending on apLabel keeps it stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, apLabel]);

  function rowReportState(
    apId: string | null,
    year: number,
    scope: ReportScope,
    sem: Semester | null,
  ): { reportId: string | null; synthesizing: boolean; directorLocked: boolean } {
    if (!apId) return { reportId: null, synthesizing: false, directorLocked: false };
    const key = reportKey(apId, year, scope, sem);
    const summary = reportByKey.get(key) ?? null;
    return {
      reportId: summary?.id ?? null,
      synthesizing: synthesizingKeys.has(key) || summary?.status === 'synthesizing',
      directorLocked: summary?.directorLocked ?? false,
    };
  }

  // After a report is created the modal closes immediately; AI synthesis runs
  // in the background and the row shows a "synthesizing" state until it lands.
  function handleCreated(target: CreateTarget, reportId: string) {
    const key = reportKey(
      target.academicProgramId,
      target.academicYear,
      target.scope,
      target.semester,
    );
    setCreateTarget(null);
    setSynthesizingKeys((prev) => new Set(prev).add(key));
    void (async () => {
      try {
        await getFirebaseAuth().authStateReady();
        const callable = httpsCallable(
          getFirebaseFunctions(),
          'synthesizeAssessmentReport',
          { timeout: 180_000 },
        );
        await callable({ reportId });
      } catch {
        // Non-fatal: the report exists and synthesis can be retried.
      } finally {
        setSynthesizingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        router.refresh();
      }
    })();
  }

  return (
    <div>
      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          ปีการศึกษา
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
          >
            <option value="recent">2 ปีล่าสุด</option>
            <option value="all">ทั้งหมด</option>
            {distinctYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          ภาคการศึกษา
          <select
            value={semFilter}
            onChange={(e) => setSemFilter(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
          >
            <option value="all">ทั้งหมด</option>
            <option value="1">{SEMESTER_LABEL['1']}</option>
            <option value="2">{SEMESTER_LABEL['2']}</option>
            <option value="3">{SEMESTER_LABEL['3']}</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">
          หลักสูตร
          <select
            value={apFilter}
            onChange={(e) => setApFilter(e.target.value)}
            className="mt-1 block max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
          >
            <option value="all">ทั้งหมด</option>
            {academicPrograms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.nameTh}
              </option>
            ))}
          </select>
        </label>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setYearFilter('recent');
              setSemFilter('all');
              setApFilter('all');
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mfu-primary/40"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ไม่มีรายวิชาที่เปิดสอนตามตัวกรอง
          {filtersActive && (
            <>
              {' — '}
              <button
                type="button"
                onClick={() => {
                  setYearFilter('recent');
                  setSemFilter('all');
                  setApFilter('all');
                }}
                className="text-mfu-primary underline hover:opacity-80"
              >
                ล้างตัวกรองเพื่อดูทั้งหมด
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.map((g) => (
            <section
              key={g.year}
              className="rounded-xl border border-slate-200 bg-slate-50"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-base font-semibold text-[#00704A]">
                  ปีการศึกษา {g.year}
                </h2>
              </div>

              <div className="space-y-4 px-3 pb-3">
                {/* Annual rollup per program */}
                <div>
                  <div className="mb-1.5 flex items-center gap-3 px-1 text-sm font-semibold text-slate-700">
                    ภาพรวมทั้งปีการศึกษา (รายงานประจำปี)
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="space-y-2">
                    {isAdmin && (() => {
                      const allRow = allProgramsRow(g.annual);
                      return (
                        <ProgramProgressRow
                          key="annual-all"
                          row={allRow}
                          isAdmin={isAdmin}
                          courseReportLinks={courseReportLinks}
                          highlight
                          {...rowReportState(ALL_PROGRAMS_ID, g.year, 'annual', null)}
                          onCreate={() =>
                            setCreateTarget({
                              academicProgramId: ALL_PROGRAMS_ID,
                              coverage: 'all',
                              academicYear: g.year,
                              scope: 'annual',
                              semester: null,
                              label: `รายงานประจำปี ${g.year} · ทุกหลักสูตร`,
                              hasReport: !!rowReportState(ALL_PROGRAMS_ID, g.year, 'annual', null)
                                .reportId,
                            })
                          }
                          createLabel="สร้างรายงานประจำปี (ทุกหลักสูตร)"
                        />
                      );
                    })()}
                    {g.annual.map((row) => (
                      <ProgramProgressRow
                        key={`annual-${row.academicProgramId ?? 'none'}`}
                        row={row}
                        isAdmin={isAdmin}
                        courseReportLinks={courseReportLinks}
                        {...rowReportState(row.academicProgramId, g.year, 'annual', null)}
                        onCreate={() =>
                          row.academicProgramId &&
                          setCreateTarget({
                            academicProgramId: row.academicProgramId,
                            coverage: 'program',
                            academicYear: g.year,
                            scope: 'annual',
                            semester: null,
                            label: `รายงานประจำปี ${g.year} · ${row.label}`,
                            hasReport: !!rowReportState(row.academicProgramId, g.year, 'annual', null)
                              .reportId,
                          })
                        }
                        createLabel="สร้างรายงานประจำปี"
                      />
                    ))}
                  </div>
                </div>

                {/* Per-semester per-program progress */}
                {g.semesters.map((s) => (
                  <div key={s.sem}>
                    <div className="mb-1.5 flex items-center gap-3 px-1 text-sm font-semibold text-slate-700">
                      {SEMESTER_LABEL[s.sem]}
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                    <div className="space-y-2">
                      {isAdmin && (() => {
                        const allRow = allProgramsRow(s.programs);
                        return (
                          <ProgramProgressRow
                            key={`${s.sem}-all`}
                            row={allRow}
                            isAdmin={isAdmin}
                            courseReportLinks={courseReportLinks}
                            highlight
                            {...rowReportState(ALL_PROGRAMS_ID, g.year, 'semester', s.sem)}
                            onCreate={() =>
                              setCreateTarget({
                                academicProgramId: ALL_PROGRAMS_ID,
                                coverage: 'all',
                                academicYear: g.year,
                                scope: 'semester',
                                semester: s.sem,
                                label: `รายงาน${SEMESTER_LABEL[s.sem]} ${g.year} · ทุกหลักสูตร`,
                                hasReport: !!rowReportState(
                                  ALL_PROGRAMS_ID,
                                  g.year,
                                  'semester',
                                  s.sem,
                                ).reportId,
                              })
                            }
                            createLabel={`สร้างรายงาน${SEMESTER_LABEL[s.sem]} (ทุกหลักสูตร)`}
                          />
                        );
                      })()}
                      {s.programs.map((row) => (
                        <ProgramProgressRow
                          key={`${s.sem}-${row.academicProgramId ?? 'none'}`}
                          row={row}
                          isAdmin={isAdmin}
                          collapsible
                          courseReportLinks={courseReportLinks}
                          {...rowReportState(row.academicProgramId, g.year, 'semester', s.sem)}
                          onCreate={() =>
                            row.academicProgramId &&
                            setCreateTarget({
                              academicProgramId: row.academicProgramId,
                              coverage: 'program',
                              academicYear: g.year,
                              scope: 'semester',
                              semester: s.sem,
                              label: `รายงาน${SEMESTER_LABEL[s.sem]} ${g.year} · ${row.label}`,
                              hasReport: !!rowReportState(
                                row.academicProgramId,
                                g.year,
                                'semester',
                                s.sem,
                              ).reportId,
                            })
                          }
                          createLabel={`สร้างรายงาน${SEMESTER_LABEL[s.sem]}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {createTarget && (
        <CreateReportModal
          target={createTarget}
          committeeOptions={committeeOptions}
          presetCommittee={
            createTarget.coverage === 'program'
              ? presetCommitteesByProgram[createTarget.academicProgramId] ?? null
              : null
          }
          onClose={() => setCreateTarget(null)}
          onCreated={(reportId) => handleCreated(createTarget, reportId)}
        />
      )}
    </div>
  );
}

function ProgramProgressRow({
  row,
  onCreate,
  createLabel,
  isAdmin,
  reportId = null,
  synthesizing = false,
  directorLocked = false,
  collapsible = false,
  highlight = false,
  courseReportLinks = {},
}: {
  row: ProgramRow;
  onCreate: () => void;
  createLabel: string;
  isAdmin: boolean;
  reportId?: string | null;
  /** AI synthesis is running after a create — show a pending state. */
  synthesizing?: boolean;
  /** A director has used their one generation; only an admin reset re-arms it. */
  directorLocked?: boolean;
  /** Semester rows expand to a course-status list; the annual rollup does not. */
  collapsible?: boolean;
  /** Emphasize the school-wide (all-programs) row. */
  highlight?: boolean;
  courseReportLinks?: Record<string, CourseReportLinks>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [dialog, setDialog] = useState<null | 'reset' | 'delete'>(null);
  const { stats } = row;
  const percent = Math.round(stats.ratio * 1000) / 10;

  const courses = useMemo(
    () =>
      row.offerings
        .filter((o) => o.isActive)
        .sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
    [row.offerings],
  );

  // Average assessment result across this row's assessed courses.
  const avg = useMemo(() => {
    const vals = row.offerings
      .map((o) => courseReportLinks[o.id])
      .filter((l): l is CourseReportLinks => !!l && l.percentScore != null);
    if (vals.length === 0) return null;
    const n = vals.length;
    const meanTotal = vals.reduce((a, l) => a + (l.totalScore ?? 0), 0) / n;
    const meanMax = vals.reduce((a, l) => a + (l.maxScore ?? 0), 0) / n;
    const pct = meanMax === 0 ? 0 : Math.round((1000 * meanTotal) / meanMax) / 10;
    return { meanTotal, meanMax, pct, band: bandFromPercent(pct) };
  }, [row.offerings, courseReportLinks]);

  return (
    <div
      className={`rounded-lg bg-white px-3 py-2.5 ${
        highlight ? 'border border-slate-300 shadow-sm' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            aria-expanded={expanded}
          >
            <span
              className={`shrink-0 text-[10px] text-slate-500 transition-transform duration-150 ${
                expanded ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <span className="truncate text-sm font-medium text-slate-700">{row.label}</span>
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-700">{row.label}</span>
            {highlight && (
              <span className="shrink-0 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                ทั้งสำนักวิชา
              </span>
            )}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {/* One stats block: coverage (ทวนสอบแล้ว) | quality (เฉลี่ย + band),
              labelled, with tabular numbers so values align across rows. */}
          <span className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-[11px]">
            <span className="inline-flex items-baseline gap-1">
              <span className="text-slate-500">ทวนสอบแล้ว</span>
              <span className="font-medium tabular-nums text-slate-700">
                {stats.assessed}/{stats.total} ({percent}%)
              </span>
            </span>
            {avg && (
              <>
                <span className="h-3.5 w-px bg-slate-300" aria-hidden />
                <span
                  className="inline-flex items-center gap-1.5"
                  title={`คะแนนเฉลี่ย ${avg.meanTotal.toFixed(1)}/${avg.meanMax.toFixed(1)}`}
                >
                  <span className="text-slate-500">เฉลี่ย</span>
                  <span className="font-medium tabular-nums text-slate-700">{avg.pct}%</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${BAND_BADGE[avg.band]}`}
                  >
                    {BAND_LABEL[avg.band]}
                  </span>
                </span>
              </>
            )}
          </span>
          {synthesizing ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
              กำลังสังเคราะห์ข้อเสนอแนะ…
            </span>
          ) : (
            <>
              {reportId && (
                <Link
                  href={`/admin/assessment-reports/${reportId}`}
                  className="rounded-lg bg-mfu-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mfu-primary/40"
                >
                  ดูรายงาน
                </Link>
              )}
              <RowMenu
                hasReport={!!reportId}
                eligible={stats.eligible}
                isAdmin={isAdmin}
                directorLocked={directorLocked}
                createLabel={createLabel}
                onCreate={onCreate}
                onReset={() => setDialog('reset')}
                onDelete={() => setDialog('delete')}
              />
            </>
          )}
        </div>
      </div>

      {/* Collapsible course-status list (semester rows only) */}
      {collapsible && expanded && (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {courses.length === 0 ? (
            <li className="py-2 text-xs text-slate-500">ไม่มีรายวิชา</li>
          ) : (
            courses.map((o) => {
              const links = courseReportLinks[o.id];
              return (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-700">
                    <span className="truncate">
                      <span className="font-medium">{o.courseCode}</span>{' '}
                      {o.courseNameTh}
                    </span>
                    {links?.band != null && links.percentScore != null && (
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <span>
                          {links.totalScore}/{links.maxScore} ({links.percentScore}%)
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${BAND_BADGE[links.band]}`}
                        >
                          {BAND_LABEL[links.band]}
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {links?.combinedReportUrl ? (
                      <a
                        href={links.combinedReportUrl}
                        className="rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-[11px] font-medium text-green-800 hover:bg-green-100"
                      >
                        ⬇ รายงานฉบับสมบูรณ์
                      </a>
                    ) : links?.aiReportUrl ? (
                      <a
                        href={links.aiReportUrl}
                        className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                      >
                        ⬇ รายงานฉบับร่าง
                      </a>
                    ) : null}
                    <StatusBadge status={o.status} />
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}

      {dialog === 'reset' && reportId && (
        <ConfirmDialog
          title="รีเซ็ตสิทธิ์การสร้างรายงาน"
          body="อนุญาตให้ผู้อำนวยการหลักสูตรสร้างรายงานสำหรับรอบนี้ได้อีกครั้ง รายงานและไฟล์เดิมจะยังคงอยู่ ต้องการดำเนินการต่อหรือไม่?"
          confirmLabel="รีเซ็ต"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const res = await resetReport(reportId);
            if (!res.ok) throw new Error(res.error);
            setDialog(null);
            router.refresh();
          }}
        />
      )}
      {dialog === 'delete' && reportId && (
        <ConfirmDialog
          danger
          title="ลบรายงาน"
          body="การลบจะลบรายงานและไฟล์ PDF ออกจากระบบอย่างถาวร พิมพ์ “ลบ” เพื่อยืนยัน"
          confirmLabel="ลบรายงาน"
          requireType="ลบ"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const res = await deleteAssessmentReport(reportId);
            if (!res.ok) throw new Error(res.error);
            setDialog(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Per-row ⋮ menu: create (gated by threshold + director lock), admin-only
 *  reset, and delete. */
function RowMenu({
  hasReport,
  eligible,
  isAdmin,
  directorLocked,
  createLabel,
  onCreate,
  onReset,
  onDelete,
}: {
  hasReport: boolean;
  eligible: boolean;
  isAdmin: boolean;
  directorLocked: boolean;
  createLabel: string;
  onCreate: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Admins always create (subject to the 25% gate). Directors create only when
  // no report exists yet, or after an admin has reset the lock.
  const createAllowed = eligible && (isAdmin || !hasReport || !directorLocked);
  const createDisabledReason = !eligible
    ? 'ต้องทวนสอบอย่างน้อย 25% ของรายวิชาก่อนจึงจะสร้างรายงานได้'
    : hasReport && !isAdmin && directorLocked
      ? 'ได้สร้างรายงานแล้ว กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ต'
      : undefined;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mfu-primary/40"
        aria-label="จัดการ"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋮
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!createAllowed}
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
            className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          >
            {hasReport ? 'สร้างรายงานใหม่' : createLabel}
          </button>
          {createDisabledReason && (
            <p className="px-3 pb-2 pt-0.5 text-[11px] leading-snug text-amber-700">
              {createDisabledReason}
            </p>
          )}
          {hasReport && isAdmin && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onReset();
              }}
              className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
            >
              รีเซ็ตสิทธิ์การสร้าง (ผู้ดูแลระบบ)
            </button>
          )}
          {hasReport && isAdmin && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
            >
              ลบรายงาน
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Confirmation modal. When `requireType` is set the confirm button stays
 *  disabled until the user types that exact word. */
function ConfirmDialog({
  title,
  body,
  confirmLabel,
  requireType,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  requireType?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !requireType || typed.trim() === requireType;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        {requireType && (
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={requireType}
            autoFocus
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
          />
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy || !ready}
            className={
              danger
                ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50'
                : 'rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
            }
          >
            {busy ? 'กำลังดำเนินการ…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Combobox for a committee member's name: free-text input plus a scrollable
 *  suggestion list (sized to ~10 rows) drawn from the user/allowlist roster. */
function CommitteeNameInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: CommitteeOption[];
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  // Fixed-position box anchored to the input — escapes the modal's overflow
  // clip (an absolute dropdown gets cut off at the card edge).
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    flip: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 4;
      const margin = 8;
      const spaceBelow = window.innerHeight - r.bottom - margin;
      const spaceAbove = r.top - margin;
      const flip = spaceBelow < 200 && spaceAbove > spaceBelow;
      const avail = flip ? spaceAbove : spaceBelow;
      setBox({
        left: r.left,
        width: r.width,
        top: flip ? r.top - gap : r.bottom + gap,
        maxHeight: Math.max(120, Math.min(320, avail)), // ~10 rows, capped to fit
        flip,
      });
    };
    place();
    window.addEventListener('scroll', place, true); // capture: track modal scroll
    window.addEventListener('resize', place);
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  const q = value.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;

  // Reset the keyboard highlight whenever the query or open state changes.
  useEffect(() => setActiveIndex(-1), [value, open]);
  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listId}-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  function choose(name: string) {
    onChange(name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && activeIndex >= 0 && matches[activeIndex]) {
      e.preventDefault();
      choose(matches[activeIndex].name);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const activeId = activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="เลือกหรือพิมพ์ชื่อ-นามสกุล"
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
      />
      {open && matches.length > 0 && box && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'fixed',
            left: box.left,
            top: box.top,
            width: box.width,
            maxHeight: box.maxHeight,
            transform: box.flip ? 'translateY(-100%)' : undefined,
          }}
          className="z-50 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {matches.map((o, idx) => {
            const active = idx === activeIndex;
            return (
              <li
                key={`${o.id}-${o.name}-${idx}`}
                id={`${listId}-opt-${idx}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(idx)}
                // onMouseDown fires before the input's blur, so the click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o.name);
                }}
                className={`cursor-pointer px-3 py-1.5 text-slate-700 ${
                  active ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
              >
                {o.name}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const DEFAULT_COMMITTEE: { name: string; role: string }[] = [
  { name: '', role: 'ประธานกรรมการ' },
  { name: '', role: 'กรรมการ' },
  { name: '', role: 'กรรมการและเลขานุการ' },
];

function CreateReportModal({
  target,
  committeeOptions,
  presetCommittee,
  onClose,
  onCreated,
}: {
  target: CreateTarget;
  committeeOptions: CommitteeOption[];
  /** The program's standing assessment committee (read-only) when configured. */
  presetCommittee: ReportCommitteeMember[] | null;
  onClose: () => void;
  onCreated: (reportId: string) => void;
}) {
  const [venue, setVenue] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [committee, setCommittee] = useState(DEFAULT_COMMITTEE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two-stage submit: fill the form, then type "ยืนยัน" to confirm — the
  // director only gets one generation per row.
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // When the program has a standing assessment committee, its members are
  // pulled in read-only; the manual editor is only used as a fallback.
  const hasPreset = !!presetCommittee && presetCommittee.length > 0;

  const meetingPreview = formatThaiMeeting(meetingDate, startTime, endTime);
  const filledNames = committee.map((m) => m.name.trim()).filter(Boolean);
  const hasMember = filledNames.length > 0;
  const hasDuplicate =
    new Set(filledNames.map((n) => n.toLowerCase())).size !== filledNames.length;
  const timeInvalid = !!startTime && !!endTime && endTime <= startTime;
  const blockReason = timeInvalid
    ? 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม'
    : hasPreset
      ? undefined
      : !hasMember
        ? 'กรุณาระบุรายชื่อคณะกรรมการอย่างน้อย 1 คน'
        : hasDuplicate
          ? 'มีรายชื่อคณะกรรมการซ้ำกัน'
          : undefined;

  // Directory names already chosen in other rows are hidden from a row's
  // suggestions (the row keeps its own value; free-typed names are allowed).
  function optionsFor(rowIndex: number): CommitteeOption[] {
    const chosenElsewhere = new Set(
      committee
        .filter((_, idx) => idx !== rowIndex)
        .map((m) => m.name.trim())
        .filter(Boolean),
    );
    return committeeOptions.filter((o) => !chosenElsewhere.has(o.name));
  }

  function setMember(i: number, field: 'name' | 'role', value: string) {
    setCommittee((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  }
  function addMember() {
    setCommittee((prev) => [...prev, { name: '', role: 'กรรมการ' }]);
  }
  function removeMember(i: number) {
    setCommittee((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Read-only preset goes through verbatim (members already carry uids);
      // otherwise attach the directory uid when a manual name matches exactly.
      const byName = new Map(committeeOptions.map((o) => [o.name, o.id]));
      const committeePayload = hasPreset
        ? presetCommittee!
        : committee
            .map((m) => {
              const name = m.name.trim();
              const uid = byName.get(name);
              return { name, role: m.role, ...(uid ? { uid } : {}) };
            })
            .filter((m) => m.name.length > 0);
      const res = await createAssessmentReport({
        academicProgramId: target.academicProgramId,
        coverage: target.coverage,
        academicYear: target.academicYear,
        scope: target.scope,
        semester: target.semester,
        header: {
          venue,
          meetingDate,
          meetingStartTime: startTime,
          meetingEndTime: endTime,
          committee: committeePayload,
        },
      });
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      // Modal closes immediately; the parent runs AI synthesis in the
      // background and reflects progress on the report's row button.
      onCreated(res.reportId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-slate-800">สร้างรายงานการทวนสอบ</h3>
        <p className="mt-1 text-xs text-slate-500">{target.label}</p>

        <div className="mt-4 space-y-3">
          <div>
            <span className="block text-xs font-medium text-slate-600">วันและเวลาประชุม</span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
              />
              <span className="text-xs text-slate-500">เวลา</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-mfu-primary focus:outline-none"
              />
              <span className="text-xs text-slate-500">–</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-mfu-primary focus:outline-none"
              />
              <span className="text-xs text-slate-500">น.</span>
            </div>
            {meetingPreview && (
              <p className="mt-1 text-xs text-slate-500">{meetingPreview}</p>
            )}
            {timeInvalid && (
              <p className="mt-1 text-xs text-red-600">เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม</p>
            )}
          </div>
          <label className="block text-xs font-medium text-slate-600">
            ณ สถานที่
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="เช่น ห้องประชุมสำนักวิชาวิทยาศาสตร์สุขภาพ"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
            />
          </label>

          {hasPreset ? (
            <div>
              <span className="text-xs font-medium text-slate-600">คณะกรรมการทวนสอบ</span>
              <p className="mt-1 text-xs text-slate-500">
                ดึงจากคณะกรรมการทวนสอบของหลักสูตร — แก้ไขได้ที่แท็บ{' '}
                <Link
                  href="/admin/users/assessment-committee"
                  className="text-mfu-primary hover:underline"
                >
                  คณะกรรมการทวนสอบ
                </Link>
              </p>
              <div className="mt-2 space-y-2">
                {presetCommittee!.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-700">{m.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{m.role}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">คณะกรรมการทวนสอบ</span>
                <button
                  type="button"
                  onClick={addMember}
                  className="text-xs text-mfu-primary hover:underline"
                >
                  + เพิ่มกรรมการ
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {committee.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CommitteeNameInput
                      value={m.name}
                      options={optionsFor(i)}
                      onChange={(name) => setMember(i, 'name', name)}
                    />
                    <select
                      value={m.role}
                      onChange={(e) => setMember(i, 'role', e.target.value)}
                      className="w-44 shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
                    >
                      {COMMITTEE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeMember(i)}
                      className="shrink-0 px-1 text-slate-500 hover:text-red-600"
                      aria-label="ลบกรรมการ"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              {hasDuplicate && (
                <p className="mt-1.5 text-xs text-red-600">มีรายชื่อคณะกรรมการซ้ำกัน</p>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {!confirming ? (
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!!blockReason}
              title={blockReason}
              className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mfu-primary/40 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              สร้างรายงาน
            </button>
          </div>
        ) : (
          <div
            className={`mt-5 rounded-lg border p-3 ${
              target.hasReport ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <p className="text-xs text-slate-600">
              {target.hasReport
                ? 'การสร้างรายงานใหม่จะเขียนทับรายงานและไฟล์ PDF ฉบับเดิมของรอบนี้ — พิมพ์ “ยืนยัน” เพื่อดำเนินการ'
                : 'ตรวจสอบความถูกต้องของข้อมูล ประธานหลักสูตรสามารถสร้างรายงานได้เพียงครั้งเดียวเท่านั้น — พิมพ์ “ยืนยัน” เพื่อดำเนินการ'}
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="ยืนยัน"
              autoFocus
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText('');
                }}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || confirmText.trim() !== 'ยืนยัน'}
                className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mfu-primary/40 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {busy ? 'กำลังสร้าง…' : 'ยืนยันการสร้าง'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
