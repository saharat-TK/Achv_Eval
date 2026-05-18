'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';
// Type-only import — erased at compile time, so the server-only data
// module is never pulled into the client bundle.
import type { ExecutiveDashboardData } from '@/lib/data/dashboard';

interface ReportContext {
  programLabel: string;
  yearLabel: string;
  semesterLabel: string;
}

/**
 * Generates the executive-dashboard QA report as a PDF. The dashboard data
 * is computed server-side and passed straight to the callable, which renders
 * it and returns the PDF bytes for download.
 */
export default function DashboardPdfButton({
  data,
  context,
}: {
  data: ExecutiveDashboardData;
  context: ReportContext;
}) {
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  async function generate() {
    setGenerating(true);
    setFailed(false);
    try {
      await getFirebaseAuth().authStateReady();
      const callable = httpsCallable<
        { report: unknown },
        { pdfBase64: string }
      >(getFirebaseFunctions(), 'generateDashboardReport', { timeout: 120_000 });

      const result = await callable({
        report: {
          context,
          summary: data.summary,
          programRows: data.programRows,
          trend: data.trend,
          recurringWeaknesses: data.recurringWeaknesses,
        },
      });

      const bytes = Uint8Array.from(atob(result.data.pdfBase64), (c) =>
        c.charCodeAt(0),
      );
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dashboard-qa-report-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={generate}
        disabled={generating}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-mfu-primary hover:bg-slate-50 disabled:opacity-50"
      >
        {generating ? 'กำลังสร้าง PDF…' : 'ดาวน์โหลด PDF'}
      </button>
      {failed && (
        <p className="mt-1 text-xs text-red-600">
          สร้าง PDF ไม่สำเร็จ — ลองอีกครั้ง
        </p>
      )}
    </div>
  );
}
