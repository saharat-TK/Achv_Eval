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

interface ProgramLifecyclePanelProps {
  programId: string;
  programCode: string;
  isActive: boolean;
  blockers: BlockerDetails;
}

export default function ProgramLifecyclePanel({
  programId,
  programCode,
  isActive,
  blockers,
}: ProgramLifecyclePanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Hard delete confirmation state
  const [showHardDeleteConfirm, setShowHardDeleteConfirm] = useState(false);

  // Purge danger zone states
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [agreedToPurge, setAgreedToPurge] = useState(false);
  const [typedCode, setTypedCode] = useState('');

  const hasBlockers =
    blockers.coursesCount > 0 ||
    blockers.offeringsCount > 0 ||
    blockers.reviewsCount > 0 ||
    blockers.assignedUsers.length > 0;

  async function handleSoftDelete() {
    if (!confirm('ยืนยันที่จะปิดใช้งานหลักสูตรนี้และรายวิชาภายใต้หลักสูตรทั้งหมดใช่หรือไม่?')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await softDeleteProgram(programId);
      if (res.ok) {
        setSuccessMsg('ปิดใช้งานหลักสูตรและรายวิชาเรียบร้อยแล้ว');
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError(null);
    try {
      const res = await restoreProgram(programId);
      if (res.ok) {
        setSuccessMsg('เปิดใช้งานหลักสูตรและรายวิชาเรียบร้อยแล้ว');
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setBusy(false);
    }
  }

  async function handleHardDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await deleteProgram(programId);
      if (res.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError('เกิดข้อผิดพลาดในการลบข้อมูล');
    } finally {
      setBusy(false);
      setShowHardDeleteConfirm(false);
    }
  }

  async function handlePurge() {
    if (typedCode !== programCode) return;
    if (!agreedToPurge) return;
    
    const doubleConfirmMessage = `⚠️ โปรดระวังอย่างยิ่ง! การกระทำนี้ไม่สามารถกู้คืนได้\nคุณต้องการลบหลักสูตร "${programCode}" และประวัติการทวนสอบทั้งหมดในระบบรวมถึงไฟล์รายงานทั้งหมดใช่หรือไม่?`;
    if (!confirm(doubleConfirmMessage)) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMsg('กำลังดำเนินการล้างข้อมูลทั้งหมดในพื้นหลัง (อาจใช้เวลา 1-2 นาที)…');

    try {
      await getFirebaseAuth().authStateReady();
      const callable = httpsCallable<{ programId: string }, { ok: boolean }>(
        getFirebaseFunctions(),
        'purgeProgram',
        { timeout: 240_000 }
      );
      
      const res = await callable({ programId });
      
      if (res.data.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        setError('ไม่สามารถทำตามขั้นตอนล้างข้อมูลได้เสร็จสมบูรณ์');
        setSuccessMsg(null);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'เกิดข้อผิดพลาดในการเรียกใช้ Cloud Function');
      setSuccessMsg(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="border-t border-slate-200 pt-6">
        <h2 className="text-lg font-semibold text-slate-800">การจัดการสถานะและวงจรชีวิตหลักสูตร</h2>
        <p className="mt-1 text-sm text-slate-500">
          ตั้งค่าการเปิด/ปิดการใช้งานหลักสูตร หรือลบหลักสูตรออกจากระบบอย่างปลอดภัย
        </p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {/* 1. Soft-Delete / Restore Card */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800">เปิด / ปิดใช้งานหลักสูตร</h3>
              {isActive ? (
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                  กำลังใช้งาน
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  ปิดใช้งานชั่วคราว
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">
              {isActive
                ? 'การปิดใช้งานหลักสูตรจะทำการปิดใช้งานรายวิชาทั้งหมดภายใต้หลักสูตรนี้ด้วย ทำให้ไม่สามารถเปิดประเมินทวนสอบรอบใหม่ได้ แต่ประวัติและไฟล์รายงานทวนสอบในอดีตจะยังคงปลอดภัยและแสดงผลได้ตามปกติ'
                : 'หลักสูตรและรายวิชาภายใต้หลักสูตรถูกปิดใช้งานชั่วคราว สามารถกลับมาเปิดใช้งานอีกครั้งเพื่อใช้งานระบบได้ทันที'}
            </p>
          </div>
          <div className="shrink-0">
            {isActive ? (
              <button
                type="button"
                onClick={handleSoftDelete}
                disabled={busy}
                className="w-full rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 sm:w-auto"
              >
                ปิดใช้งานหลักสูตร
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRestore}
                disabled={busy}
                className="w-full rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:w-auto"
              >
                เปิดใช้งานหลักสูตร
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. Hard-Delete Card */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-800">ลบหลักสูตรอย่างปลอดภัย (Guarded Hard Delete)</h3>
        <p className="mt-1.5 text-sm text-slate-500">
          ลบหลักสูตรออกจากฐานข้อมูลอย่างถาวร โดยระบบจะอนุญาตให้ลบได้ก็ต่อเมื่อไม่มีข้อมูลที่อ้างอิงถึงหลักสูตรนี้หลงเหลืออยู่เท่านั้น (เช่น รายวิชา, ข้อมูลการเปิดสอนในเทอม, บทบาทผู้ใช้งาน หรือการนำแผนไปปฏิบัติ)
        </p>

        {hasBlockers ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-4 border border-slate-200 text-sm text-slate-600">
            <h4 className="font-semibold text-slate-700 mb-2">🔴 ไม่สามารถลบได้เนื่องจากมีข้อมูลผูกพันอยู่ในระบบ:</h4>
            <ul className="list-inside list-disc space-y-1.5 text-xs text-slate-600">
              {blockers.coursesCount > 0 && (
                <li>มีรายวิชาผูกอยู่กับหลักสูตรนี้: <strong>{blockers.coursesCount} รายการ</strong> (ต้องไปลบรายวิชาเหล่านี้ออกก่อน)</li>
              )}
              {blockers.offeringsCount > 0 && (
                <li>มีการเปิดสอนรายวิชาในเทอมต่างๆ ของหลักสูตรนี้: <strong>{blockers.offeringsCount} รายการ</strong></li>
              )}
              {blockers.reviewsCount > 0 && (
                <li>มีบันทึกการทวนสอบการนำแผนไปปฏิบัติ: <strong>{blockers.reviewsCount} รายการ</strong></li>
              )}
              {blockers.assignedUsers.length > 0 && (
                <li className="break-words">
                  มีผู้ใช้งานที่ได้รับมอบหมายสิทธิ์ของหลักสูตรนี้ (ประธานหลักสูตร/ผู้ทวนสอบ/กรรมการ):{' '}
                  <strong>{blockers.assignedUsers.join(', ')}</strong>
                </li>
              )}
            </ul>
            <p className="mt-3 text-xs text-slate-400">
              * คำแนะนำ: หากไม่ต้องการใช้งานแล้ว แต่ไม่สามารถเคลียร์ข้อมูลผูกพันได้ แนะนำให้ใช้ตัวเลือก <strong>&quot;ปิดใช้งานหลักสูตร&quot;</strong> แทน
            </p>
            <div className="mt-4">
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
              >
                ลบหลักสูตร (มีข้อจำกัด)
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            {!showHardDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowHardDeleteConfirm(true)}
                disabled={busy}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                ลบหลักสูตรนี้อย่างถาวร
              </button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-800">⚠️ ยืนยันการลบหลักสูตร</p>
                <p className="mt-1 text-xs text-red-600">
                  เมื่อลบแล้วหลักสูตรนี้จะหายไปจากระบบอย่างถาวรและไม่สามารถกู้คืนได้ เนื่องจากระบบยืนยันแล้วว่าไม่มีข้อมูลวิชาหรือประวัติการสอนใดๆ ผูกอยู่
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleHardDelete}
                    disabled={busy}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy ? 'กำลังลบ…' : 'ใช่, ยืนยันลบถาวร'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHardDeleteConfirm(false)}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Danger Zone / Purge Panel */}
      <section className="overflow-hidden rounded-xl border border-red-200 bg-white">
        <button
          type="button"
          onClick={() => setShowDangerZone(!showDangerZone)}
          className="flex w-full items-center justify-between bg-red-50/50 px-5 py-4 text-left font-semibold text-red-800 hover:bg-red-50"
        >
          <span className="flex items-center gap-2">
            ⚠️ โซนอันตราย (Danger Zone)
          </span>
          <span className="text-sm">{showDangerZone ? 'ซ่อนการตั้งค่า ▲' : 'แสดงการตั้งค่า ▼'}</span>
        </button>

        {showDangerZone && (
          <div className="border-t border-red-100 p-5 space-y-4">
            <h4 className="font-semibold text-red-800">ล้างหลักสูตรและทำลายประวัติการทวนสอบทั้งหมด (Irreversible Purge)</h4>
            <p className="text-sm text-slate-600">
              ตัวเลือกนี้เป็นความเสียหายแบบ<strong>ไม่สามารถกู้คืนได้</strong> ระบบจะทำการล้างข้อมูลหลักสูตร รายวิชา ประวัติการวิเคราะห์จาก AI ผลคะแนนและข้อเสนอแนะทวนสอบของผู้ทวนสอบ บันทึกของคณะกรรมการ รวมถึงไฟล์รายงานทวนสอบทวิภาคี (PDF) ทั้งหมดออกจากคลาวด์จัดเก็บข้อมูล
            </p>

            <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-3">
              <label className="flex items-start gap-2.5 text-xs text-red-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToPurge}
                  onChange={(e) => setAgreedToPurge(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <span className="select-none font-medium">
                  ฉันเข้าใจดีว่าข้อมูลประวัติการทวนสอบ ผลประเมิน และไฟล์เอกสารรายงานทั้งหมดจะถูกทำลายอย่างถาวรและไม่สามารถกู้คืนได้
                </span>
              </label>

              <div className="text-xs text-red-800">
                <label className="block font-medium mb-1">
                  กรุณาพิมพ์รหัสหลักสูตร <strong>&quot;{programCode}&quot;</strong> เพื่อยืนยัน:
                </label>
                <input
                  type="text"
                  value={typedCode}
                  onChange={(e) => setTypedCode(e.target.value)}
                  placeholder={programCode}
                  className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handlePurge}
                disabled={busy || !agreedToPurge || typedCode !== programCode}
                className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {busy ? 'กำลังล้างข้อมูลในระบบ…' : `ลบทำลายหลักสูตรและประวัติทั้งหมดถาวร (${programCode})`}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
