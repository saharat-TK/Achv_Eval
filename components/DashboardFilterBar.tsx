'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OFFERING_STATUS, SEMESTER_LABEL } from '@/lib/constants';
import type { OfferingStatus, Semester } from '@/lib/types/models';

export interface DeptOption {
  id: string;
  nameTh: string;
}

export interface AcademicProgramOption {
  id: string;
  code: string;
  nameTh: string;
  departmentId?: string | null;
}

const selectCls =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700';

export default function DashboardFilterBar({
  departments,
  academicPrograms,
  availableAcademicYears,
  defaultDepartmentId,
  defaultAcademicProgramId,
  defaultAcademicYear,
  defaultSemester,
  defaultStatus,
}: {
  departments: DeptOption[];
  academicPrograms: AcademicProgramOption[];
  availableAcademicYears: number[];
  defaultDepartmentId?: string;
  defaultAcademicProgramId?: string;
  defaultAcademicYear?: number;
  defaultSemester?: Semester;
  defaultStatus?: OfferingStatus;
}) {
  const router = useRouter();

  const [deptId, setDeptId] = useState(defaultDepartmentId ?? '');
  const [apId, setApId] = useState(defaultAcademicProgramId ?? '');
  const [year, setYear] = useState(defaultAcademicYear ? String(defaultAcademicYear) : '');
  const [semester, setSemester] = useState<string>(defaultSemester ?? '');
  const [status, setStatus] = useState<string>(defaultStatus ?? '');

  /** APs visible in the second dropdown (filtered by chosen department). */
  const visibleAps = deptId
    ? academicPrograms.filter((ap) => ap.departmentId === deptId)
    : academicPrograms;

  function handleDeptChange(newDeptId: string) {
    setDeptId(newDeptId);
    // Reset AP selection when it no longer belongs to the new department.
    if (newDeptId && apId) {
      const still = academicPrograms.some(
        (ap) => ap.id === apId && ap.departmentId === newDeptId,
      );
      if (!still) setApId('');
    }
  }

  function handleSubmit() {
    const params = new URLSearchParams();
    if (deptId) params.set('departmentId', deptId);
    if (apId) params.set('academicProgramId', apId);
    if (year) params.set('academicYear', year);
    if (semester) params.set('semester', semester);
    if (status) params.set('status', status);
    const q = params.toString();
    router.push(`/admin/dashboard${q ? `?${q}` : ''}`);
  }

  function handleClear() {
    setDeptId('');
    setApId('');
    setYear('');
    setSemester('');
    setStatus('');
    router.push('/admin/dashboard');
  }

  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1fr_1.3fr_0.75fr_0.75fr_1fr_auto]">
      {/* 1 — Department */}
      <label className="text-sm">
        <span className="text-xs font-medium text-slate-500">สาขาวิชา</span>
        <select
          value={deptId}
          onChange={(e) => handleDeptChange(e.target.value)}
          className={selectCls}
        >
          <option value="">ทุกสาขาวิชา</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nameTh}
            </option>
          ))}
        </select>
      </label>

      {/* 2 — Academic Program (reactive to department) */}
      <label className="text-sm">
        <span className="text-xs font-medium text-slate-500">หลักสูตร (Academic Program)</span>
        <select
          value={apId}
          onChange={(e) => setApId(e.target.value)}
          className={selectCls}
        >
          <option value="">ทุกหลักสูตร</option>
          {visibleAps.map((ap) => (
            <option key={ap.id} value={ap.id}>
              {ap.code} — {ap.nameTh}
            </option>
          ))}
        </select>
      </label>

      {/* 3 — Academic year */}
      <label className="text-sm">
        <span className="text-xs font-medium text-slate-500">ปีการศึกษา</span>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className={selectCls}
        >
          <option value="">ทุกปี</option>
          {availableAcademicYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      {/* 4 — Semester */}
      <label className="text-sm">
        <span className="text-xs font-medium text-slate-500">ภาคการศึกษา</span>
        <select
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          className={selectCls}
        >
          <option value="">ทุกภาค</option>
          {(Object.keys(SEMESTER_LABEL) as Semester[]).map((s) => (
            <option key={s} value={s}>
              {SEMESTER_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      {/* 5 — Status */}
      <label className="text-sm">
        <span className="text-xs font-medium text-slate-500">สถานะ</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectCls}
        >
          <option value="">ทุกสถานะ</option>
          {Object.entries(OFFERING_STATUS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.labelTh}
            </option>
          ))}
        </select>
      </label>

      {/* 6 — Actions */}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          กรองข้อมูล
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ล้าง
        </button>
      </div>
    </div>
  );
}
