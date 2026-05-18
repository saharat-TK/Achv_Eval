'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/config';

/**
 * Download link for the final verification PDF. When the PDF has not been
 * generated yet (e.g. generation failed during sign-off), shows a button to
 * generate it on demand.
 */
export default function FinalReportLink({
  offeringId,
  verificationId,
  finalPdfUrl,
}: {
  offeringId: string;
  verificationId: string;
  finalPdfUrl: string | null;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  if (finalPdfUrl) {
    return (
      <a
        href={finalPdfUrl}
        className="mt-2 inline-block text-sm text-mfu-primary hover:underline"
      >
        ดาวน์โหลดรายงานฉบับรับรองสุดท้าย (PDF)
      </a>
    );
  }

  async function generate() {
    setGenerating(true);
    setFailed(false);
    try {
      await getFirebaseAuth().authStateReady();
      const callable = httpsCallable(
        getFirebaseFunctions(),
        'generateFinalVerificationReport',
        { timeout: 240_000 },
      );
      await callable({ offeringId, verificationId });
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={generate}
        disabled={generating}
        className="text-sm text-mfu-primary underline hover:text-mfu-primary/80 disabled:opacity-50"
      >
        {generating ? 'กำลังสร้างรายงาน…' : 'สร้างรายงานฉบับรับรองสุดท้าย (PDF)'}
      </button>
      {failed && (
        <p className="mt-1 text-xs text-red-600">
          สร้างรายงานไม่สำเร็จ — สามารถกดสร้างใหม่ได้อีกครั้ง
        </p>
      )}
    </div>
  );
}
