'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  softDeleteAcademicProgram,
  restoreAcademicProgram,
  deleteAcademicProgram,
  type AcademicProgramBlockerDetails,
} from '@/app/admin/academic-programs/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';

interface Props {
  programId: string;
  programNameTh: string;
  isActive: boolean;
  blockers: AcademicProgramBlockerDetails;
}

/**
 * Lifecycle panel for an academic program (admin-only): soft-delete /
 * restore and a cascade-guarded hard delete (refused while curriculum
 * revisions reference it). No destructive purge — reassign or remove
 * the curriculums first.
 */
export default function AcademicProgramLifecyclePanel({
  programId,
  programNameTh,
  isActive,
  blockers,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const hasBlockers = blockers.curriculumsCount > 0;

  async function handleSoftDelete() {
    const ok = await confirm({
      title: 'ปิดใช้งานหลักสูตร',
      message:
        'หลักสูตรนี้จะถูกปิดใช้งาน เล่มหลักสูตรภายใต้หลักสูตรยังคงอยู่ และสามารถเปิดใช้งานใหม่ได้',
      confirmLabel: 'ปิดใช้งานหลักสูตร',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await softDeleteAcademicProgram(programId);
      if (res.ok) {
        setSuccessMsg('ปิดใช้งานหลักสูตรเรียบร้อยแล้ว');
        router.refresh();
      } else setError(res.error);
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
      const res = await restoreAcademicProgram(programId);
      if (res.ok) {
        setSuccessMsg('เปิดใช้งานหลักสูตรเรียบร้อยแล้ว');
        router.refresh();
      } else setError(res.error);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setBusy(false);
    }
  }

  async function handleHardDelete() {
    const ok = await confirm({
      title: `ลบหลักสูตร ${programNameTh}`,
      message: 'ลบหลักสูตรนี้ออกจากระบบอย่างถาวร — การกระทำนี้ไม่สามารถย้อนกลับได้',
      confirmLabel: 'ลบหลักสูตร',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await deleteAcademicProgram(programId);
      if (res.ok) {
        router.push('/admin/academic-programs');
      } else if (res.error === 'blockers_exist' && res.blockers) {
        setError(
          `ลบหลักสูตรไม่ได้ — ยังมีเล่มหลักสูตรอ้างอิงอยู่ ${res.blockers.curriculumsCount} ฉบับ` +
            ' กรุณาย้ายหรือลบเล่มหลักสูตรเหล่านั้นก่อน',
        );
      } else setError(res.error);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
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

      {/* Soft-delete / restore */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-xs font-semibold text-slate-700">
          {isActive ? 'ปิดใช้งานหลักสูตร' : 'เปิดใช้งานหลักสูตร'}
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {isActive
            ? 'หลักสูตรจะถูกปิดใช้งาน ประวัติยังคงอยู่และเปิดใช้งานใหม่ได้'
            : 'หลักสูตรนี้ถูกปิดใช้งานอยู่ — กดเพื่อเปิดใช้งานอีกครั้ง'}
        </p>
        <button
          type="button"
          onClick={isActive ? handleSoftDelete : handleRestore}
          disabled={busy}
          className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${
            isActive ? 'bg-amber-600 hover:bg-amber-700' : 'bg-mfu-primary hover:opacity-90'
          }`}
        >
          {isActive ? 'ปิดใช้งานหลักสูตร' : 'เปิดใช้งานหลักสูตร'}
        </button>
      </div>

      {/* Hard delete */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-xs font-semibold text-slate-700">ลบหลักสูตร</h3>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {hasBlockers
            ? `ไม่สามารถลบได้ — มี ${blockers.curriculumsCount} เล่มหลักสูตรอ้างอิง กรุณาย้ายหรือลบก่อน`
            : 'ลบหลักสูตรนี้ออกจากระบบ (ทำได้เฉพาะหลักสูตรที่ไม่มีเล่มหลักสูตรอ้างอิง)'}
        </p>
        <button
          type="button"
          onClick={handleHardDelete}
          disabled={busy || hasBlockers}
          className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          ลบหลักสูตร
        </button>
      </div>
    </section>
  );
}
