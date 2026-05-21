'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import {
  softDeleteDepartment,
  restoreDepartment,
  deleteDepartment,
  type DepartmentBlockerDetails,
} from '@/app/admin/departments/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';

interface DepartmentLifecyclePanelProps {
  deptId: string;
  deptNameTh: string;
  isActive: boolean;
  blockers: DepartmentBlockerDetails;
}

/**
 * Three-mode lifecycle panel for a department (admin-only). Mirrors
 * ProgramLifecyclePanel: soft-delete / restore, cascade-guarded hard
 * delete, and a destructive purge gated by typed-name confirmation +
 * checkbox.
 */
export default function DepartmentLifecyclePanel({
  deptId,
  deptNameTh,
  isActive,
  blockers,
}: DepartmentLifecyclePanelProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showDangerZone, setShowDangerZone] = useState(false);
  const [agreedToPurge, setAgreedToPurge] = useState(false);
  const [typedName, setTypedName] = useState('');

  const hasBlockers = blockers.programsCount > 0;

  async function handleSoftDelete() {
    const ok = await confirm({
      title: 'ปิดใช้งานสาขาวิชา',
      message:
        'สาขาวิชานี้และหลักสูตร รายวิชา และการเปิดสอนทั้งหมดภายใต้สาขาวิชาจะถูกปิดใช้งาน ประวัติยังคงอยู่และสามารถเปิดใช้งานใหม่ได้',
      confirmLabel: 'ปิดใช้งานสาขาวิชา',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await softDeleteDepartment(deptId);
      if (res.ok) {
        setSuccessMsg('ปิดใช้งานสาขาวิชาเรียบร้อยแล้ว');
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await restoreDepartment(deptId);
      if (res.ok) {
        setSuccessMsg('เปิดใช้งานสาขาวิชาเรียบร้อยแล้ว');
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setBusy(false);
    }
  }

  async function handleHardDelete() {
    const ok = await confirm({
      title: `ลบสาขาวิชา ${deptNameTh}`,
      message:
        'ลบสาขาวิชานี้ออกจากระบบอย่างถาวร — การกระทำนี้ไม่สามารถย้อนกลับได้',
      confirmLabel: 'ลบสาขาวิชา',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await deleteDepartment(deptId);
      if (res.ok) {
        router.push('/admin/departments');
      } else if (res.error === 'blockers_exist' && res.blockers) {
        setError(
          `ลบสาขาวิชาไม่ได้ — ยังมีหลักสูตรอ้างอิงอยู่ ${res.blockers.programsCount} หลักสูตร` +
            ' กรุณาใช้ "ปิดใช้งานสาขาวิชา" หรือ "ลบทั้งหมดถาวร" แทน',
        );
      } else {
        setError(res.error);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge() {
    if (typedName !== deptNameTh) return;
    if (!agreedToPurge) return;

    const ok = await confirm({
      title: `ลบทำลายสาขาวิชา "${deptNameTh}" ถาวร`,
      message:
        'การกระทำนี้ไม่สามารถกู้คืนได้ ระบบจะลบสาขาวิชา หลักสูตร รายวิชา การเปิดสอน ประวัติการทวนสอบทั้งหมด และไฟล์รายงาน (PDF) ทั้งหมดออกจากระบบ',
      confirmLabel: 'ลบทำลายถาวร',
      variant: 'danger',
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    setSuccessMsg('กำลังดำเนินการล้างข้อมูลทั้งหมดในพื้นหลัง (อาจใช้เวลาหลายนาที)…');

    try {
      await getFirebaseAuth().authStateReady();
      const callable = httpsCallable<
        { departmentId: string },
        { ok: boolean; programsPurged: number }
      >(getFirebaseFunctions(), 'purgeDepartment', { timeout: 540_000 });
      const res = await callable({ departmentId: deptId });
      if (res.data.ok) {
        router.push('/admin/departments');
        router.refresh();
      } else {
        setError('ลบทั้งหมดถาวรไม่สำเร็จ');
        setSuccessMsg(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      setError(`ลบทั้งหมดถาวรไม่สำเร็จ — ${message}`);
      setSuccessMsg(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      {successMsg && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {successMsg}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Mode 1: Soft-delete / Restore */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-xs font-semibold text-slate-700">
          {isActive ? 'ปิดใช้งานสาขาวิชา' : 'เปิดใช้งานสาขาวิชา'}
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {isActive
            ? 'สาขาวิชาและหลักสูตรทั้งหมดภายใต้สาขาวิชาจะถูกปิดใช้งาน ประวัติยังคงอยู่และสามารถเปิดใช้งานใหม่ได้'
            : 'สาขาวิชานี้ถูกปิดใช้งานอยู่ — กดเพื่อเปิดใช้งานอีกครั้ง'}
        </p>
        <button
          type="button"
          onClick={isActive ? handleSoftDelete : handleRestore}
          disabled={busy}
          className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${
            isActive
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-mfu-primary hover:opacity-90'
          }`}
        >
          {isActive ? 'ปิดใช้งานสาขาวิชา' : 'เปิดใช้งานสาขาวิชา'}
        </button>
      </div>

      {/* Mode 2: Hard delete */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-xs font-semibold text-slate-700">ลบสาขาวิชา</h3>
        {hasBlockers ? (
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            ไม่สามารถลบได้ — มี {blockers.programsCount} หลักสูตรอ้างอิง
            แนะนำให้ใช้ &quot;ปิดใช้งานสาขาวิชา&quot; หรือ &quot;ลบทั้งหมดถาวร&quot; แทน
          </p>
        ) : (
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            ลบสาขาวิชานี้ออกจากระบบ (ทำได้เฉพาะสาขาวิชาที่ไม่มีหลักสูตรอ้างอิง)
          </p>
        )}
        <button
          type="button"
          onClick={handleHardDelete}
          disabled={busy || hasBlockers}
          className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          ลบสาขาวิชา
        </button>
      </div>

      {/* Mode 3: Purge */}
      <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
        <button
          type="button"
          onClick={() => setShowDangerZone((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-xs font-semibold leading-snug text-red-700">
            ⚠ พื้นที่อันตราย — ลบสาขาวิชาและข้อมูลทั้งหมดถาวร
          </span>
          <span className="shrink-0 text-[11px] text-red-600">
            {showDangerZone ? 'ซ่อน' : 'แสดง'}
          </span>
        </button>

        {showDangerZone && (
          <div className="mt-3 space-y-2.5 border-t border-red-200 pt-3">
            <p className="text-[11px] leading-snug text-red-700">
              การกระทำนี้จะลบสาขาวิชา หลักสูตร รายวิชา การเปิดสอน รายงาน AI
              ผลทวนสอบ ผลรับรอง บันทึกของคณะกรรมการ และไฟล์ PDF ใน Storage
              ทั้งหมด <strong>ไม่สามารถย้อนกลับได้</strong>
            </p>
            <label className="flex items-start gap-2 text-[11px] leading-snug text-red-700">
              <input
                type="checkbox"
                checked={agreedToPurge}
                onChange={(e) => setAgreedToPurge(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                ฉันเข้าใจว่าการกระทำนี้ไม่สามารถย้อนกลับได้
                และจะลบประวัติการทวนสอบทั้งหมดของสาขาวิชานี้
              </span>
            </label>
            <label className="block text-[11px] leading-snug text-red-700">
              พิมพ์ชื่อสาขาวิชา <strong>{deptNameTh}</strong> เพื่อยืนยัน:
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={deptNameTh}
                className="mt-1 w-full rounded border border-red-300 px-2 py-1 text-xs text-slate-800 focus:border-red-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={handlePurge}
              disabled={busy || !agreedToPurge || typedName !== deptNameTh}
              className="w-full rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ลบทั้งหมดถาวร
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
