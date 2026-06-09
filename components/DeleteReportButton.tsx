'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAssessmentReport } from '@/app/admin/assessment-reports/actions';

export default function DeleteReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await deleteAssessmentReport(reportId);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.push('/admin/assessment-reports');
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-slate-400 hover:text-red-600"
      >
        ลบรายงาน
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-slate-500">ยืนยันการลบรายงานนี้?</span>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded border border-red-300 px-2 py-0.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? 'กำลังลบ…' : 'ลบ'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="text-slate-400 hover:text-slate-600"
      >
        ยกเลิก
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
