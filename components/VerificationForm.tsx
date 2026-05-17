'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ImplementationDecision } from '@/lib/types/models';
import { IMPLEMENTATION_DECISION } from '@/lib/constants';

const DECISION_ORDER: ImplementationDecision[] = [
  'implemented',
  'partially_implemented',
  'not_implemented',
];

const TONE_CLASSES: Record<string, string> = {
  green: 'border-green-300 bg-green-50 text-green-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-800',
  red: 'border-red-300 bg-red-50 text-red-800',
};

/**
 * Verification-committee decision form. Records whether the previous
 * semester's recommendations were carried out in the next offering.
 */
export default function VerificationForm({
  previousOfferingId,
}: {
  previousOfferingId: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<ImplementationDecision | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  async function handleSubmit() {
    if (!decision) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/assessor/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previousOfferingId, decision, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'submission_failed');
      setMessage({ type: 'ok', text: 'บันทึกผลการทวนสอบการนำไปปฏิบัติเรียบร้อย' });
      router.refresh();
    } catch (e: any) {
      setMessage({ type: 'err', text: e.message || 'เกิดข้อผิดพลาด' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {DECISION_ORDER.map((d) => {
          const meta = IMPLEMENTATION_DECISION[d];
          const selected = decision === d;
          return (
            <label
              key={d}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                selected
                  ? TONE_CLASSES[meta.tone]
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="decision"
                value={d}
                checked={selected}
                onChange={() => setDecision(d)}
                className="sr-only"
              />
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full border ${
                  selected ? 'border-current bg-current' : 'border-slate-300'
                }`}
              />
              {meta.labelTh}
            </label>
          );
        })}
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">
          บันทึก / ข้อสังเกตของคณะกรรมการ
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ระบุหลักฐานการนำข้อเสนอแนะไปปรับปรุง หรือเหตุผลที่ยังไม่ดำเนินการ"
          rows={4}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-mfu-primary focus:outline-none"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving || !decision}
        className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:bg-mfu-primary/90 disabled:opacity-50 transition"
      >
        {saving ? 'กำลังบันทึก…' : 'บันทึกผลการทวนสอบ'}
      </button>

      {message && (
        <p
          className={`text-sm ${
            message.type === 'ok' ? 'text-green-700' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
