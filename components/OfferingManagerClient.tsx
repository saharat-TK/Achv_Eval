'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import { deleteEmptyOfferings } from '@/app/admin/offering-manager/actions';
import BatchOfferingModal, {
  type ProgramOpt,
  type EditContext,
} from '@/components/BatchOfferingModal';
import { SEMESTER_LABEL } from '@/lib/constants';
import type { Semester } from '@/lib/types/models';
import type { ManagedOffering } from '@/lib/data/offeringManager';

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

export default function OfferingManagerClient({
  offerings,
  academicPrograms,
  isAdmin,
}: {
  offerings: ManagedOffering[];
  academicPrograms: ProgramOpt[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: 'add' } | { mode: 'edit'; edit: EditContext } | null>(
    null,
  );
  const [del, setDel] = useState<{ label: string; offeringIds: string[] } | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [menuDir, setMenuDir] = useState<'up' | 'down'>('down');

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
                {g.semesters.map((s) => (
                  <div key={s.sem}>
                    <h3 className="mb-1 px-1 text-xs font-semibold text-slate-500">
                      {SEMESTER_LABEL[s.sem]}
                    </h3>
                    <div className="space-y-2">
                      {s.programs.map((block) => {
                        const key = `${g.year}-${s.sem}-${block.academicProgramId ?? 'none'}`;
                        return (
                          <div
                            key={key}
                            className="rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-slate-700">
                                {block.label}
                              </p>
                              {block.academicProgramId && (
                                <div className="relative">
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
                                      className={`absolute right-0 z-30 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${
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
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {block.offerings.map((o) => (
                                <span
                                  key={o.id}
                                  title={o.courseNameTh}
                                  className={`rounded-md border px-2 py-0.5 text-xs ${
                                    o.isActive
                                      ? 'border-slate-200 bg-slate-50 text-slate-700'
                                      : 'border-amber-200 bg-amber-50 text-amber-700'
                                  }`}
                                >
                                  {o.courseCode}
                                  {!o.isActive && ' (ปิด)'}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
    </div>
  );
}
