'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserRoles, type UserRolesData } from '@/app/admin/users/actions';

export interface AcademicProgramOption {
  id: string;
  code: string;
  nameTh: string;
}

export default function UserRolesEditor({
  userId,
  isSelf,
  academicPrograms,
  initial,
  canManageAdmins = false,
}: {
  userId: string;
  isSelf: boolean;
  academicPrograms: AcademicProgramOption[];
  initial: UserRolesData;
  /** Whether the viewer is a super admin — gates the admin checkboxes. */
  canManageAdmins?: boolean;
}) {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState(initial.isSuperAdmin);
  const [isAdmin, setIsAdmin] = useState(initial.isAdmin);
  const [isLecturer, setIsLecturer] = useState(initial.isLecturer);
  const [directorOfAcademicPrograms, setDirectorOfAcademicPrograms] = useState<
    string[]
  >(initial.directorOfAcademicPrograms);
  const [assessorOfAcademicPrograms, setAssessorOfAcademicPrograms] = useState<
    string[]
  >(initial.assessorOfAcademicPrograms);
  const [verifierOfAcademicPrograms, setVerifierOfAcademicPrograms] = useState<
    string[]
  >(initial.verifierOfAcademicPrograms);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // A non-super-admin viewing an admin/super-admin account can't change
  // anything (the whole page is effectively read-only for that target).
  const targetIsAdmin = initial.isAdmin || initial.isSuperAdmin;
  const locked = !canManageAdmins && targetIsAdmin;

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await updateUserRoles(userId, {
      isSuperAdmin,
      isAdmin,
      isLecturer,
      directorOfAcademicPrograms,
      assessorOfAcademicPrograms,
      verifierOfAcademicPrograms,
    });
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
      {locked && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          บัญชีนี้เป็นผู้ดูแลระบบ — เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่แก้ไขสิทธิ์ได้
        </p>
      )}

      {/* Admin */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">ผู้ดูแลระบบ</h2>
        <label
          className={`mt-3 flex items-center gap-2 text-sm ${
            canManageAdmins ? 'text-slate-700' : 'text-slate-400'
          }`}
        >
          <input
            type="checkbox"
            checked={isSuperAdmin}
            disabled={!canManageAdmins}
            onChange={(e) => {
              const v = e.target.checked;
              setIsSuperAdmin(v);
              if (v) setIsAdmin(true); // super admin implies admin
            }}
          />
          เป็นผู้ดูแลระบบสูงสุด (จัดการสิทธิ์ผู้ดูแลระบบได้)
        </label>
        <label
          className={`mt-2 flex items-center gap-2 text-sm ${
            canManageAdmins && !isSuperAdmin ? 'text-slate-700' : 'text-slate-400'
          }`}
        >
          <input
            type="checkbox"
            checked={isAdmin}
            disabled={!canManageAdmins || isSuperAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          เป็นผู้ดูแลระบบ (จัดการได้ทุกหลักสูตรและสิทธิ์ผู้ใช้ทั่วไป)
        </label>
        {!canManageAdmins && (
          <p className="mt-2 text-xs text-slate-500">
            เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่กำหนดสิทธิ์ผู้ดูแลระบบได้
          </p>
        )}
        {isSelf && (
          <p className="mt-2 text-xs text-amber-600">
            นี่คือบัญชีของท่าน — ระบบไม่อนุญาตให้ถอนสิทธิ์ผู้ดูแลระบบของตนเอง
          </p>
        )}
      </section>

      {/* Lecturer */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">
          อาจารย์ผู้รับผิดชอบรายวิชา
        </h2>
        <label
          className={`mt-3 flex items-center gap-2 text-sm ${
            locked ? 'text-slate-400' : 'text-slate-700'
          }`}
        >
          <input
            type="checkbox"
            checked={isLecturer}
            disabled={locked}
            onChange={(e) => setIsLecturer(e.target.checked)}
          />
          เป็นอาจารย์ผู้รับผิดชอบรายวิชา (เห็นเมนู &quot;รายวิชาที่รับผิดชอบ&quot;)
        </label>
        <p className="mt-1 text-xs text-slate-500">
          ระบบจะกำหนดสิทธิ์นี้ให้อัตโนมัติเมื่อผู้ใช้ถูกมอบหมายเป็นอาจารย์
          ผู้รับผิดชอบในรายวิชาที่เปิดสอน — รายวิชาที่แสดงยังคงอ้างอิงจากการ
          มอบหมายในแต่ละรายวิชา
        </p>
      </section>

      {/* Director */}
      <RoleAcademicProgramPicker
        title="ประธานหลักสูตร"
        hint="จัดการเล่มหลักสูตร รายวิชา และรายวิชาที่เปิดสอนทั้งหมดภายใต้หลักสูตรที่เลือก"
        academicPrograms={academicPrograms}
        selected={directorOfAcademicPrograms}
        disabled={locked}
        onToggle={(id) => setDirectorOfAcademicPrograms((l) => toggle(l, id))}
      />

      {/* Assessor */}
      <RoleAcademicProgramPicker
        title="ผู้ทวนสอบ"
        hint="ทวนสอบรายวิชาในทุกเล่มหลักสูตรภายใต้หลักสูตรที่เลือก"
        academicPrograms={academicPrograms}
        selected={assessorOfAcademicPrograms}
        disabled={locked}
        onToggle={(id) => setAssessorOfAcademicPrograms((l) => toggle(l, id))}
      />

      {/* Verification committee */}
      <RoleAcademicProgramPicker
        title="คณะกรรมการรับรองผล"
        hint="ตรวจรับรองผลหลังผู้ทวนสอบลงนาม และกำหนดรายการที่ต้องติดตาม"
        academicPrograms={academicPrograms}
        selected={verifierOfAcademicPrograms}
        disabled={locked}
        onToggle={(id) => setVerifierOfAcademicPrograms((l) => toggle(l, id))}
      />

      {msg && (
        <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}

      <button
        onClick={save}
        disabled={busy || locked}
        className="rounded-lg bg-mfu-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์'}
      </button>
    </div>
  );
}

function RoleAcademicProgramPicker({
  title,
  hint,
  academicPrograms,
  selected,
  onToggle,
  disabled = false,
}: {
  title: string;
  hint: string;
  academicPrograms: AcademicProgramOption[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      {academicPrograms.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">ยังไม่มีหลักสูตรในระบบ</p>
      ) : (
        <div className="mt-3 space-y-2">
          {academicPrograms.map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-2 text-sm ${
                disabled ? 'text-slate-400' : 'text-slate-700'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                disabled={disabled}
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
