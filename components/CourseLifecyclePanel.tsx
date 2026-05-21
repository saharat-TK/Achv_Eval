'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import {
  softDeleteCourse,
  restoreCourse,
  deleteCourse,
  type CourseBlockerDetails,
} from '@/app/admin/programs/[programId]/courses/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';

interface CourseLifecyclePanelProps {
  programId: string;
  courseId: string;
  courseCode: string;
  isActive: boolean;
  blockers: CourseBlockerDetails;
}

/**
 * Three-mode lifecycle panel for a course (admin-only): soft-delete /
 * restore, cascade-guarded hard delete, and a destructive purge gated by
 * typed-code confirmation + checkbox. Mirrors ProgramLifecyclePanel.
 */
export default function CourseLifecyclePanel({
  programId,
  courseId,
  courseCode,
  isActive,
  blockers,
}: CourseLifecyclePanelProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showDangerZone, setShowDangerZone] = useState(false);
  const [agreedToPurge, setAgreedToPurge] = useState(false);
  const [typedCode, setTypedCode] = useState('');

  const hasBlockers = blockers.offeringsCount > 0;

  async function handleSoftDelete() {
    const ok = await confirm({
      title: 'ปิดใช้งานรายวิชา',
      message: 'รายวิชาจะถูกปิดใช้งาน แต่ประวัติทั้งหมดยังคงอยู่และสามารถเปิดใช้งานใหม่ได้',
      confirmLabel: 'ปิดใช้งานรายวิชา',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await softDeleteCourse(courseId);
      if (res.ok) {
        setSuccessMsg('ปิดใช้งานรายวิชาเรียบร้อยแล้ว');
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
      const res = await restoreCourse(courseId);
      if (res.ok) {
        setSuccessMsg('เปิดใช้งานรายวิชาเรียบร้อยแล้ว');
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
      title: `ลบรายวิชา ${courseCode}`,
      message: 'ลบรายวิชานี้ออกจากระบบอย่างถาวร — การกระทำนี้ไม่สามารถย้อนกลับได้',
      confirmLabel: 'ลบรายวิชา',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await deleteCourse(courseId);
      if (res.ok) {
        router.push(`/admin/programs/${programId}/courses`);
      } else if (res.error === 'blockers_exist' && res.blockers) {
        setError(
          `ลบรายวิชาไม่ได้ — ยังมีรายวิชาที่เปิดสอน ${res.blockers.offeringsCount} รายการ` +
            ' กรุณาใช้ "ปิดใช้งานรายวิชา" หรือ "ลบทั้งหมดถาวร" แทน',
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
    if (typedCode !== courseCode) return;
    if (!agreedToPurge) return;
    const ok = await confirm({
      title: `ลบทั้งหมดถาวร — ${courseCode}`,
      message:
        'ลบรายวิชาและข้อมูลทั้งหมดอย่างถาวร รวมถึงครั้งที่เปิดสอน รายงาน AI ผลทวนสอบ และไฟล์ PDF ทั้งหมด\n\nการกระทำนี้ไม่สามารถย้อนกลับได้',
      confirmLabel: 'ลบทั้งหมดถาวร',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await getFirebaseAuth().authStateReady();
      const callable = httpsCallable<{ courseId: string }, { ok: boolean }>(
        getFirebaseFunctions(),
        'purgeCourse',
        { timeout: 300_000 },
      );
      const res = await callable({ courseId });
      if (res.data.ok) {
        router.push(`/admin/programs/${programId}/courses`);
      } else {
        setError('ลบทั้งหมดถาวรไม่สำเร็จ');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      setError(`ลบทั้งหมดถาวรไม่สำเร็จ — ${message}`);
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
          {isActive ? 'ปิดใช้งานรายวิชา' : 'เปิดใช้งานรายวิชา'}
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {isActive
            ? 'รายวิชาจะถูกปิดใช้งาน แต่ประวัติทั้งหมดยังคงอยู่และสามารถเปิดใช้งานใหม่ได้'
            : 'รายวิชานี้ถูกปิดใช้งานอยู่ — กดเพื่อเปิดใช้งานอีกครั้ง'}
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
          {isActive ? 'ปิดใช้งานรายวิชา' : 'เปิดใช้งานรายวิชา'}
        </button>
      </div>

      {/* Mode 2: Hard delete */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-xs font-semibold text-slate-700">ลบรายวิชา</h3>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {hasBlockers
            ? `ไม่สามารถลบได้ — รายวิชานี้ยังมี ${blockers.offeringsCount} ครั้งที่เปิดสอน กรุณาใช้ "ปิดใช้งาน" หรือ "ลบทั้งหมดถาวร" แทน`
            : 'ลบรายวิชานี้ออกจากระบบ (ทำได้เฉพาะรายวิชาที่ไม่เคยเปิดสอน)'}
        </p>
        <button
          type="button"
          onClick={handleHardDelete}
          disabled={busy || hasBlockers}
          className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          ลบรายวิชา
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
            ⚠ พื้นที่อันตราย — ลบรายวิชาและข้อมูลทั้งหมดถาวร
          </span>
          <span className="shrink-0 text-[11px] text-red-600">
            {showDangerZone ? 'ซ่อน' : 'แสดง'}
          </span>
        </button>

        {showDangerZone && (
          <div className="mt-3 space-y-2.5 border-t border-red-200 pt-3">
            <p className="text-[11px] leading-snug text-red-700">
              การกระทำนี้จะลบรายวิชา รวมถึงครั้งที่เปิดสอน รายงาน AI
              ผลทวนสอบ ผลรับรอง การแจ้งเตือนที่เกี่ยวข้อง และไฟล์ PDF
              ใน Storage ทั้งหมด <strong>ไม่สามารถย้อนกลับได้</strong>
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
                และจะลบประวัติการทวนสอบทั้งหมดของรายวิชานี้
              </span>
            </label>
            <label className="block text-[11px] leading-snug text-red-700">
              พิมพ์รหัสรายวิชา <strong>{courseCode}</strong>{' '}
              เพื่อยืนยัน:
              <input
                type="text"
                value={typedCode}
                onChange={(e) => setTypedCode(e.target.value)}
                placeholder={courseCode}
                className="mt-1 w-full rounded border border-red-300 px-2 py-1 text-xs text-slate-800 focus:border-red-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={handlePurge}
              disabled={busy || !agreedToPurge || typedCode !== courseCode}
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
