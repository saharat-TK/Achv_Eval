'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
import type { ReportStatus } from '@/lib/types/models';

export default function ReportArtifacts({
  reportId,
  status,
  pdfUrl,
  compact = false,
}: {
  reportId: string;
  status: ReportStatus;
  pdfUrl: string | null;
  /** Render bare (no card/heading) for the header corner. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failedAttempt, setFailedAttempt] = useState(false);
  const startedRef = useRef(false);

  async function generate() {
    setBusy(true);
    setFailedAttempt(false);
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
      setFailedAttempt(true);
    } finally {
      setBusy(false);
    }
  }

  // The PDF is produced automatically here — this page has no manual
  // (re)generate control; recreating a report is done from the list page. On
  // open we render the document once if the report's info is ready
  // (synthesized) but no PDF exists, and retry once per open if a previous
  // render failed.
  useEffect(() => {
    if (startedRef.current) return;
    if (!pdfUrl && (status === 'synthesized' || status === 'failed')) {
      startedRef.current = true;
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pdfUrl]);

  const ready = status === 'ready' && !!pdfUrl;

  const content = ready ? (
    <a
      href={pdfUrl!}
      className="inline-block rounded-lg border border-mfu-primary px-4 py-2 text-sm font-medium text-mfu-primary hover:bg-mfu-primary/5"
    >
      ดาวน์โหลด PDF
    </a>
  ) : failedAttempt ? (
    <p className={`text-sm text-amber-700 ${compact ? 'max-w-[16rem]' : ''}`}>
      สร้างเอกสารไม่สำเร็จ —{' '}
      {compact
        ? 'เปิดหน้านี้อีกครั้งเพื่อลองใหม่'
        : 'กรุณาเปิดหน้านี้อีกครั้งเพื่อลองใหม่ หรือสร้างรายงานใหม่จากหน้ารายการรายงานการทวนสอบ'}
    </p>
  ) : status === 'synthesizing' || status === 'draft' ? (
    <p className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
      กำลังเตรียมข้อมูลรายงาน…
    </p>
  ) : (
    <p className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mfu-primary" />
      กำลังสร้างเอกสารรายงาน… (อาจใช้เวลาสักครู่)
    </p>
  );

  if (compact) return <div className="text-right">{content}</div>;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-800">เอกสารรายงาน</h2>
      <div className="mt-3">{content}</div>
    </section>
  );
}
