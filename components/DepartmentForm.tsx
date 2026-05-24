'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createDepartment,
  updateDepartment,
  type DepartmentFormData,
} from '@/app/admin/departments/actions';

const EMPTY: DepartmentFormData = {
  nameTh: '',
  nameEn: '',
  isActive: true,
};

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none';

export default function DepartmentForm({
  mode,
  deptId,
  initial,
}: {
  mode: 'create' | 'edit';
  deptId?: string;
  initial?: DepartmentFormData;
}) {
  const router = useRouter();
  const [form, setForm] = useState<DepartmentFormData>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof DepartmentFormData>(
    key: K,
    value: DepartmentFormData[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res =
      mode === 'create'
        ? await createDepartment(form)
        : await updateDepartment(deptId!, form);
    if (res.ok) {
      router.push('/admin/departments');
      router.refresh();
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">ข้อมูลสาขาวิชา</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            ชื่อสาขาวิชา (ไทย)
            <input
              className={inputCls}
              value={form.nameTh}
              onChange={(e) => set('nameTh', e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            ชื่อสาขาวิชา (อังกฤษ)
            <input
              className={inputCls}
              value={form.nameEn}
              onChange={(e) => set('nameEn', e.target.value)}
            />
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
              ? 'เพิ่มสาขาวิชา'
              : 'บันทึกการแก้ไข'}
        </button>
        <button
          onClick={() => router.push('/admin/departments')}
          disabled={busy}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
