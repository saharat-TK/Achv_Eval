'use client';

import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import { DOCUMENT_SLOTS } from '@/lib/constants';
import { useToast } from '@/components/ToastProvider';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import { resetAnalysisAttempts } from '@/app/lecturer/[offeringId]/actions';
import type { OfferingStatus, UploadType } from '@/lib/types/models';

const ACCEPT = '.pdf,.csv';
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const ANALYSIS_ALLOWED_STATUSES: OfferingStatus[] = [
  'documents_pending',
  'ready_for_ai',
  'ai_complete',
];

type SelectedUploadSummary = {
  type: UploadType;
  labelTh: string;
  required: boolean;
  file: File;
};

/** Reads a File into a base64 string (chunked to avoid call-stack limits). */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default function AnalyzeCoursePanel({
  offeringId,
  status,
  attemptLimit,
  attemptCount,
  isSuperAdmin = false,
}: {
  offeringId: string;
  status: OfferingStatus;
  attemptLimit: number;
  attemptCount: number;
  /** Super-admins get a button to reset the attempt counter for re-testing. */
  isSuperAdmin?: boolean;
}) {
  const [selected, setSelected] = useState<Partial<Record<UploadType, File>>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localAttemptCount, setLocalAttemptCount] = useState(attemptCount);
  const [resetting, setResetting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  async function handleReset() {
    if (resetting) return;
    const ok = await confirm({
      title: 'รีเซ็ตสิทธิ์วิเคราะห์',
      message: `รีเซ็ตจำนวนครั้งกลับเป็น ${attemptLimit}/${attemptLimit} ใช่หรือไม่?`,
      confirmLabel: 'รีเซ็ต',
      cancelLabel: 'ยกเลิก',
      variant: 'danger',
    });
    if (!ok) return;
    setResetting(true);
    try {
      const res = await resetAnalysisAttempts(offeringId);
      if (!res.ok) {
        toast({ title: 'รีเซ็ตไม่สำเร็จ', description: res.error, variant: 'error' });
        return;
      }
      setLocalAttemptCount(0);
      setSubmitted(false);
      toast({
        title: 'รีเซ็ตสิทธิ์วิเคราะห์แล้ว',
        description: `จำนวนครั้งกลับเป็น ${attemptLimit}/${attemptLimit} เรียบร้อย`,
        variant: 'success',
      });
    } catch {
      toast({
        title: 'รีเซ็ตไม่สำเร็จ',
        description: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์',
        variant: 'error',
      });
    } finally {
      setResetting(false);
    }
  }

  // Warm up the Firebase Auth SDK so the callable can attach an ID token.
  useEffect(() => {
    getFirebaseAuth();
  }, []);

  const hasTqf3 = Boolean(selected.tqf3);
  const totalBytes = Object.values(selected).reduce((s, f) => s + (f?.size ?? 0), 0);
  const tooLarge = totalBytes > MAX_TOTAL_BYTES;
  const remainingAttempts = Math.max(0, attemptLimit - localAttemptCount);
  const hasAttempts = remainingAttempts > 0;
  const workflowAllowsAnalysis = ANALYSIS_ALLOWED_STATUSES.includes(status);
  const locked = !hasAttempts || !workflowAllowsAnalysis;
  const selectedEntries: SelectedUploadSummary[] = DOCUMENT_SLOTS.flatMap((slot) => {
    const file = selected[slot.type];
    return file
      ? [
          {
            type: slot.type,
            labelTh: slot.labelTh,
            required: slot.required,
            file,
          },
        ]
      : [];
  });

  const badgeClass =
    remainingAttempts === 0
      ? 'bg-slate-100 text-slate-500 ring-slate-200'
      : remainingAttempts === 1
        ? 'bg-red-50 text-red-700 ring-red-200'
        : 'bg-green-50 text-green-700 ring-green-200';

  function pick(type: UploadType, file: File | undefined) {
    setSelected((prev) => {
      const next = { ...prev };
      if (file) next[type] = file;
      else delete next[type];
      return next;
    });
    setError(null);
  }

  function openConfirmDialog() {
    if (busy || !hasTqf3 || tooLarge || locked) return;
    setConfirmOpen(true);
  }

  function cancelConfirmDialog() {
    if (busy) return;
    setConfirmOpen(false);
    toast({
      title: 'ยกเลิกการวิเคราะห์',
      description: 'ยังไม่ได้ส่งไฟล์เข้าระบบ และยังไม่ถูกนับจำนวนครั้ง',
      variant: 'info',
    });
  }

  async function runAnalysis() {
    if (busy || !hasTqf3 || tooLarge || locked) return;
    setBusy(true);
    setError(null);
    try {
      // Wait for the Auth SDK to restore the session so the callable can
      // attach the ID token.
      const auth = getFirebaseAuth();
      await auth.authStateReady();
      if (!auth.currentUser) {
        const message = 'เซสชันหมดอายุ กรุณาออกจากระบบและเข้าสู่ระบบใหม่';
        setError(message);
        toast({
          title: 'ไม่สามารถเริ่มวิเคราะห์',
          description: message,
          variant: 'error',
        });
        setBusy(false);
        return;
      }

      const entries = Object.entries(selected) as [UploadType, File][];
      const files = await Promise.all(
        entries.map(async ([type, file]) => ({
          type,
          filename: file.name,
          mimeType: file.type || 'application/pdf',
          dataBase64: await fileToBase64(file),
        })),
      );

      const callable = httpsCallable<{ offeringId: string; files: unknown[] }, unknown>(
        getFirebaseFunctions(),
        'analyzeCourse',
        { timeout: 540_000 },
      );

      // Fire and forget. The Cloud Function runs to completion server-side
      // even if the lecturer navigates away; it writes the aiReports doc,
      // which the live report list below picks up. We only catch fast
      // invocation errors here.
      callable({ offeringId, files }).catch((e) => {
        console.error('analyzeCourse invocation failed', e);
        toast({
          title: 'การวิเคราะห์ล้มเหลว',
          description:
            e instanceof Error
              ? e.message
              : 'ระบบไม่สามารถส่งคำขอวิเคราะห์ให้เสร็จสมบูรณ์ได้',
          variant: 'error',
        });
      });

      setConfirmOpen(false);
      setLocalAttemptCount((count) => Math.min(attemptLimit, count + 1));
      setSubmitted(true);
      setSelected({});
      toast({
        title: 'เริ่มวิเคราะห์แล้ว',
        description: 'ระบบรับคำขอวิเคราะห์และนับจำนวนครั้งเรียบร้อยแล้ว',
        variant: 'success',
      });
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : 'ส่งคำขอวิเคราะห์ไม่สำเร็จ';
      setError(message);
      toast({
        title: 'ส่งคำขอวิเคราะห์ไม่สำเร็จ',
        description: message,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-green-800">
            ส่งคำขอวิเคราะห์เรียบร้อยแล้ว
          </p>
          <AttemptBadge
            className={badgeClass}
            remaining={remainingAttempts}
            limit={attemptLimit}
          />
        </div>
        <p className="mt-1 text-xs text-green-700">
          ระบบกำลังวิเคราะห์เอกสารทีละส่วน — ท่านสามารถออกจากหน้านี้หรือไป
          วิเคราะห์รายวิชาอื่นได้ สถานะและผลการวิเคราะห์จะปรากฏด้านล่างโดยอัตโนมัติ
        </p>
        <button
          onClick={() => setSubmitted(false)}
          disabled={remainingAttempts === 0}
          className="mt-3 text-xs text-green-800 underline hover:text-green-900 disabled:text-slate-400 disabled:no-underline"
        >
          ส่งคำขอวิเคราะห์อีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {DOCUMENT_SLOTS.map((slot) => {
          const file = selected[slot.type];
          return (
            <div
              key={slot.type}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">
                  {slot.labelTh}
                  {slot.required && (
                    <span className="ml-2 text-xs text-red-500">บังคับ</span>
                  )}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {file ? file.name : slot.descriptionTh}
                </div>
              </div>
              <label
                className={`shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium ${
                  busy || locked
                    ? 'cursor-not-allowed text-slate-400'
                    : 'cursor-pointer text-slate-600 hover:bg-slate-50'
                }`}
              >
                {file ? 'เปลี่ยนไฟล์' : 'เลือกไฟล์'}
                <input
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  disabled={busy || locked}
                  onChange={(e) => pick(slot.type, e.target.files?.[0])}
                />
              </label>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {tooLarge && (
        <p className="mt-3 text-sm text-red-600">ขนาดไฟล์รวมเกิน 25 MB</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={openConfirmDialog}
          disabled={busy || !hasTqf3 || tooLarge || locked}
          className="inline-flex items-center gap-2 rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:bg-slate-300 disabled:text-slate-600 disabled:opacity-100"
        >
          <span>{busy ? 'กำลังส่งเอกสาร…' : 'อัปโหลดและเริ่มวิเคราะห์'}</span>
          <AttemptBadge
            className={badgeClass}
            remaining={remainingAttempts}
            limit={attemptLimit}
          />
        </button>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            title="รีเซ็ตจำนวนครั้งวิเคราะห์ (เฉพาะผู้ดูแลระบบสูงสุด)"
            className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {resetting ? 'กำลังรีเซ็ต…' : 'รีเซ็ตสิทธิ์'}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        ระบบอนุญาตให้วิเคราะห์ด้วย AI ได้สูงสุด {attemptLimit} ครั้งต่อรายวิชาที่เปิดสอน
        โดยนับทุกคำขอที่ระบบรับไว้ รวมถึงกรณีวิเคราะห์ล้มเหลว
      </p>
      {!hasAttempts && (
        <p className="mt-1 text-xs text-slate-500">
          ใช้สิทธิ์วิเคราะห์ครบแล้ว จึงไม่สามารถอัปโหลดและเริ่มวิเคราะห์ใหม่ได้
        </p>
      )}
      {hasAttempts && !workflowAllowsAnalysis && (
        <p className="mt-1 text-xs text-slate-500">
          รายวิชานี้เข้าสู่ขั้นตอนทวนสอบแล้ว จึงไม่สามารถวิเคราะห์ใหม่ได้
        </p>
      )}
      {!locked && !hasTqf3 && !busy && (
        <p className="mt-2 text-xs text-slate-400">
          ต้องแนบไฟล์ มคอ.3 (TQF3) เป็นอย่างน้อยจึงจะเริ่มวิเคราะห์ได้
        </p>
      )}

      <AnalysisUploadConfirmDialog
        open={confirmOpen}
        busy={busy}
        files={selectedEntries}
        totalBytes={totalBytes}
        remainingAttempts={remainingAttempts}
        attemptLimit={attemptLimit}
        onCancel={cancelConfirmDialog}
        onConfirm={runAnalysis}
      />
    </div>
  );
}

function AttemptBadge({
  className,
  remaining,
  limit,
}: {
  className: string;
  remaining: number;
  limit: number;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${className}`}
      title={`เหลือ ${remaining} จาก ${limit} ครั้ง`}
    >
      เหลือ {remaining}/{limit}
    </span>
  );
}

function AnalysisUploadConfirmDialog({
  open,
  busy,
  files,
  totalBytes,
  remainingAttempts,
  attemptLimit,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  files: SelectedUploadSummary[];
  totalBytes: number;
  remainingAttempts: number;
  attemptLimit: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const afterConfirmRemaining = Math.max(0, remainingAttempts - 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-confirm-title"
        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h3
            id="analysis-confirm-title"
            className="text-base font-semibold text-slate-900"
          >
            ตรวจสอบไฟล์ก่อนเริ่มวิเคราะห์
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            เมื่อยืนยัน ระบบจะส่งไฟล์ให้ AI วิเคราะห์ทันที และนับใช้สิทธิ์ 1 ครั้ง
            แม้ว่าการวิเคราะห์จะล้มเหลวภายหลัง
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {files.map((item) => (
              <div
                key={item.type}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr_auto]"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {item.labelTh}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.required ? 'ไฟล์บังคับ' : 'ไฟล์เพิ่มเติม'}
                  </p>
                </div>
                <p className="min-w-0 truncate text-sm text-slate-700">
                  {item.file.name}
                </p>
                <p className="text-sm text-slate-500">
                  {formatBytes(item.file.size)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                ขนาดไฟล์รวม
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatBytes(totalBytes)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                จำนวนครั้งหลังยืนยัน
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                เหลือ {afterConfirmRemaining}/{attemptLimit} ครั้ง
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-slate-300 disabled:text-slate-600 disabled:opacity-100"
          >
            {busy ? 'กำลังส่งเอกสาร…' : 'ยืนยันและเริ่มวิเคราะห์'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${
    units[exponent]
  }`;
}
