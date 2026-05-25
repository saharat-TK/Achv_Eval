'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import {
  loadCurriculumsWithCourses,
  bulkCreateOfferings,
  deleteEmptyOfferings,
} from '@/app/admin/offering-manager/actions';
import DualListSelector, { type DualListItem } from '@/components/DualListSelector';
import { SEMESTER_LABEL } from '@/lib/constants';
import type { Semester } from '@/lib/types/models';
import type { CurriculumWithCourses } from '@/lib/data/offeringManager';

export interface ProgramOpt {
  id: string;
  code: string;
  nameTh: string;
}

export interface EditContext {
  academicProgramId: string;
  academicProgramLabel: string;
  academicYear: number;
  semester: Semester;
  initial: { courseId: string; offeringId: string; code: string; nameTh: string }[];
}

const SEMESTERS: Semester[] = ['1', '2', '3'];

export default function BatchOfferingModal({
  academicPrograms,
  isAdmin,
  edit,
  existing,
  onClose,
}: {
  academicPrograms: ProgramOpt[];
  isAdmin: boolean;
  edit?: EditContext;
  existing: { courseId: string; academicYear: number; semester: Semester }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const currentBE = new Date().getFullYear() + 543;
  const years = Array.from({ length: 11 }, (_, i) => currentBE - 5 + i);

  const [apId, setApId] = useState(edit?.academicProgramId ?? academicPrograms[0]?.id ?? '');
  const [year, setYear] = useState<number>(edit?.academicYear ?? currentBE);
  const [semester, setSemester] = useState<Semester>(edit?.semester ?? '1');
  const [curriculums, setCurriculums] = useState<CurriculumWithCourses[]>([]);
  const [activeCurr, setActiveCurr] = useState('');
  const [selected, setSelected] = useState<DualListItem[]>(
    edit ? edit.initial.map((i) => ({ id: i.courseId, code: i.code, nameTh: i.nameTh })) : [],
  );
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load curriculums + courses for the chosen academic program.
  useEffect(() => {
    if (!apId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadCurriculumsWithCourses(apId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setCurriculums(res.curriculums);
        setActiveCurr(res.curriculums[0]?.id ?? '');
      } else {
        setError(res.error);
        setCurriculums([]);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apId]);

  const available: DualListItem[] = useMemo(() => {
    const c = curriculums.find((x) => x.id === activeCurr);
    return c ? c.courses : [];
  }, [curriculums, activeCurr]);

  const alreadyOffered = useMemo(() => {
    const set = new Set<string>();
    for (const e of existing) {
      if (e.academicYear === year && e.semester === semester) set.add(e.courseId);
    }
    return set;
  }, [existing, year, semester]);

  function changeProgram(v: string) {
    setApId(v);
    if (!edit) setSelected([]); // different program scope
  }

  async function save() {
    if (selected.length === 0 && !edit) {
      setError('กรุณาเลือกรายวิชาอย่างน้อย 1 รายการ');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (edit) {
        const selIds = new Set(selected.map((s) => s.id));
        const initialIds = new Set(edit.initial.map((i) => i.courseId));
        const added = selected.filter((s) => !initialIds.has(s.id)).map((s) => s.id);
        const removedOfferingIds = edit.initial
          .filter((i) => !selIds.has(i.courseId))
          .map((i) => i.offeringId);

        if (added.length) {
          const res = await bulkCreateOfferings({ academicYear: year, semester, courseIds: added });
          if (!res.ok) {
            setError(res.error);
            setBusy(false);
            return;
          }
        }
        if (removedOfferingIds.length) {
          if (isAdmin) {
            await getFirebaseAuth().authStateReady();
            const callable = httpsCallable(getFirebaseFunctions(), 'purgeOffering', {
              timeout: 540_000,
            });
            await callable({ offeringIds: removedOfferingIds });
          } else {
            const res = await deleteEmptyOfferings(removedOfferingIds);
            if (res.ok && res.failed.length) {
              setError(
                `นำออกบางรายการไม่ได้ — ${res.failed
                  .map((f) => `${f.label}: ${f.reason}`)
                  .join(', ')}`,
              );
              setBusy(false);
              router.refresh();
              return;
            }
          }
        }
      } else {
        const res = await bulkCreateOfferings({
          academicYear: year,
          semester,
          courseIds: selected.map((s) => s.id),
        });
        if (!res.ok) {
          setError(res.error);
          setBusy(false);
          return;
        }
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      setBusy(false);
    }
  }

  const fieldCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="my-8 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-800">
            {edit ? 'แก้ไขการเปิดสอน' : 'เพิ่มการเปิดสอน'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ปิด
          </button>
        </div>

        {/* Term fields */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-600">
            หลักสูตร
            <select
              className={fieldCls}
              value={apId}
              disabled={!!edit}
              onChange={(e) => changeProgram(e.target.value)}
            >
              {academicPrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.nameTh}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            ปีการศึกษา (พ.ศ.)
            <select
              className={fieldCls}
              value={year}
              disabled={!!edit}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            ภาคการศึกษา
            <select
              className={fieldCls}
              value={semester}
              disabled={!!edit}
              onChange={(e) => setSemester(e.target.value as Semester)}
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {SEMESTER_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Curriculum switcher */}
        {curriculums.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {curriculums.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCurr(c.id)}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${
                  c.id === activeCurr
                    ? 'bg-mfu-primary text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c.code}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-400">กำลังโหลดรายวิชา…</p>
          ) : (
            <DualListSelector
              available={available}
              selected={selected}
              alreadyOffered={alreadyOffered}
              onAdd={(items) => setSelected((prev) => [...prev, ...items])}
              onRemove={(ids) =>
                setSelected((prev) => prev.filter((s) => !ids.includes(s.id)))
              }
            />
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'กำลังบันทึก…' : edit ? 'บันทึกการแก้ไข' : `ยืนยันการเปิดสอน (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
