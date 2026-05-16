'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCourse,
  updateCourse,
  type CourseFormData,
} from '@/app/admin/programs/[programId]/courses/actions';
import { COURSE_TYPE_LABEL } from '@/lib/constants';
import type { CourseType } from '@/lib/types/models';

const EMPTY: CourseFormData = {
  code: '',
  nameTh: '',
  nameEn: '',
  creditStructure: '',
  type: 'theory',
  yearOfStudy: null,
  isActive: true,
};

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none';

export default function CourseForm({
  mode,
  programId,
  courseId,
  initial,
}: {
  mode: 'create' | 'edit';
  programId: string;
  courseId?: string;
  initial?: CourseFormData;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CourseFormData>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CourseFormData>(key: K, value: CourseFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res =
      mode === 'create'
        ? await createCourse(programId, form)
        : await updateCourse(programId, courseId!, form);
    if (res.ok) {
      router.push(`/admin/programs/${programId}/courses`);
      router.refresh();
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  const backHref = `/admin/programs/${programId}/courses`;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            รหัสวิชา
            <input
              className={inputCls}
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            โครงสร้างหน่วยกิต (เช่น 2(2-0-4))
            <input
              className={inputCls}
              value={form.creditStructure}
              onChange={(e) => set('creditStructure', e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            ชื่อวิชา (ไทย)
            <input
              className={inputCls}
              value={form.nameTh}
              onChange={(e) => set('nameTh', e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            ชื่อวิชา (อังกฤษ)
            <input
              className={inputCls}
              value={form.nameEn}
              onChange={(e) => set('nameEn', e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            ประเภทวิชา
            <select
              className={inputCls}
              value={form.type}
              onChange={(e) => set('type', e.target.value as CourseType)}
            >
              {(Object.keys(COURSE_TYPE_LABEL) as CourseType[]).map((t) => (
                <option key={t} value={t}>
                  {COURSE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            ชั้นปี
            <select
              className={inputCls}
              value={form.yearOfStudy ?? ''}
              onChange={(e) =>
                set('yearOfStudy', e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">ไม่ระบุ</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  ปี {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          เปิดใช้งานรายวิชา
        </label>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-mfu-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'กำลังบันทึก…' : mode === 'create' ? 'เพิ่มรายวิชา' : 'บันทึกการแก้ไข'}
        </button>
        <button
          onClick={() => router.push(backHref)}
          disabled={busy}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
