'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

type AnalyzeResult = { reportId: string; version: number; status: string };

export default function AnalyzeCoursePanel({ offeringId }: { offeringId: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Partial<Record<UploadType, File>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start the Firebase Auth SDK loading its persisted session as soon as the
  // panel mounts, so the callable can attach an ID token when invoked.
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
      // The callable authenticates via the Firebase ID token. Wait for the
      // Auth SDK to finish restoring the persisted session before calling it.
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

      const callable = httpsCallable<
        { offeringId: string; files: unknown[] },
        AnalyzeResult
      >(getFirebaseFunctions(), 'analyzeCourse', { timeout: 300_000 });

      await callable({ offeringId, files });
      router.refresh();
      setSelected({});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'การวิเคราะห์ล้มเหลว';
      setError(msg);
    } finally {
      setBusy(false);
    }
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
        {busy ? 'กำลังวิเคราะห์… (อาจใช้เวลา 1–2 นาที)' : 'อัปโหลดและเริ่มวิเคราะห์'}
      </button>
      {!hasTqf3 && !busy && (
        <p className="mt-2 text-xs text-slate-400">
          ต้องแนบไฟล์ มคอ.3 (TQF3) เป็นอย่างน้อยจึงจะเริ่มวิเคราะห์ได้
        </p>
      )}
      {busy && (
        <p className="mt-2 text-xs text-slate-400">
          กรุณาอย่าปิดหน้านี้ — ระบบกำลังส่งเอกสารให้ AI วิเคราะห์
        </p>
      )}
    </div>
  );
}
