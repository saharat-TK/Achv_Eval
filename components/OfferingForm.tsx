'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SEMESTER_LABEL } from '@/lib/constants';
import type { Semester } from '@/lib/types/models';
import {
  createOffering,
  updateOffering,
  type OfferingFormData,
} from '@/app/admin/programs/[programId]/offerings/actions';

export interface CourseOption {
  id: string;
  code: string;
  nameTh: string;
}
export interface LecturerOption {
  id: string;
  nameTh: string;
  email: string;
}
export interface PloOption {
  ploNumber: number;
  descriptionTh: string;
}

const SEMESTERS: Semester[] = ['1', '2', '3'];

export default function OfferingForm({
  mode,
  programId,
  offeringId,
  courses,
  lecturers,
  plos,
  initial,
}: {
  mode: 'create' | 'edit';
  programId: string;
  offeringId?: string;
  courses: CourseOption[];
  lecturers: LecturerOption[];
  plos: PloOption[];
  initial?: OfferingFormData;
}) {
  const router = useRouter();
  const [data, setData] = useState<OfferingFormData>(
    initial ?? {
      courseId: '',
      academicYear: new Date().getFullYear() + 543,
      semester: '1',
      section: '1',
      part: 1,
      lecturerId: null,
      hasExamAssessment: true,
      assignedPloNumbers: [],
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof OfferingFormData>(key: K, value: OfferingFormData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function togglePlo(n: number) {
    setData((d) => ({
      ...d,
      assignedPloNumbers: d.assignedPloNumbers.includes(n)
        ? d.assignedPloNumbers.filter((x) => x !== n)
        : [...d.assignedPloNumbers, n].sort((a, b) => a - b),
    }));
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    const res =
      mode === 'create'
        ? await createOffering(programId, data)
        : await updateOffering(programId, offeringId!, data);
    if (res.ok) {
      router.push(`/admin/programs/${programId}/offerings`);
      router.refresh();
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">ข้อมูลรายวิชาที่เปิดสอน</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="รายวิชา">
            <select
              className={inputCls}
              value={data.courseId}
              onChange={(e) => set('courseId', e.target.value)}
            >
              <option value="">— เลือกรายวิชา —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.nameTh}
                </option>
              ))}
            </select>
          </Field>
          <Field label="อาจารย์ผู้รับผิดชอบรายวิชา">
            <select
              className={inputCls}
              value={data.lecturerId ?? ''}
              onChange={(e) => set('lecturerId', e.target.value || null)}
            >
              <option value="">— ยังไม่กำหนด —</option>
              {lecturers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nameTh} ({l.email})
                </option>
              ))}
            </select>
          </Field>
          <Field label="ปีการศึกษา (พ.ศ.)">
            <input
              type="number"
              className={inputCls}
              value={data.academicYear}
              onChange={(e) => set('academicYear', Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="ภาคการศึกษา">
            <select
              className={inputCls}
              value={data.semester}
              onChange={(e) => set('semester', e.target.value as Semester)}
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {SEMESTER_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ตอนเรียน">
            <input
              className={inputCls}
              value={data.section}
              onChange={(e) => set('section', e.target.value)}
            />
          </Field>
          <Field label="ส่วนที่ลงทะเบียน (วิทยานิพนธ์)">
            <select
              className={inputCls}
              value={data.part ?? 1}
              onChange={(e) => set('part', Number(e.target.value))}
            >
              <option value={1}>— วิชาทั่วไป / ส่วนที่ 1 —</option>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  ส่วนที่ {n}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-400">
              สำหรับวิทยานิพนธ์/ดุษฎีนิพนธ์ที่ใช้รหัสวิชาเดียวกันแต่ลงทะเบียนหลายส่วน
            </span>
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={data.hasExamAssessment}
            onChange={(e) => set('hasExamAssessment', e.target.checked)}
          />
          รายวิชานี้มีการประเมินด้วยข้อสอบ (มีผลต่อหัวข้อ 3.4 ในการทวนสอบ)
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">
          PLO ที่รายวิชานี้รับผิดชอบ
        </h2>
        {plos.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            หลักสูตรนี้ยังไม่มี PLO — เพิ่ม PLO ในหน้าหลักสูตรก่อน
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {plos.map((p) => (
              <label key={p.ploNumber} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={data.assignedPloNumbers.includes(p.ploNumber)}
                  onChange={() => togglePlo(p.ploNumber)}
                />
                <span className="text-slate-700">
                  <span className="font-medium">PLO {p.ploNumber}</span> —{' '}
                  {p.descriptionTh}
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? 'กำลังบันทึก…'
            : mode === 'create'
              ? 'เพิ่มรายวิชาที่เปิดสอน'
              : 'บันทึกการแก้ไข'}
        </button>
        <button
          onClick={() => router.push(`/admin/programs/${programId}/offerings`)}
          disabled={busy}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-mfu-primary focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
