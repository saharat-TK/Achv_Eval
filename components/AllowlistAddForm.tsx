'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addToAllowlist } from '@/app/admin/users/allowlist/actions';

export default function AllowlistAddForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [nameTh, setNameTh] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [notes, setNotes] = useState('');

  function reset() {
    setEmail('');
    setNameTh('');
    setNameEn('');
    setNotes('');
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await addToAllowlist({ email, nameTh, nameEn, notes });
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

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !email.trim()}
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </div>
  );
}
