'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AssessmentDoc, RubricItemComment, RubricScore } from '@/lib/types/models';
import { computeRubricResult } from '@/lib/types/models';
import { BAND_LABEL, initialScores, type ScoreKey } from '@/lib/rubric';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import { useToast } from '@/components/ToastProvider';
import RubricScorer from '@/components/RubricScorer';
import {
  saveSelfAssessment,
  submitSelfAssessment,
} from '@/app/lecturer/[offeringId]/actions';

/**
 * Lecturer's pre-assessment of the same 7 rubric items. While the offering is
 * `ai_complete` the lecturer can save a draft, then "ส่งให้ผู้ทวนสอบ" — a single
 * action that records the self-assessment and sends the offering for review.
 * Read-only once sent.
 */
export default function SelfAssessmentForm({
  offeringId,
  hasExamAssessment,
  editable,
  initial,
}: {
  offeringId: string;
  hasExamAssessment: boolean;
  editable: boolean;
  initial: {
    scores: AssessmentDoc['scores'];
    comments: Partial<Record<ScoreKey, RubricItemComment>>;
    generalNotes: string;
    isSubmitted: boolean;
  } | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [scores, setScores] = useState<AssessmentDoc['scores']>(
    initial?.scores ?? initialScores(hasExamAssessment),
  );
  const [comments, setComments] = useState<Partial<Record<ScoreKey, RubricItemComment>>>(
    initial?.comments ?? {},
  );
  const [generalNotes, setGeneralNotes] = useState(initial?.generalNotes ?? '');
  const [saving, setSaving] = useState(false);

  const readOnly = !editable;
  const result = useMemo(() => computeRubricResult(scores), [scores]);
  const band = BAND_LABEL[result.band] ?? BAND_LABEL.improve;

  function setScore(key: ScoreKey, value: RubricScore) {
    if (!readOnly) setScores((p) => ({ ...p, [key]: value }));
  }
  function setComment(key: ScoreKey, field: 'strengths' | 'improvements', value: string) {
    if (!readOnly) setComments((p) => ({ ...p, [key]: { ...p[key], [field]: value } }));
  }

  async function run(submit: boolean) {
    setSaving(true);
    try {
      const fn = submit ? submitSelfAssessment : saveSelfAssessment;
      const res = await fn(offeringId, scores, comments, generalNotes);
      if (!res.ok) {
        toast({
          title: submit ? 'ส่งให้ผู้ทวนสอบไม่สำเร็จ' : 'บันทึกร่างไม่สำเร็จ',
          description: res.error,
          variant: 'error',
        });
        return;
      }
      toast({
        title: submit ? 'ส่งให้ผู้ทวนสอบแล้ว' : 'บันทึกร่างแล้ว',
        variant: 'success',
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${band.color}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">
              ผลการประเมินตนเอง: {result.totalScore}/{result.maxScore} ({result.percentScore}%)
            </div>
            <div className="text-xs mt-0.5">ระดับ: {band.th}</div>
          </div>
          {initial?.isSubmitted && (
            <span className="text-xs px-2 py-1 rounded-full bg-white/60 font-medium">
              ส่งให้ผู้ทวนสอบแล้ว
            </span>
          )}
        </div>
      </div>

      <RubricScorer
        scores={scores}
        comments={comments}
        generalNotes={generalNotes}
        hasExamAssessment={hasExamAssessment}
        readOnly={readOnly}
        onScore={setScore}
        onComment={setComment}
        onNotes={setGeneralNotes}
      />

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => run(false)}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกร่าง'}
          </button>
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm({
                title: 'ส่งให้ผู้ทวนสอบ',
                message:
                  'ระบบจะบันทึกผลการประเมินตนเองและส่งรายวิชาให้ผู้ทวนสอบ หลังจากส่งแล้วจะไม่สามารถแก้ไขผลการประเมินตนเองได้',
                confirmLabel: 'ส่งให้ผู้ทวนสอบ',
                cancelLabel: 'ยกเลิก',
                variant: 'danger',
                confirmationText: 'ยืนยัน',
              });
              if (ok) run(true);
            }}
            disabled={saving}
            className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:bg-mfu-primary/90 disabled:opacity-50 transition"
          >
            {saving ? 'กำลังส่ง…' : 'ส่งให้ผู้ทวนสอบ'}
          </button>
        </div>
      )}
    </div>
  );
}
