'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SEMESTER_LABEL } from '@/lib/constants';
import type { Semester } from '@/lib/types/models';
import { cloneOfferings } from '@/app/admin/programs/[programId]/offerings/actions';

const SEMESTERS: Semester[] = ['1', '2', '3'];

/** Clones a program's offerings from one term into another. */
export default function CloneOfferingsPanel({ programId }: { programId: string }) {
  const router = useRouter();
  const thisYear = new Date().getFullYear() + 543;

  const [open, setOpen] = useState(false);
  const [fromYear, setFromYear] = useState(thisYear);
  const [fromSemester, setFromSemester] = useState<Semester>('1');
  const [toYear, setToYear] = useState(thisYear);
  const [toSemester, setToSemester] = useState<Semester>('2');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await cloneOfferings(programId, {
      fromYear,
      fromSemester,
      toYear,
      toSemester,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error ?? 'คัดลอกไม่สำเร็จ' });
      return;
    }
    setMsg({
      ok: true,
      text: `คัดลอกแล้ว ${res.created} รายวิชา · ข้าม ${res.skipped} รายวิชาที่มีอยู่แล้ว`,
    });
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        คัดลอกจากภาคก่อนหน้า
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          คัดลอกรายวิชาที่เปิดสอนจากภาคก่อนหน้า
        </h2>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          ปิด
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        คัดลอกรายวิชา อาจารย์ผู้รับผิดชอบ และ PLO ที่กำหนดไว้ ไปยังภาคใหม่
        (รีเซ็ตสถานะ และข้ามรายวิชาที่มีอยู่แล้ว)
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-slate-500">จากภาค</div>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              className={inputCls}
              value={fromYear}
              onChange={(e) => setFromYear(Number(e.target.value) || 0)}
            />
            <select
              className={inputCls}
              value={fromSemester}
              onChange={(e) => setFromSemester(e.target.value as Semester)}
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {SEMESTER_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500">ไปยังภาค</div>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              className={inputCls}
              value={toYear}
              onChange={(e) => setToYear(Number(e.target.value) || 0)}
            />
            <select
              className={inputCls}
              value={toSemester}
              onChange={(e) => setToSemester(e.target.value as Semester)}
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {SEMESTER_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}

      <button
        onClick={run}
        disabled={busy}
        className="mt-4 rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'กำลังคัดลอก…' : 'คัดลอก'}
      </button>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-mfu-primary focus:outline-none';
