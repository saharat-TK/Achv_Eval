'use client';

import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import { DOCUMENT_SLOTS } from '@/lib/constants';
import type { UploadType } from '@/lib/types/models';

const ACCEPT = '.pdf,.csv';
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

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

export default function AnalyzeCoursePanel({ offeringId }: { offeringId: string }) {
  const [selected, setSelected] = useState<Partial<Record<UploadType, File>>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Warm up the Firebase Auth SDK so the callable can attach an ID token.
  useEffect(() => {
    getFirebaseAuth();
  }, []);

  const hasTqf3 = Boolean(selected.tqf3);
  const totalBytes = Object.values(selected).reduce((s, f) => s + (f?.size ?? 0), 0);
  const tooLarge = totalBytes > MAX_TOTAL_BYTES;

  function pick(type: UploadType, file: File | undefined) {
    setSelected((prev) => {
      const next = { ...prev };
      if (file) next[type] = file;
      else delete next[type];
      return next;
    });
    setError(null);
  }

  async function runAnalysis() {
    setBusy(true);
    setError(null);
    try {
      // Wait for the Auth SDK to restore the session so the callable can
      // attach the ID token.
      const auth = getFirebaseAuth();
      await auth.authStateReady();
      if (!auth.currentUser) {
        setError('เซสชันหมดอายุ กรุณาออกจากระบบและเข้าสู่ระบบใหม่');
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
      });

      setSubmitted(true);
      setSelected({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ส่งคำขอวิเคราะห์ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-medium text-green-800">
          ส่งคำขอวิเคราะห์เรียบร้อยแล้ว
        </p>
        <p className="mt-1 text-xs text-green-700">
          ระบบกำลังวิเคราะห์เอกสารทีละส่วน — ท่านสามารถออกจากหน้านี้หรือไป
          วิเคราะห์รายวิชาอื่นได้ สถานะและผลการวิเคราะห์จะปรากฏด้านล่างโดยอัตโนมัติ
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-3 text-xs text-green-800 underline hover:text-green-900"
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
              <label className="shrink-0 cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                {file ? 'เปลี่ยนไฟล์' : 'เลือกไฟล์'}
                <input
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  disabled={busy}
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

      <button
        onClick={runAnalysis}
        disabled={busy || !hasTqf3 || tooLarge}
        className="mt-4 rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {busy ? 'กำลังส่งเอกสาร…' : 'อัปโหลดและเริ่มวิเคราะห์'}
      </button>
      {!hasTqf3 && !busy && (
        <p className="mt-2 text-xs text-slate-400">
          ต้องแนบไฟล์ มคอ.3 (TQF3) เป็นอย่างน้อยจึงจะเริ่มวิเคราะห์ได้
        </p>
      )}
    </div>
  );
}
