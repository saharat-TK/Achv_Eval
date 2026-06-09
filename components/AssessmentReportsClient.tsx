'use client';

import { useMemo, useState } from 'react';
import type { ManagedOffering } from '@/lib/data/offeringManager';
import type { Semester } from '@/lib/types/models';
import { SEMESTER_LABEL } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';

interface ProgramOpt {
  id: string;
  code: string;
  nameTh: string;
}

/** Minimum share of offerings that must be assessed before a report can be
 *  created — 25% for both a single semester and a whole academic year. */
const REPORT_THRESHOLD = 0.25;

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

export default function AssessmentReportsClient({
  offerings,
  academicPrograms,
}: {
  offerings: ManagedOffering[];
  academicPrograms: ProgramOpt[];
}) {
  const [notice, setNotice] = useState<string | null>(null);

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

        const semesters: SemGroup[] = [...semMap.keys()]
          .sort((a, b) => Number(a) - Number(b))
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

  // Phase 2 wires this to the committee-info form + generation flow.
  function handleCreate(scopeLabel: string) {
    setNotice(`การสร้าง “${scopeLabel}” จะเปิดใช้งานในขั้นถัดไป`);
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
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-xs text-amber-600 hover:underline"
          >
            ปิด
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ไม่มีรายวิชาที่เปิดสอนตามตัวกรอง
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.map((g) => (
            <section
              key={g.year}
              className="rounded-xl border border-[#00704A]/20 border-l-4 border-l-[#00704A] bg-[#00704A]/[0.04]"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-base font-semibold text-[#00704A]">
                  ปีการศึกษา {g.year}
                </h2>
              </div>

              <div className="space-y-4 px-3 pb-3">
                {/* Annual rollup per program */}
                <div>
                  <div className="mb-1 px-1 text-xs font-semibold text-slate-500">
                    ภาพรวมทั้งปีการศึกษา (รายงานประจำปี)
                  </div>
                  <div className="space-y-2">
                    {g.annual.map((row) => (
                      <ProgramProgressRow
                        key={`annual-${row.academicProgramId ?? 'none'}`}
                        row={row}
                        onCreate={() =>
                          handleCreate(
                            `รายงานประจำปี ${g.year} · ${row.label}`,
                          )
                        }
                        createLabel="สร้างรายงานประจำปี"
                      />
                    ))}
                  </div>
                </div>

                {/* Per-semester per-program progress */}
                {g.semesters.map((s) => (
                  <div key={s.sem}>
                    <div className="mb-1 px-1 text-xs font-semibold text-slate-500">
                      {SEMESTER_LABEL[s.sem]}
                    </div>
                    <div className="space-y-2">
                      {s.programs.map((row) => (
                        <ProgramProgressRow
                          key={`${s.sem}-${row.academicProgramId ?? 'none'}`}
                          row={row}
                          collapsible
                          onCreate={() =>
                            handleCreate(
                              `รายงาน${SEMESTER_LABEL[s.sem]} ${g.year} · ${row.label}`,
                            )
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
    </div>
  );
}

function ProgramProgressRow({
  row,
  onCreate,
  createLabel,
  collapsible = false,
}: {
  row: ProgramRow;
  onCreate: () => void;
  createLabel: string;
  /** Semester rows expand to a course-status list; the annual rollup does not. */
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { stats } = row;
  const percent = Math.round(stats.ratio * 1000) / 10;
  const fillColor = stats.eligible ? 'bg-[#00704A]' : 'bg-amber-400';

  const courses = useMemo(
    () =>
      row.offerings
        .filter((o) => o.isActive)
        .sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
    [row.offerings],
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            aria-expanded={expanded}
          >
            <span
              className={`shrink-0 text-[10px] text-slate-400 transition-transform duration-150 ${
                expanded ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <span className="truncate text-sm font-medium text-slate-700">{row.label}</span>
          </button>
        ) : (
          <span className="truncate text-sm font-medium text-slate-700">{row.label}</span>
        )}
        <span className="shrink-0 text-xs text-slate-500">
          ทวนสอบแล้ว {stats.assessed}/{stats.total} ({percent}%)
        </span>
      </div>

      {/* Progress bar with a 25% threshold marker */}
      <div className="mt-2 flex items-center gap-3">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${fillColor} transition-all`}
            style={{ width: `${Math.min(100, stats.ratio * 100)}%` }}
          />
          <div
            className="absolute top-0 h-full w-px bg-slate-400/70"
            style={{ left: `${REPORT_THRESHOLD * 100}%` }}
            title="เกณฑ์ขั้นต่ำ 25%"
          />
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={!stats.eligible}
          title={
            stats.eligible
              ? undefined
              : 'ต้องทวนสอบอย่างน้อย 25% ของรายวิชาก่อนจึงจะสร้างรายงานได้'
          }
          className="shrink-0 rounded-lg bg-mfu-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {createLabel}
        </button>
      </div>

      {/* Collapsible course-status list (semester rows only) */}
      {collapsible && expanded && (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {courses.length === 0 ? (
            <li className="py-2 text-xs text-slate-400">ไม่มีรายวิชา</li>
          ) : (
            courses.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0 truncate text-xs text-slate-700">
                  <span className="font-medium">{o.courseCode}</span>{' '}
                  {o.courseNameTh}
                </span>
                <StatusBadge status={o.status} />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
