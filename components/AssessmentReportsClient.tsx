'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ManagedOffering } from '@/lib/data/offeringManager';
import type { ReportSummary } from '@/lib/data/assessmentReports';
import type { ReportScope, Semester } from '@/lib/types/models';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import { SEMESTER_LABEL, REPORT_THRESHOLD } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import { createAssessmentReport } from '@/app/admin/assessment-reports/actions';

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
  academicYear: number;
  scope: ReportScope;
  semester: Semester | null;
  label: string;
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
  reports,
  academicPrograms,
}: {
  offerings: ManagedOffering[];
  reports: ReportSummary[];
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
  ): { reportId: string | null; synthesizing: boolean } {
    if (!apId) return { reportId: null, synthesizing: false };
    const key = reportKey(apId, year, scope, sem);
    const summary = reportByKey.get(key) ?? null;
    return {
      reportId: summary?.id ?? null,
      synthesizing: synthesizingKeys.has(key) || summary?.status === 'synthesizing',
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
      </div>

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
                        {...rowReportState(row.academicProgramId, g.year, 'annual', null)}
                        onCreate={() =>
                          row.academicProgramId &&
                          setCreateTarget({
                            academicProgramId: row.academicProgramId,
                            academicYear: g.year,
                            scope: 'annual',
                            semester: null,
                            label: `รายงานประจำปี ${g.year} · ${row.label}`,
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
                    <div className="mb-1 px-1 text-xs font-semibold text-slate-500">
                      {SEMESTER_LABEL[s.sem]}
                    </div>
                    <div className="space-y-2">
                      {s.programs.map((row) => (
                        <ProgramProgressRow
                          key={`${s.sem}-${row.academicProgramId ?? 'none'}`}
                          row={row}
                          collapsible
                          {...rowReportState(row.academicProgramId, g.year, 'semester', s.sem)}
                          onCreate={() =>
                            row.academicProgramId &&
                            setCreateTarget({
                              academicProgramId: row.academicProgramId,
                              academicYear: g.year,
                              scope: 'semester',
                              semester: s.sem,
                              label: `รายงาน${SEMESTER_LABEL[s.sem]} ${g.year} · ${row.label}`,
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
  reportId = null,
  synthesizing = false,
  collapsible = false,
}: {
  row: ProgramRow;
  onCreate: () => void;
  createLabel: string;
  reportId?: string | null;
  /** AI synthesis is running after a create — show a pending state. */
  synthesizing?: boolean;
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
        {synthesizing ? (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
            กำลังสังเคราะห์ข้อเสนอแนะ…
          </span>
        ) : (
          <>
            {reportId && (
              <Link
                href={`/admin/assessment-reports/${reportId}`}
                className="shrink-0 rounded-lg border border-mfu-primary px-3 py-1.5 text-xs font-medium text-mfu-primary hover:bg-mfu-primary/5"
              >
                ดูรายงาน
              </Link>
            )}
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
              {reportId ? 'สร้างใหม่' : createLabel}
            </button>
          </>
        )}
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

const DEFAULT_COMMITTEE: { name: string; role: string }[] = [
  { name: '', role: 'ประธานกรรมการ' },
  { name: '', role: 'กรรมการ' },
  { name: '', role: 'กรรมการและเลขานุการ' },
];

function CreateReportModal({
  target,
  onClose,
  onCreated,
}: {
  target: CreateTarget;
  onClose: () => void;
  onCreated: (reportId: string) => void;
}) {
  const [venue, setVenue] = useState('');
  const [meetingDateTime, setMeetingDateTime] = useState('');
  const [committee, setCommittee] = useState(DEFAULT_COMMITTEE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await createAssessmentReport({
        academicProgramId: target.academicProgramId,
        academicYear: target.academicYear,
        scope: target.scope,
        semester: target.semester,
        header: { venue, meetingDateTime, committee },
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
          <label className="block text-xs font-medium text-slate-600">
            สถานที่และวันเวลาประชุม
            <input
              value={meetingDateTime}
              onChange={(e) => setMeetingDateTime(e.target.value)}
              placeholder="เช่น วันศุกร์ที่ 5 กุมภาพันธ์ 2567 เวลา 16.00-17.00 น."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            ณ สถานที่
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="เช่น ห้องประชุมสำนักวิชาวิทยาศาสตร์สุขภาพ"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
            />
          </label>

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
                  <input
                    value={m.name}
                    onChange={(e) => setMember(i, 'name', e.target.value)}
                    placeholder="ชื่อ-นามสกุล"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
                  />
                  <input
                    value={m.role}
                    onChange={(e) => setMember(i, 'role', e.target.value)}
                    placeholder="ตำแหน่ง"
                    className="w-40 shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeMember(i)}
                    className="shrink-0 px-1 text-slate-400 hover:text-red-500"
                    aria-label="ลบกรรมการ"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

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
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'กำลังสร้าง…' : 'สร้างรายงาน'}
          </button>
        </div>
      </div>
    </div>
  );
}
