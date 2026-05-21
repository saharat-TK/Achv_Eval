'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import {
  softDeleteProgram,
  restoreProgram,
  deleteProgram,
  type BlockerDetails,
} from '@/app/admin/programs/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';

interface ProgramLifecyclePanelProps {
  programId: string;
  programCode: string;
  isActive: boolean;
  blockers: BlockerDetails;
}

/**
 * Three-mode lifecycle panel for a program (admin-only): soft-delete /
 * restore, cascade-guarded hard delete, and a destructive purge gated by
 * typed-code confirmation + checkbox. Compact sidebar styling, mirrors
 * CourseLifecyclePanel.
 */
export default function ProgramLifecyclePanel({
  programId,
  programCode,
  isActive,
  blockers,
}: ProgramLifecyclePanelProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showDangerZone, setShowDangerZone] = useState(false);
  const [agreedToPurge, setAgreedToPurge] = useState(false);
  const [typedCode, setTypedCode] = useState('');

  const hasBlockers =
    blockers.coursesCount > 0 ||
    blockers.offeringsCount > 0 ||
    blockers.reviewsCount > 0 ||
    blockers.assignedUsers.length > 0;

  async function handleSoftDelete() {
    const ok = await confirm({
      title: 'ปิดใช้งานหลักสูตร',
      message:
        'หลักสูตรนี้และรายวิชาทั้งหมดภายใต้หลักสูตรจะถูกปิดใช้งาน ประวัติและไฟล์รายงานในอดีตจะยังคงอยู่ และสามารถกลับมาเปิดใช้งานได้ภายหลัง',
      confirmLabel: 'ปิดใช้งานหลักสูตร',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await softDeleteProgram(programId);
      if (res.ok) {
        setSuccessMsg('ปิดใช้งานหลักสูตรและรายวิชาเรียบร้อยแล้ว');
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
      const res = await restoreProgram(programId);
      if (res.ok) {
        setSuccessMsg('เปิดใช้งานหลักสูตรและรายวิชาเรียบร้อยแล้ว');
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
      title: `ลบหลักสูตร ${programCode}`,
      message:
        'ลบหลักสูตรนี้ออกจากระบบอย่างถาวร — การกระทำนี้ไม่สามารถย้อนกลับได้',
      confirmLabel: 'ลบหลักสูตร',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await deleteProgram(programId);
      if (res.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการลบข้อมูล');
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge() {
    if (typedCode !== programCode) return;
    if (!agreedToPurge) return;

    const ok = await confirm({
      title: `ลบทำลายหลักสูตร "${programCode}" ถาวร`,
      message:
        'การกระทำนี้ไม่สามารถกู้คืนได้ ระบบจะลบหลักสูตร รายวิชา ประวัติการทวนสอบทั้งหมด และไฟล์รายงาน (PDF) ทั้งหมดออกจากระบบ',
      confirmLabel: 'ลบทำลายถาวร',
      variant: 'danger',
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    setSuccessMsg('กำลังดำเนินการล้างข้อมูลทั้งหมดในพื้นหลัง (อาจใช้เวลา 1-2 นาที)…');

    try {
      await getFirebaseAuth().authStateReady();
      const callable = httpsCallable<{ programId: string }, { ok: boolean }>(
        getFirebaseFunctions(),
        'purgeProgram',
        { timeout: 240_000 },
      );
      const res = await callable({ programId });
      if (res.data.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        setError('ไม่สามารถทำตามขั้นตอนล้างข้อมูลได้เสร็จสมบูรณ์');
        setSuccessMsg(null);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown';
      setError(`เกิดข้อผิดพลาดในการเรียกใช้ Cloud Function — ${message}`);
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
          {isActive ? 'ปิดใช้งานหลักสูตร' : 'เปิดใช้งานหลักสูตร'}
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {isActive
            ? 'หลักสูตรและรายวิชาทั้งหมดภายใต้หลักสูตรจะถูกปิดใช้งาน ประวัติยังคงอยู่และสามารถเปิดใช้งานใหม่ได้'
            : 'หลักสูตรนี้ถูกปิดใช้งานอยู่ — กดเพื่อเปิดใช้งานอีกครั้ง'}
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
          {isActive ? 'ปิดใช้งานหลักสูตร' : 'เปิดใช้งานหลักสูตร'}
        </button>
      </div>

      {/* Mode 2: Hard delete */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-xs font-semibold text-slate-700">ลบหลักสูตร</h3>
        {hasBlockers ? (
          <div className="mt-1 text-[11px] leading-snug text-slate-500">
            <p>ไม่สามารถลบได้ — ยังมีข้อมูลผูกพันอยู่:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {blockers.coursesCount > 0 && (
                <li>รายวิชา {blockers.coursesCount} รายการ</li>
              )}
              {blockers.offeringsCount > 0 && (
                <li>ครั้งที่เปิดสอน {blockers.offeringsCount} รายการ</li>
              )}
              {blockers.reviewsCount > 0 && (
                <li>บันทึกทวนสอบ {blockers.reviewsCount} รายการ</li>
              )}
              {blockers.assignedUsers.length > 0 && (
                <li className="break-words">
                  ผู้ใช้ที่ได้รับสิทธิ์: {blockers.assignedUsers.join(', ')}
                </li>
              )}
            </ul>
            <p className="mt-1.5">
              แนะนำให้ใช้ &quot;ปิดใช้งานหลักสูตร&quot; หรือ &quot;ลบทั้งหมดถาวร&quot; แทน
            </p>
          </div>
        ) : (
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            ลบหลักสูตรนี้ออกจากระบบ (ทำได้เฉพาะหลักสูตรที่ไม่มีข้อมูลผูกพัน)
          </p>
        )}
        <button
          type="button"
          onClick={handleHardDelete}
          disabled={busy || hasBlockers}
          className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          ลบหลักสูตร
        </button>
      </div>

      {/* Mode 3: Purge (Danger zone) */}
      <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
        <button
          type="button"
          onClick={() => setShowDangerZone((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-xs font-semibold leading-snug text-red-700">
            ⚠ พื้นที่อันตราย — ลบหลักสูตรและข้อมูลทั้งหมดถาวร
          </span>
          <span className="shrink-0 text-[11px] text-red-600">
            {showDangerZone ? 'ซ่อน' : 'แสดง'}
          </span>
        </button>

        {showDangerZone && (
          <div className="mt-3 space-y-2.5 border-t border-red-200 pt-3">
            <p className="text-[11px] leading-snug text-red-700">
              การกระทำนี้จะลบหลักสูตร รายวิชา ครั้งที่เปิดสอน รายงาน AI
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
                และจะลบประวัติการทวนสอบทั้งหมดของหลักสูตรนี้
              </span>
            </label>
            <label className="block text-[11px] leading-snug text-red-700">
              พิมพ์รหัสหลักสูตร <strong>{programCode}</strong>{' '}
              เพื่อยืนยัน:
              <input
                type="text"
                value={typedCode}
                onChange={(e) => setTypedCode(e.target.value)}
                placeholder={programCode}
                className="mt-1 w-full rounded border border-red-300 px-2 py-1 text-xs text-slate-800 focus:border-red-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={handlePurge}
              disabled={busy || !agreedToPurge || typedCode !== programCode}
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
