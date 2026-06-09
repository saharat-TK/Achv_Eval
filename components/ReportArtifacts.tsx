'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import type { ReportStatus } from '@/lib/types/models';

export default function ReportArtifacts({
  reportId,
  status,
  pdfUrl,
  docxUrl,
}: {
  reportId: string;
  status: ReportStatus;
  pdfUrl: string | null;
  docxUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await getFirebaseAuth().authStateReady();
      const callable = httpsCallable(
        getFirebaseFunctions(),
        'generateAssessmentSummaryReport',
        { timeout: 300_000 },
      );
      await callable({ reportId });
      router.refresh();
    } catch {
      setError('สร้างรายงานไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  const ready = status === 'ready' && (pdfUrl || docxUrl);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-800">เอกสารรายงาน</h2>

      {ready ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {pdfUrl && (
            <a
              href={pdfUrl}
              className="rounded-lg border border-mfu-primary px-4 py-2 text-sm font-medium text-mfu-primary hover:bg-mfu-primary/5"
            >
              ดาวน์โหลด PDF
            </a>
          )}
          {docxUrl && (
            <a
              href={docxUrl}
              className="rounded-lg border border-mfu-primary px-4 py-2 text-sm font-medium text-mfu-primary hover:bg-mfu-primary/5"
            >
              ดาวน์โหลด DOCX (แก้ไขได้)
            </a>
          )}
          <button
            onClick={generate}
            disabled={busy}
            className="text-xs text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
          >
            {busy ? 'กำลังสร้างใหม่…' : 'สร้างเอกสารใหม่'}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-slate-500">
            {status === 'synthesized'
              ? 'สังเคราะห์ข้อเสนอแนะ AI เรียบร้อยแล้ว — สร้างเอกสารรายงานในรูปแบบ PDF และ DOCX ได้เลย'
              : 'สร้างเอกสารรายงานในรูปแบบ PDF และ DOCX พร้อมข้อเสนอแนะที่สังเคราะห์จากการวิเคราะห์ AI'}
          </p>
          <button
            onClick={generate}
            disabled={busy}
            className="mt-3 rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'กำลังสร้างรายงาน…' : 'สร้างเอกสารรายงาน (PDF / DOCX)'}
          </button>
        </div>
      )}

      {status === 'failed' && !busy && (
        <p className="mt-2 text-sm text-amber-700">
          การสร้างครั้งก่อนไม่สำเร็จ — สามารถกดสร้างใหม่ได้
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
