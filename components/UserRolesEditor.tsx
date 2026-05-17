'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserRoles, type UserRolesData } from '@/app/admin/users/actions';

export interface ProgramOption {
  id: string;
  code: string;
  nameTh: string;
}

export default function UserRolesEditor({
  userId,
  isSelf,
  programs,
  initial,
}: {
  userId: string;
  isSelf: boolean;
  programs: ProgramOption[];
  initial: UserRolesData;
}) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(initial.isAdmin);
  const [directorOf, setDirectorOf] = useState<string[]>(initial.directorOf);
  const [assessorOf, setAssessorOf] = useState<string[]>(initial.assessorOf);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await updateUserRoles(userId, { isAdmin, directorOf, assessorOf });
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: 'บันทึกสิทธิ์เรียบร้อย' });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error });
    }
  }

  return (
    <div className="space-y-5">
      {/* Admin */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">ผู้ดูแลระบบ</h2>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          เป็นผู้ดูแลระบบ (จัดการได้ทุกหลักสูตรและสิทธิ์ผู้ใช้)
        </label>
        {isSelf && (
          <p className="mt-2 text-xs text-amber-600">
            นี่คือบัญชีของท่าน — ระบบไม่อนุญาตให้ถอนสิทธิ์ผู้ดูแลระบบของตนเอง
          </p>
        )}
      </section>

      {/* Director */}
      <RoleProgramPicker
        title="ประธานหลักสูตร"
        hint="จัดการหลักสูตร รายวิชา และรายวิชาที่เปิดสอนของหลักสูตรที่เลือก"
        programs={programs}
        selected={directorOf}
        onToggle={(id) => setDirectorOf((l) => toggle(l, id))}
      />

      {/* Assessor */}
      <RoleProgramPicker
        title="ผู้ทวนสอบ"
        hint="ทวนสอบรายวิชาในหลักสูตรที่เลือก"
        programs={programs}
        selected={assessorOf}
        onToggle={(id) => setAssessorOf((l) => toggle(l, id))}
      />

      {msg && (
        <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="rounded-lg bg-mfu-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์'}
      </button>
    </div>
  );
}

function RoleProgramPicker({
  title,
  hint,
  programs,
  selected,
  onToggle,
}: {
  title: string;
  hint: string;
  programs: ProgramOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      {programs.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">ยังไม่มีหลักสูตรในระบบ</p>
      ) : (
        <div className="mt-3 space-y-2">
          {programs.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => onToggle(p.id)}
              />
              <span className="font-medium">{p.code}</span> — {p.nameTh}
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
