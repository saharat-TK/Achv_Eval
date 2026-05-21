'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createProgram,
  updateProgram,
  type ProgramFormData,
} from '@/app/admin/programs/actions';
import {
  PROGRAM_LEVEL_LABEL,
  PLO_SCHEMA_LABEL,
  PLO_DOMAIN_LABEL,
} from '@/lib/constants';
import type { ProgramLevel, PloSchema, PloDomain } from '@/lib/types/models';

export interface DepartmentOption {
  id: string;
  nameTh: string;
  isActive: boolean;
}

const DOMAINS = Object.keys(PLO_DOMAIN_LABEL) as PloDomain[];

const EMPTY: ProgramFormData = {
  code: '',
  nameTh: '',
  nameEn: '',
  school: 'Health Science',
  level: 'undergraduate',
  ploDomainSchema: '6_domain_tqf',
  isActive: true,
  departmentId: null,
  plos: [],
};

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-mfu-primary focus:outline-none';

export default function ProgramForm({
  mode,
  programId,
  initial,
  departments = [],
  canEditDepartment = true,
}: {
  mode: 'create' | 'edit';
  programId?: string;
  initial?: ProgramFormData;
  /** Department options for the dropdown. Empty list → field is hidden. */
  departments?: DepartmentOption[];
  /** When false, the dropdown renders disabled (director view). */
  canEditDepartment?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProgramFormData>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProgramFormData>(key: K, value: ProgramFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setPlo(index: number, patch: Partial<ProgramFormData['plos'][number]>) {
    setForm((f) => ({
      ...f,
      plos: f.plos.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }

  function addPlo() {
    setForm((f) => ({
      ...f,
      plos: [
        ...f.plos,
        {
          ploNumber: f.plos.length + 1,
          domain: 'knowledge',
          descriptionTh: '',
          descriptionEn: '',
        },
      ],
    }));
  }

  function removePlo(index: number) {
    setForm((f) => ({ ...f, plos: f.plos.filter((_, i) => i !== index) }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res =
      mode === 'create'
        ? await createProgram(form)
        : await updateProgram(programId!, form);
    if (res.ok) {
      router.push('/admin');
      router.refresh();
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Program info */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">ข้อมูลหลักสูตร</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            รหัสหลักสูตร
            <input
              className={inputCls}
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            สำนักวิชา
            <input
              className={inputCls}
              value={form.school}
              onChange={(e) => set('school', e.target.value)}
            />
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
          {departments.length > 0 && (
            <label className="text-sm text-slate-600">
              สาขาวิชา
              <select
                className={inputCls}
                disabled={!canEditDepartment}
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
                {form.departmentId &&
                  !departments.some((d) => d.id === form.departmentId) && (
                    <option value={form.departmentId}>
                      (ลบแล้ว)
                    </option>
                  )}
              </select>
            </label>
          )}
          <label className="text-sm text-slate-600">
            โครงสร้าง PLO
            <select
              className={inputCls}
              value={form.ploDomainSchema}
              onChange={(e) => set('ploDomainSchema', e.target.value as PloSchema)}
            >
              {(Object.keys(PLO_SCHEMA_LABEL) as PloSchema[]).map((s) => (
                <option key={s} value={s}>
                  {PLO_SCHEMA_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {mode === 'create' && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
            />
            เปิดใช้งานหลักสูตร
          </label>
        )}
      </section>

      {/* PLOs */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            ผลลัพธ์การเรียนรู้ของหลักสูตร (PLO)
          </h2>
          <button
            type="button"
            onClick={addPlo}
            className="text-sm text-mfu-primary hover:underline"
          >
            + เพิ่ม PLO
          </button>
        </div>

        {form.plos.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">ยังไม่มี PLO</p>
        ) : (
          <div className="mt-3 space-y-3">
            {form.plos.map((plo, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="grid gap-3 sm:grid-cols-[80px_1fr_1fr_110px]">
                  <label className="text-xs text-slate-500">
                    PLO ที่
                    <input
                      type="number"
                      min={1}
                      className={inputCls}
                      value={plo.ploNumber}
                      onChange={(e) =>
                        setPlo(i, { ploNumber: Number(e.target.value) || 1 })
                      }
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    ด้าน (Domain)
                    <select
                      className={inputCls}
                      value={plo.domain}
                      onChange={(e) =>
                        setPlo(i, { domain: e.target.value as PloDomain })
                      }
                    >
                      {DOMAINS.map((d) => (
                        <option key={d} value={d}>
                          {PLO_DOMAIN_LABEL[d]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-500">
                    ระดับ Bloom
                    <select
                      className={inputCls}
                      value={plo.bloomLevel ?? ''}
                      onChange={(e) =>
                        setPlo(i, {
                          bloomLevel: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    >
                      <option value="">ไม่ระบุ</option>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          L{n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => removePlo(i)}
                    className="self-end rounded-lg border border-slate-300 px-2 py-2 text-xs text-red-600 hover:bg-red-50"
                  >
                    ลบ
                  </button>
                </div>
                <label className="mt-2 block text-xs text-slate-500">
                  คำอธิบาย PLO (ไทย)
                  <textarea
                    rows={2}
                    className={inputCls}
                    value={plo.descriptionTh}
                    onChange={(e) =>
                      setPlo(i, { descriptionTh: e.target.value })
                    }
                  />
                </label>
                <label className="mt-2 block text-xs text-slate-500">
                  คำอธิบาย PLO (อังกฤษ) — ไม่บังคับ
                  <textarea
                    rows={2}
                    className={inputCls}
                    value={plo.descriptionEn ?? ''}
                    onChange={(e) =>
                      setPlo(i, { descriptionEn: e.target.value })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-mfu-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'กำลังบันทึก…' : mode === 'create' ? 'เพิ่มหลักสูตร' : 'บันทึกการแก้ไข'}
        </button>
        <button
          onClick={() => router.push('/admin')}
          disabled={busy}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
