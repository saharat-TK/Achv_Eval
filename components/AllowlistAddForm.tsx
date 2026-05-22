'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addToAllowlist } from '@/app/admin/users/allowlist/actions';

export interface AllowlistProgramOption {
  id: string;
  code: string;
  nameTh: string;
}

export default function AllowlistAddForm({
  programs,
}: {
  programs: AllowlistProgramOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [nameTh, setNameTh] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [notes, setNotes] = useState('');
  const [isLecturer, setIsLecturer] = useState(true);
  const [isDirector, setIsDirector] = useState(false);
  const [directorProgramId, setDirectorProgramId] = useState('');

  function reset() {
    setEmail('');
    setNameTh('');
    setNameEn('');
    setNotes('');
    setIsLecturer(true);
    setIsDirector(false);
    setDirectorProgramId('');
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await addToAllowlist({
      email,
      nameTh,
      nameEn,
      notes,
      presetIsLecturer: isLecturer,
      presetIsDirector: isDirector,
      presetDirectorProgramId: isDirector ? directorProgramId : null,
    });
    setBusy(false);
    if (res.ok) {
      setOk(`เพิ่ม ${email} ในทะเบียนแล้ว`);
      reset();
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        + เพิ่มรายชื่อ
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">เพิ่มรายชื่อ</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setOk(null);
          }}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          ปิด
        </button>
      </div>

      {ok && (
        <p className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          {ok}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600">
          อีเมล
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="someone@mfu.ac.th"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
          />
        </label>
        <label className="text-xs text-slate-600">
          ชื่อ (ไทย)
          <input
            type="text"
            value={nameTh}
            onChange={(e) => setNameTh(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
          />
        </label>
        <label className="text-xs text-slate-600">
          ชื่อ (อังกฤษ)
          <input
            type="text"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
          />
        </label>
        <label className="text-xs text-slate-600">
          หมายเหตุ (ถ้ามี)
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="เช่น สาขาวิชา / สังกัด"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
          />
        </label>
      </div>

      {/* Preset roles applied on first sign-in */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <p className="text-xs font-medium text-slate-600">
          สิทธิ์เริ่มต้นเมื่อเข้าสู่ระบบครั้งแรก
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isLecturer}
            onChange={(e) => setIsLecturer(e.target.checked)}
          />
          อาจารย์ผู้รับผิดชอบรายวิชา
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isDirector}
            onChange={(e) => setIsDirector(e.target.checked)}
          />
          ประธานหลักสูตร
        </label>
        {isDirector && (
          <label className="mt-2 block text-xs text-slate-600">
            หลักสูตรที่เป็นประธาน
            <select
              value={directorProgramId}
              onChange={(e) => setDirectorProgramId(e.target.value)}
              className="mt-1 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-mfu-primary focus:outline-none"
            >
              <option value="">— เลือกหลักสูตร —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.nameTh}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !email.trim() || (isDirector && !directorProgramId)}
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </div>
  );
}
