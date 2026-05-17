'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VerificationDecision } from '@/lib/types/models';
import { VERIFICATION_DECISION } from '@/lib/constants';

const DECISION_ORDER: VerificationDecision[] = ['verified', 'needs_follow_up'];

const TONE_CLASSES: Record<string, string> = {
  green: 'border-green-300 bg-green-50 text-green-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-800',
};

export default function FinalVerificationForm({
  offeringId,
}: {
  offeringId: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<VerificationDecision | null>(null);
  const [committeeNotes, setCommitteeNotes] = useState('');
  const [requiredActions, setRequiredActions] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  async function handleSubmit() {
    if (!decision) return;
    if (decision === 'needs_follow_up' && !requiredActions.trim()) {
      setMessage({
        type: 'err',
        text: 'กรุณาระบุรายการที่ต้องติดตามก่อนรับรองแบบมีเงื่อนไข',
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/verification/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offeringId,
          decision,
          committeeNotes,
          requiredActions,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'submission_failed');
      setMessage({ type: 'ok', text: 'บันทึกผลรับรองเรียบร้อย' });
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
          const meta = VERIFICATION_DECISION[d];
          const selected = decision === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setDecision(d)}
              className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                selected
                  ? TONE_CLASSES[meta.tone]
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full border ${
                  selected ? 'border-current bg-current' : 'border-slate-300'
                }`}
              />
              {meta.labelTh}
            </button>
          );
        })}
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">
          บันทึก / ข้อสังเกตของคณะกรรมการ
        </label>
        <textarea
          value={committeeNotes}
          onChange={(e) => setCommitteeNotes(e.target.value)}
          placeholder="สรุปเหตุผลการรับรอง หรือข้อสังเกตเพิ่มเติม"
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-mfu-primary focus:outline-none"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">
          รายการที่ต้องติดตาม
        </label>
        <textarea
          value={requiredActions}
          onChange={(e) => setRequiredActions(e.target.value)}
          placeholder="จำเป็นเมื่อเลือก 'ต้องติดตาม'"
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-mfu-primary focus:outline-none"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving || !decision}
        className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-mfu-primary/90 disabled:opacity-50"
      >
        {saving ? 'กำลังบันทึก…' : 'บันทึกและรับรองผล'}
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
