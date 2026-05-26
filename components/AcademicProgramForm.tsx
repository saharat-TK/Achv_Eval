'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createAcademicProgram,
  updateAcademicProgram,
  type AcademicProgramFormData,
} from '@/app/admin/academic-programs/actions';
import { PROGRAM_LEVEL_LABEL } from '@/lib/constants';
import type { ProgramLevel } from '@/lib/types/models';

export interface DepartmentOption {
  id: string;
  nameTh: string;
  isActive: boolean;
}

const EMPTY: AcademicProgramFormData = {
  code: '',
  nameTh: '',
  nameEn: '',
  level: 'undergraduate',
  departmentId: null,
  isActive: true,
};

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none';

export default function AcademicProgramForm({
  mode,
  programId,
  initial,
  departments,
}: {
  mode: 'create' | 'edit';
  programId?: string;
  initial?: AcademicProgramFormData;
  departments: DepartmentOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<AcademicProgramFormData>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  function set<K extends keyof AcademicProgramFormData>(
    key: K,
    value: AcademicProgramFormData[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleCodeChange(raw: string) {
    // Strip every non-digit character and cap at 7.
    const digits = raw.replace(/\D/g, '').slice(0, 7);
    set('code', digits);
    if (digits.length > 0 && digits.length < 7) {
      setCodeError(`ต้องการ 7 หลัก (ป้อนแล้ว ${digits.length} หลัก)`);
    } else {
      setCodeError(null);
    }
  }

  function validateCode(): boolean {
    const code = form.code.trim();
    if (!/^\d{7}$/.test(code)) {
      setCodeError('รหัสหลักสูตรต้องเป็นตัวเลข 7 หลักพอดี เช่น 3180800');
      return false;
    }
    setCodeError(null);
    return true;
  }

  async function submit() {
    if (!validateCode()) return;
    setBusy(true);
    setError(null);
    const res =
      mode === 'create'
        ? await createAcademicProgram(form)
        : await updateAcademicProgram(programId!, form);
    if (res.ok) {
      router.push('/admin/academic-programs');
      router.refresh();
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">ข้อมูลหลักสูตร</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            รหัสหลักสูตร
            <input
              className={`${inputCls} font-mono tracking-widest ${codeError ? 'border-red-400 focus:border-red-500' : ''}`}
              value={form.code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onBlur={validateCode}
              inputMode="numeric"
              maxLength={7}
              placeholder="เช่น 3180800"
              autoComplete="off"
              spellCheck={false}
            />
            {codeError ? (
              <p className="mt-1 text-xs text-red-600">{codeError}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">ตัวเลข 7 หลัก เช่น 3180800</p>
            )}
          </label>
          <label className="text-sm text-slate-600">
            สาขาวิชา
            <select
              className={inputCls}
              value={form.departmentId ?? ''}
              onChange={(e) =>
                set('departmentId', e.target.value ? e.target.value : null)
              }
            >
              <option value="">— ไม่ระบุ —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nameTh}
                  {d.isActive ? '' : ' (ปิดใช้งาน)'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            ชื่อหลักสูตร (ไทย)
            <input
              className={inputCls}
              value={form.nameTh}
              onChange={(e) => set('nameTh', e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            ชื่อหลักสูตร (อังกฤษ)
            <input
              className={inputCls}
              value={form.nameEn}
              onChange={(e) => set('nameEn', e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            ระดับ
            <select
              className={inputCls}
              value={form.level}
              onChange={(e) => set('level', e.target.value as ProgramLevel)}
            >
              {(Object.keys(PROGRAM_LEVEL_LABEL) as ProgramLevel[]).map((l) => (
                <option key={l} value={l}>
                  {PROGRAM_LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-mfu-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? 'กำลังบันทึก…'
            : mode === 'create'
              ? 'เพิ่มหลักสูตร'
              : 'บันทึกการแก้ไข'}
        </button>
        <button
          onClick={() => router.push('/admin/academic-programs')}
          disabled={busy}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
