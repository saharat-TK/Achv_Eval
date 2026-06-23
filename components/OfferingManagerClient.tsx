'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import {
  assignOfferingLecturers,
  deleteEmptyOfferings,
  reverseOfferingStatuses,
} from '@/app/admin/offering-manager/actions';
import BatchOfferingModal, {
  type ProgramOpt,
  type EditContext,
} from '@/components/BatchOfferingModal';
import { OFFERING_STATUS, SEMESTER_LABEL } from '@/lib/constants';
import type { OfferingStatus, Semester } from '@/lib/types/models';
import type { ManagedLecturer, ManagedOffering } from '@/lib/data/offeringManager';

interface ApBlock {
  academicProgramId: string | null;
  label: string;
  offerings: ManagedOffering[];
}
interface SemGroup {
  sem: Semester;
  programs: ApBlock[];
}
interface YearGroup {
  year: number;
  count: number;
  semesters: SemGroup[];
}
type ReverseTargetStatus = Extract<
  OfferingStatus,
  'documents_pending' | 'ai_complete' | 'pending_assessment'
>;

function lecturerOptionValue(lecturer: ManagedLecturer): string {
  return `${lecturer.kind}:${lecturer.id}`;
}

/** Thesis-installment marker ("Revision N"), shown only for parts 2–6. */
function PartBadge({ part }: { part: number | null }) {
  if (!part || part <= 1) return null;
  return (
    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">
      Revision {part}
    </span>
  );
}

const STATUS_TONE_CLASS: Record<
  'slate' | 'amber' | 'blue' | 'violet' | 'green' | 'red',
  string
> = {
  slate:  'bg-slate-100 text-slate-600',
  amber:  'bg-amber-100 text-amber-700',
  blue:   'bg-blue-100 text-blue-700',
  violet: 'bg-violet-100 text-violet-700',
  green:  'bg-green-100 text-green-700',
  red:    'bg-red-100 text-red-700',
};

const OFFERING_TABLE_WRAPPER_CLASS =
  'overflow-x-auto rounded-b-lg border-t border-slate-100';
const OFFERING_TABLE_CLASS = 'min-w-[760px] w-full table-fixed text-xs';
const OFFERING_TABLE_HEADER_ROW_CLASS =
  'bg-slate-50 text-left text-[11px] font-medium text-slate-500';
const OFFERING_TABLE_HEAD_CELL_CLASS = 'px-3 py-2';
const OFFERING_TABLE_CELL_CLASS = 'px-3 py-1.5 align-middle';
const OFFERING_TABLE_CODE_CELL_CLASS =
  `${OFFERING_TABLE_CELL_CLASS} whitespace-nowrap font-medium text-slate-700`;
const OFFERING_TABLE_TEXT_CELL_CLASS =
  `${OFFERING_TABLE_CELL_CLASS} min-w-0 text-slate-600`;
const OFFERING_TABLE_STATUS_CELL_CLASS =
  `${OFFERING_TABLE_CELL_CLASS} whitespace-nowrap`;
const OFFERING_STATUS_PILL_CLASS = 'inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-medium';
const REVERSE_TARGETS: ReverseTargetStatus[] = [
  'pending_assessment',
  'ai_complete',
  'documents_pending',
];
/** In-progress assessment statuses (draft in review / awaiting the head) —
 *  reversible by a super admin to any reverse target. Mirrors the server. */
const IN_REVIEW_STATUSES: OfferingStatus[] = ['assessor_review', 'pending_head_signoff'];
const REVERSIBLE_SIGNED_STATUSES: OfferingStatus[] = ['assessed', 'assessed_self_only'];

export default function OfferingManagerClient({
  offerings,
  academicPrograms,
  lecturers,
  isAdmin,
  isSuperAdmin,
  directorAcademicProgramIds,
}: {
  offerings: ManagedOffering[];
  academicPrograms: ProgramOpt[];
  lecturers: ManagedLecturer[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  directorAcademicProgramIds: string[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: 'add' } | { mode: 'edit'; edit: EditContext } | null>(
    null,
  );
  const [del, setDel] = useState<{ label: string; offeringIds: string[] } | null>(null);
  const [assign, setAssign] = useState<{
    label: string;
    academicProgramId: string;
    offerings: ManagedOffering[];
    values: Record<string, string>;
  } | null>(null);
  const [reverse, setReverse] = useState<{
    label: string;
    offerings: ManagedOffering[];
    targets: ReverseTargetStatus[];
    targetStatus: ReverseTargetStatus;
    selectedOfferingIds: string[];
    skippedOpen: boolean;
    typed: string;
  } | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [menuDir, setMenuDir] = useState<'up' | 'down'>('down');
  const [collapsedSems, setCollapsedSems] = useState<Set<string>>(new Set());
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!menuKey) return;
    function closeOnOutsidePointerDown(e: PointerEvent) {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest('[data-offering-group-menu]')) return;
      setMenuKey(null);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [menuKey]);

  function toggleSem(key: string) {
    setCollapsedSems((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleBlock(key: string) {
    setMenuKey(null);
    setCollapsedBlocks((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  const assignAcademicProgramId = assign?.academicProgramId ?? null;

  const assignEligibleLecturers = useMemo(() => {
    if (!assignAcademicProgramId) return [];
    return lecturers.filter((lecturer) =>
      lecturer.academicProgramIds.includes(assignAcademicProgramId),
    );
  }, [assignAcademicProgramId, lecturers]);

  const lecturerNameMap = useMemo(() => {
    const m = new Map<string, string>();
    lecturers.forEach((l) => m.set(`${l.kind}:${l.id}`, l.nameTh || l.email));
    return m;
  }, [lecturers]);

  function resolveLecturerName(o: ManagedOffering): string | null {
    if (o.lecturerId)
      return lecturerNameMap.get(`user:${o.lecturerId}`) ?? o.lecturerEmail;
    if (o.pendingLecturerAllowlistId)
      return lecturerNameMap.get(`allowlist:${o.pendingLecturerAllowlistId}`) ?? o.pendingLecturerEmail;
    return null;
  }

  // Open the ⋮ menu, flipping it upward when there isn't room below.
  function toggleMenu(key: string, e: React.MouseEvent<HTMLElement>) {
    if (menuKey === key) {
      setMenuKey(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setMenuDir(spaceBelow < 120 ? 'up' : 'down');
    setMenuKey(key);
  }

  const apLabel = useMemo(() => {
    const m = new Map<string, string>();
    academicPrograms.forEach((p) => m.set(p.id, `${p.code} — ${p.nameTh}`));
    return m;
  }, [academicPrograms]);

  const distinctYears = useMemo(
    () => [...new Set(offerings.map((o) => o.academicYear))].sort((a, b) => b - a),
    [offerings],
  );

  // Filters
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
        const semesters: SemGroup[] = [...semMap.keys()]
          .sort((a, b) => Number(b) - Number(a))
          .map((sem) => {
            const apMap = semMap.get(sem)!;
            const programs: ApBlock[] = [...apMap.entries()]
              .map(([apKey, list]) => ({
                academicProgramId: apKey === '_none' ? null : apKey,
                label: apKey === '_none' ? 'ไม่ระบุหลักสูตร' : apLabel.get(apKey) ?? apKey,
                offerings: list.sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
              }))
              .sort((a, b) => a.label.localeCompare(b.label, 'th'));
            return { sem, programs };
          });
        const count = semesters.reduce(
          (n, s) => n + s.programs.reduce((m, p) => m + p.offerings.length, 0),
          0,
        );
        return { year, count, semesters };
      });
  }, [filtered, apLabel]);

  const existing = useMemo(
    () => offerings.map((o) => ({ courseId: o.courseId, academicYear: o.academicYear, semester: o.semester })),
    [offerings],
  );

  function openEdit(block: ApBlock, year: number, sem: Semester) {
    if (!block.academicProgramId) return;
    setMenuKey(null);
    setModal({
      mode: 'edit',
      edit: {
        academicProgramId: block.academicProgramId,
        academicProgramLabel: block.label,
        academicYear: year,
        semester: sem,
        initial: block.offerings.map((o) => ({
          courseId: o.courseId,
          offeringId: o.id,
          code: o.courseCode,
          nameTh: o.courseNameTh,
        })),
      },
    });
  }

  function openDelete(block: ApBlock, year: number, sem: Semester) {
    setMenuKey(null);
    setTyped('');
    setError(null);
    setDel({
      label: `${block.label} · ปีการศึกษา ${year} ${SEMESTER_LABEL[sem]}`,
      offeringIds: block.offerings.map((o) => o.id),
    });
  }

  function getReverseTargets(block: ApBlock): ReverseTargetStatus[] {
    const canReversePending =
      isSuperAdmin ||
      (!!block.academicProgramId && directorAcademicProgramIds.includes(block.academicProgramId));
    const targets = new Set<ReverseTargetStatus>();
    if (canReversePending && block.offerings.some((o) => o.status === 'pending_assessment')) {
      targets.add('ai_complete');
      targets.add('documents_pending');
    }
    if (
      isSuperAdmin &&
      block.offerings.some((o) => REVERSIBLE_SIGNED_STATUSES.includes(o.status))
    ) {
      targets.add('pending_assessment');
      targets.add('ai_complete');
      targets.add('documents_pending');
    }
    if (isSuperAdmin && block.offerings.some((o) => IN_REVIEW_STATUSES.includes(o.status))) {
      targets.add('pending_assessment');
      targets.add('ai_complete');
      targets.add('documents_pending');
    }
    return REVERSE_TARGETS.filter((target) => targets.has(target));
  }

  function countEligibleReverseOfferings(
    offeringsForReverse: ManagedOffering[],
    targetStatus: ReverseTargetStatus,
  ): number {
    return getEligibleReverseOfferings(offeringsForReverse, targetStatus).length;
  }

  function canReverseOfferingToTarget(
    offering: ManagedOffering,
    targetStatus: ReverseTargetStatus,
  ): boolean {
    if (
      offering.status === 'pending_assessment' &&
      ['ai_complete', 'documents_pending'].includes(targetStatus)
    ) {
      return true;
    }
    if (
      isSuperAdmin &&
      IN_REVIEW_STATUSES.includes(offering.status) &&
      ['pending_assessment', 'ai_complete', 'documents_pending'].includes(targetStatus)
    ) {
      return true;
    }
    return (
      isSuperAdmin &&
      REVERSIBLE_SIGNED_STATUSES.includes(offering.status) &&
      ['pending_assessment', 'ai_complete', 'documents_pending'].includes(targetStatus)
    );
  }

  function getEligibleReverseOfferings(
    offeringsForReverse: ManagedOffering[],
    targetStatus: ReverseTargetStatus,
  ): ManagedOffering[] {
    return offeringsForReverse.filter((offering) =>
      canReverseOfferingToTarget(offering, targetStatus),
    );
  }

  function getSkippedReverseOfferings(
    offeringsForReverse: ManagedOffering[],
    targetStatus: ReverseTargetStatus,
  ): { offering: ManagedOffering; reason: string }[] {
    return offeringsForReverse.flatMap((offering) => {
      if (canReverseOfferingToTarget(offering, targetStatus)) return [];
      if (
        offering.status === 'pending_assessment' &&
        !['ai_complete', 'documents_pending'].includes(targetStatus)
      ) {
        return [{ offering, reason: 'รายการรอทวนสอบย้อนเป็นสถานะนี้ไม่ได้' }];
      }
      if (REVERSIBLE_SIGNED_STATUSES.includes(offering.status) && !isSuperAdmin) {
        return [{ offering, reason: 'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้น' }];
      }
      if (REVERSIBLE_SIGNED_STATUSES.includes(offering.status)) {
        return [{ offering, reason: 'รายการทวนสอบแล้วย้อนเป็นสถานะนี้ไม่ได้' }];
      }
      if (IN_REVIEW_STATUSES.includes(offering.status) && !isSuperAdmin) {
        return [{ offering, reason: 'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้น' }];
      }
      return [{ offering, reason: 'สถานะปัจจุบันไม่สามารถย้อนกลับได้' }];
    });
  }

  function openReverse(block: ApBlock, year: number, sem: Semester) {
    const targets = getReverseTargets(block);
    if (targets.length === 0) return;
    setMenuKey(null);
    setError(null);
    setReverse({
      label: `${block.label} · ปีการศึกษา ${year} ${SEMESTER_LABEL[sem]}`,
      offerings: block.offerings,
      targets,
      targetStatus: targets[0],
      selectedOfferingIds: getEligibleReverseOfferings(block.offerings, targets[0]).map(
        (offering) => offering.id,
      ),
      skippedOpen: false,
      typed: '',
    });
  }

  function openAssign(block: ApBlock, year: number, sem: Semester) {
    if (!block.academicProgramId) return;
    setMenuKey(null);
    setError(null);
    setAssign({
      label: `${block.label} · ปีการศึกษา ${year} ${SEMESTER_LABEL[sem]}`,
      academicProgramId: block.academicProgramId,
      offerings: block.offerings,
      values: Object.fromEntries(
        block.offerings.map((offering) => [
          offering.id,
          offering.lecturerId
            ? `user:${offering.lecturerId}`
            : offering.pendingLecturerAllowlistId
              ? `allowlist:${offering.pendingLecturerAllowlistId}`
              : '',
        ]),
      ),
    });
  }

  async function confirmAssign() {
    if (!assign) return;
    setBusy(true);
    setError(null);
    const res = await assignOfferingLecturers(
      assign.offerings.map((offering) => ({
        offeringId: offering.id,
        lecturerRef: assign.values[offering.id] || null,
      })),
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.failed.length) {
      setError(
        `มอบหมายบางรายการไม่ได้ — ${res.failed
          .map((f) => `${f.label}: ${f.reason}`)
          .join(', ')}`,
      );
      router.refresh();
      return;
    }
    setAssign(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!del || typed !== 'ยืนยัน') return;
    setBusy(true);
    setError(null);
    try {
      if (isAdmin) {
        await getFirebaseAuth().authStateReady();
        const callable = httpsCallable(getFirebaseFunctions(), 'purgeOffering', {
          timeout: 540_000,
        });
        await callable({ offeringIds: del.offeringIds });
      } else {
        const res = await deleteEmptyOfferings(del.offeringIds);
        if (res.ok && res.failed.length) {
          setError(
            `ลบบางรายการไม่ได้ — ${res.failed.map((f) => `${f.label}: ${f.reason}`).join(', ')}`,
          );
          setBusy(false);
          router.refresh();
          return;
        }
      }
      router.refresh();
      setDel(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
    } finally {
      setBusy(false);
    }
  }

  async function confirmReverse() {
    if (!reverse || reverse.typed !== 'ยืนยัน' || reverse.selectedOfferingIds.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await reverseOfferingStatuses(
      reverse.selectedOfferingIds,
      reverse.targetStatus,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    if (res.failed.length) {
      setError(
        `ย้อนสถานะสำเร็จ ${res.succeeded} รายการ · ข้าม ${res.failed.length} รายการ — ${res.failed
          .map((f) => `${f.label}: ${f.reason}`)
          .join(', ')}`,
      );
      return;
    }
    setReverse(null);
  }

  return (
    <div>
      {/* Filters + add */}
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
        <button
          type="button"
          onClick={() => setModal({ mode: 'add' })}
          disabled={academicPrograms.length === 0}
          className="ml-auto rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          + เพิ่มการเปิดสอน
        </button>
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
                <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {g.count} รายวิชา
                </span>
              </div>

              <div className="space-y-4 px-3 pb-3">
                {g.semesters.map((s) => {
                  const semKey = `${g.year}-${s.sem}`;
                  const semCollapsed = collapsedSems.has(semKey);
                  const semCount = s.programs.reduce((n, p) => n + p.offerings.length, 0);
                  return (
                  <div key={s.sem}>
                    <button
                      type="button"
                      onClick={() => toggleSem(semKey)}
                      className="mb-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-black/5"
                    >
                      <span className={`text-[10px] text-slate-400 transition-transform duration-150 ${semCollapsed ? '' : 'rotate-90'}`}>
                        ▶
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {SEMESTER_LABEL[s.sem]}
                      </span>
                      <span className="ml-1 rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {semCount} รายวิชา
                      </span>
                    </button>
                    {!semCollapsed && (
                    <div className="space-y-2">
                      {s.programs.map((block) => {
                        const key = `${g.year}-${s.sem}-${block.academicProgramId ?? 'none'}`;
                        const blockCollapsed = collapsedBlocks.has(key);
                        const reverseTargets = getReverseTargets(block);
                        return (
                          <div
                            key={key}
                            className="rounded-lg border border-slate-200 bg-white"
                          >
                            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => toggleBlock(key)}
                                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                              >
                                <span className={`shrink-0 text-[10px] text-slate-400 transition-transform duration-150 ${blockCollapsed ? '' : 'rotate-90'}`}>
                                  ▶
                                </span>
                                <span className="truncate text-sm font-medium text-slate-700">
                                  {block.label}
                                </span>
                                <span className="ml-1 shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                  {block.offerings.length}
                                </span>
                              </button>
                              {block.academicProgramId && (
                                <div className="relative" data-offering-group-menu>
                                  <button
                                    type="button"
                                    onClick={(e) => toggleMenu(key, e)}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                    aria-label="จัดการ"
                                  >
                                    ⋮
                                  </button>
                                  {menuKey === key && (
                                    <div
                                      className={`absolute right-0 z-30 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${
                                        menuDir === 'up'
                                          ? 'bottom-full mb-1'
                                          : 'top-full mt-1'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => openEdit(block, g.year, s.sem)}
                                        className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                      >
                                        แก้ไข
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openAssign(block, g.year, s.sem)}
                                        className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                      >
                                        มอบหมายอาจารย์
                                      </button>
                                      {reverseTargets.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => openReverse(block, g.year, s.sem)}
                                          className="block w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
                                        >
                                          ย้อนสถานะ
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => openDelete(block, g.year, s.sem)}
                                        className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                      >
                                        ลบทั้งภาค
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {!blockCollapsed && (
                            <div className={OFFERING_TABLE_WRAPPER_CLASS}>
                              <table className={OFFERING_TABLE_CLASS}>
                                <colgroup>
                                  <col className="w-[18%]" />
                                  <col />
                                  <col className="w-[28%]" />
                                  <col className="w-[18%]" />
                                </colgroup>
                                <thead>
                                  <tr className={OFFERING_TABLE_HEADER_ROW_CLASS}>
                                    <th className={OFFERING_TABLE_HEAD_CELL_CLASS}>รหัสวิชา</th>
                                    <th className={OFFERING_TABLE_HEAD_CELL_CLASS}>ชื่อวิชา</th>
                                    <th className={OFFERING_TABLE_HEAD_CELL_CLASS}>
                                      อาจารย์ผู้รับผิดชอบ
                                    </th>
                                    <th className={OFFERING_TABLE_HEAD_CELL_CLASS}>สถานะ</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {block.offerings.map((o) => {
                                    const lecturerName = resolveLecturerName(o);
                                    const isPending = !o.lecturerId && !!o.pendingLecturerAllowlistId;
                                    const { labelTh, tone } = OFFERING_STATUS[o.status];
                                    return (
                                      <tr
                                        key={o.id}
                                        className={o.isActive ? 'bg-white' : 'bg-amber-50/50'}
                                      >
                                        <td className={OFFERING_TABLE_CODE_CELL_CLASS}>
                                          {o.courseCode}
                                          <PartBadge part={o.part} />
                                          {!o.isActive && (
                                            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                                              ปิด
                                            </span>
                                          )}
                                        </td>
                                        <td className={OFFERING_TABLE_TEXT_CELL_CLASS}>
                                          <div className="truncate" title={o.courseNameTh}>
                                            {o.courseNameTh}
                                          </div>
                                        </td>
                                        <td className={OFFERING_TABLE_TEXT_CELL_CLASS}>
                                          {lecturerName ? (
                                            <div
                                              className="flex min-w-0 items-center gap-1.5 text-slate-700"
                                              title={lecturerName}
                                            >
                                              <span className="truncate">{lecturerName}</span>
                                              {isPending && (
                                                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                                                  รอลงทะเบียน
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="block truncate text-slate-400">
                                              — ยังไม่มอบหมาย
                                            </span>
                                          )}
                                        </td>
                                        <td className={OFFERING_TABLE_STATUS_CELL_CLASS}>
                                          <span className={`${OFFERING_STATUS_PILL_CLASS} ${STATUS_TONE_CLASS[tone]}`}>
                                            {labelTh}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {modal && (
        <BatchOfferingModal
          academicPrograms={academicPrograms}
          isAdmin={isAdmin}
          edit={modal.mode === 'edit' ? modal.edit : undefined}
          existing={existing}
          onClose={() => setModal(null)}
        />
      )}

      {reverse && (() => {
        const eligibleOfferings = getEligibleReverseOfferings(
          reverse.offerings,
          reverse.targetStatus,
        );
        const skippedOfferings = getSkippedReverseOfferings(
          reverse.offerings,
          reverse.targetStatus,
        );
        const selectedIds = new Set(reverse.selectedOfferingIds);
        const selectedCount = reverse.selectedOfferingIds.length;
        const allEligibleSelected =
          eligibleOfferings.length > 0 && selectedCount === eligibleOfferings.length;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={() => !busy && setReverse(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold text-amber-800">ย้อนสถานะการเปิดสอน</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {reverse.label} — {reverse.offerings.length} รายวิชา
              </p>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {reverse.targets.map((target) => {
                  const eligibleCount = countEligibleReverseOfferings(
                    reverse.offerings,
                    target,
                  );
                  const skippedCount = reverse.offerings.length - eligibleCount;
                  return (
                    <label
                      key={target}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                        reverse.targetStatus === target
                          ? 'border-amber-300 bg-amber-50 text-amber-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reverse-target-status"
                        value={target}
                        checked={reverse.targetStatus === target}
                        onChange={() =>
                          setReverse((current) =>
                            current
                              ? {
                                  ...current,
                                  targetStatus: target,
                                  selectedOfferingIds: getEligibleReverseOfferings(
                                    current.offerings,
                                    target,
                                  ).map((offering) => offering.id),
                                  skippedOpen: false,
                                  typed: '',
                                }
                              : current,
                          )
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">
                          ย้อนเป็น {OFFERING_STATUS[target].labelTh}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          เปลี่ยนได้ {eligibleCount} · ข้าม {skippedCount}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">
                      รายวิชาที่จะเปลี่ยน
                    </h3>
                    <p className="text-xs text-slate-500">
                      เลือกแล้ว {selectedCount}/{eligibleOfferings.length} รายการ
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setReverse((current) =>
                          current
                            ? {
                                ...current,
                                selectedOfferingIds: eligibleOfferings.map(
                                  (offering) => offering.id,
                                ),
                              }
                            : current,
                        )
                      }
                      disabled={busy || allEligibleSelected || eligibleOfferings.length === 0}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      เลือกทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setReverse((current) =>
                          current ? { ...current, selectedOfferingIds: [] } : current,
                        )
                      }
                      disabled={busy || selectedCount === 0}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      ล้างที่เลือก
                    </button>
                  </div>
                </div>

                {eligibleOfferings.length === 0 ? (
                  <p className="px-3 py-5 text-center text-sm text-slate-500">
                    ไม่มีรายวิชาที่สามารถย้อนเป็นสถานะนี้ได้
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full table-fixed text-xs">
                      <colgroup>
                        <col className="w-10" />
                        <col className="w-[18%]" />
                        <col />
                        <col className="w-[22%]" />
                        <col className="w-[16%]" />
                      </colgroup>
                      <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-medium text-slate-500">
                        <tr>
                          <th className="px-3 py-2">เลือก</th>
                          <th className="px-3 py-2">รหัสวิชา</th>
                          <th className="px-3 py-2">ชื่อวิชา</th>
                          <th className="px-3 py-2">อาจารย์</th>
                          <th className="px-3 py-2">สถานะเดิม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {eligibleOfferings.map((offering) => {
                          const lecturerName = resolveLecturerName(offering) ?? '—';
                          const { labelTh, tone } = OFFERING_STATUS[offering.status];
                          return (
                            <tr key={offering.id}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(offering.id)}
                                  onChange={(e) =>
                                    setReverse((current) => {
                                      if (!current) return current;
                                      const next = new Set(current.selectedOfferingIds);
                                      e.target.checked
                                        ? next.add(offering.id)
                                        : next.delete(offering.id);
                                      return {
                                        ...current,
                                        selectedOfferingIds: [...next],
                                        typed: '',
                                      };
                                    })
                                  }
                                />
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">
                                {offering.courseCode}
                                <PartBadge part={offering.part} />
                              </td>
                              <td className="min-w-0 px-3 py-2 text-slate-600">
                                <div className="truncate" title={offering.courseNameTh}>
                                  {offering.courseNameTh}
                                </div>
                              </td>
                              <td className="min-w-0 px-3 py-2 text-slate-600">
                                <div className="truncate" title={lecturerName}>
                                  {lecturerName}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                <span className={`${OFFERING_STATUS_PILL_CLASS} ${STATUS_TONE_CLASS[tone]}`}>
                                  {labelTh}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() =>
                    setReverse((current) =>
                      current ? { ...current, skippedOpen: !current.skippedOpen } : current,
                    )
                  }
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <span>ข้าม {skippedOfferings.length} รายการ</span>
                  <span className="text-xs text-slate-400">
                    {reverse.skippedOpen ? 'ซ่อน' : 'แสดง'}
                  </span>
                </button>
                {reverse.skippedOpen && (
                  skippedOfferings.length === 0 ? (
                    <p className="border-t border-slate-100 px-3 py-3 text-sm text-slate-500">
                      ไม่มีรายการที่ถูกข้าม
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto border-t border-slate-100">
                      <table className="w-full table-fixed text-xs">
                        <colgroup>
                          <col className="w-[18%]" />
                          <col />
                          <col className="w-[18%]" />
                          <col className="w-[28%]" />
                        </colgroup>
                        <tbody className="divide-y divide-slate-100">
                          {skippedOfferings.map(({ offering, reason }) => {
                            const { labelTh, tone } = OFFERING_STATUS[offering.status];
                            return (
                              <tr key={offering.id}>
                                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">
                                  {offering.courseCode}
                                  <PartBadge part={offering.part} />
                                </td>
                                <td className="min-w-0 px-3 py-2 text-slate-600">
                                  <div className="truncate" title={offering.courseNameTh}>
                                    {offering.courseNameTh}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2">
                                  <span className={`${OFFERING_STATUS_PILL_CLASS} ${STATUS_TONE_CLASS[tone]}`}>
                                    {labelTh}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-500">{reason}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>

              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                ระบบจะเก็บรายงาน AI ผลทวนสอบ และไฟล์ PDF เดิมไว้ทั้งหมด หากย้อนจาก
                “ทวนสอบแล้ว” ระบบจะปลดล็อกผลทวนสอบให้กลับไปแก้ไขได้
              </p>

              <label className="mt-3 block text-xs text-slate-600">
                พิมพ์ <strong>ยืนยัน</strong> เพื่อดำเนินการ
                <input
                  type="text"
                  value={reverse.typed}
                  onChange={(e) =>
                    setReverse((current) =>
                      current ? { ...current, typed: e.target.value } : current,
                    )
                  }
                  placeholder="ยืนยัน"
                  className="mt-1 w-full rounded border border-amber-300 px-2 py-1 text-sm focus:border-red-500 focus:outline-none"
                />
              </label>
              {error && (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReverse(null)}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={confirmReverse}
                  disabled={busy || reverse.typed !== 'ยืนยัน' || selectedCount === 0}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? 'กำลังย้อนสถานะ…' : `ย้อนสถานะ ${selectedCount} รายการ`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {del && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !busy && setDel(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-red-700">ลบการเปิดสอนทั้งภาค</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {del.label} — {del.offeringIds.length} รายวิชา
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {isAdmin
                ? 'ระบบจะลบรายวิชาที่เปิดสอนทั้งหมดในกลุ่มนี้พร้อมข้อมูลที่เกี่ยวข้องอย่างถาวร (รายงาน AI ผลทวนสอบ ผลรับรอง และไฟล์ PDF) — ไม่สามารถย้อนกลับได้'
                : 'ระบบจะลบเฉพาะรายวิชาที่ยังไม่มีข้อมูลวิเคราะห์/ทวนสอบ (สถานะ ร่าง หรือ รอเอกสาร) รายการที่มีข้อมูลแล้วต้องให้ผู้ดูแลระบบลบถาวร'}
            </p>
            <label className="mt-3 block text-xs text-slate-600">
              พิมพ์ <strong>ยืนยัน</strong> เพื่อดำเนินการ
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="ยืนยัน"
                className="mt-1 w-full rounded border border-red-300 px-2 py-1 text-sm focus:border-red-500 focus:outline-none"
              />
            </label>
            {error && (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDel(null)}
                disabled={busy}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy || typed !== 'ยืนยัน'}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'กำลังลบ…' : 'ลบทั้งภาค'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assign && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => !busy && setAssign(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">
                  มอบหมายอาจารย์
                </h2>
                <p className="mt-1 text-sm text-slate-500">{assign.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setAssign(null)}
                disabled={busy}
                className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50"
              >
                ปิด
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[1fr_1.2fr] bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                <span>รายวิชา</span>
                <span>อาจารย์ผู้รับผิดชอบ</span>
              </div>
              <div className="divide-y divide-slate-100">
                {assign.offerings.map((offering) => {
                  const selectedValue = assign.values[offering.id] ?? '';
                  const selectedExists =
                    selectedValue === '' ||
                    assignEligibleLecturers.some(
                      (lecturer) => lecturerOptionValue(lecturer) === selectedValue,
                    );
                  return (
                    <div
                      key={offering.id}
                      className="grid grid-cols-[1fr_1.2fr] items-center gap-3 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {offering.courseCode}
                          <PartBadge part={offering.part} />
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {offering.courseNameTh}
                        </p>
                      </div>
                      <select
                        value={selectedValue}
                        onChange={(e) =>
                          setAssign((current) =>
                            current
                              ? {
                                  ...current,
                                  values: {
                                    ...current.values,
                                    [offering.id]: e.target.value,
                                  },
                                }
                              : current,
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none"
                      >
                        <option value="">— ยังไม่มอบหมาย —</option>
                        {!selectedExists && selectedValue && (
                          <option value={selectedValue}>
                            ปัจจุบัน:{' '}
                            {offering.lecturerEmail ??
                              offering.pendingLecturerEmail ??
                              selectedValue}
                          </option>
                        )}
                        {assignEligibleLecturers.map((lecturer) => (
                          <option
                            key={`${lecturer.kind}:${lecturer.id}`}
                            value={lecturerOptionValue(lecturer)}
                          >
                            {lecturer.nameTh} ({lecturer.email}) ·{' '}
                            {lecturer.isActive ? 'ใช้งาน' : 'รอลงทะเบียน'}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {assignEligibleLecturers.length === 0 && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                ยังไม่มีอาจารย์ที่มอบหมายให้หลักสูตรนี้ กรุณาเพิ่มจากหน้า
                มอบหมายอาจารย์ประจำหลักสูตรก่อน
              </p>
            )}

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssign(null)}
                disabled={busy}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmAssign}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'กำลังมอบหมาย…' : 'มอบหมายอาจารย์'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
