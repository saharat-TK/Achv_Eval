'use client';

import { useState } from 'react';
import type {
  AssessmentDoc,
  FollowUpReviewDoc,
  ImplementationDecision,
  RubricScore,
} from '@/lib/types/models';
import { IMPLEMENTATION_DECISION, SEMESTER_LABEL } from '@/lib/constants';
import { saveFollowUp } from '@/app/assessor/[offeringId]/actions';

type ScoreKey = keyof AssessmentDoc['scores'];

interface RubricMeta {
  key: ScoreKey;
  number: string;
  labelTh: string;
}

const RUBRIC_ITEMS: RubricMeta[] = [
  { key: 'item1Clo',              number: '1',   labelTh: 'ผลลัพธ์การเรียนรู้รายวิชา' },
  { key: 'item21Content',         number: '2.1', labelTh: 'เนื้อหาการเรียนการสอน' },
  { key: 'item22Methods',         number: '2.2', labelTh: 'วิธีการเรียนการสอน' },
  { key: 'item31AssessmentMethods', number: '3.1', labelTh: 'วิธีการวัดและประเมินผล' },
  { key: 'item32AssessmentForms', number: '3.2', labelTh: 'รูปแบบการประเมินผล' },
  { key: 'item33Proportions',     number: '3.3', labelTh: 'สัดส่วนการวัดและประเมินผล' },
  { key: 'item34ExamQuality',     number: '3.4', labelTh: 'คุณภาพข้อสอบ' },
];

const DECISION_OPTIONS: {
  value: ImplementationDecision;
  labelTh: string;
  active: string;
  inactive: string;
}[] = [
  {
    value: 'implemented',
    labelTh: 'ดำเนินการแล้ว',
    active: 'bg-green-600 text-white border-green-600',
    inactive: 'bg-white text-slate-600 border-slate-200 hover:border-green-300',
  },
  {
    value: 'partially_implemented',
    labelTh: 'บางส่วน',
    active: 'bg-amber-500 text-white border-amber-500',
    inactive: 'bg-white text-slate-600 border-slate-200 hover:border-amber-300',
  },
  {
    value: 'not_implemented',
    labelTh: 'ยังไม่ดำเนินการ',
    active: 'bg-red-500 text-white border-red-500',
    inactive: 'bg-white text-slate-600 border-slate-200 hover:border-red-300',
  },
];

function ScoreBadge({ score }: { score: RubricScore }) {
  if (score === 'na') {
    return (
      <span className="inline-flex h-7 w-12 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs text-slate-400">
        N/A
      </span>
    );
  }
  const color =
    score === 3
      ? 'border-green-300 bg-green-50 text-green-700'
      : score === 2
        ? 'border-blue-300 bg-blue-50 text-blue-700'
        : 'border-amber-300 bg-amber-50 text-amber-700';
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-semibold ${color}`}
    >
      {score}
    </span>
  );
}

export default function FollowUpReviewPanel({
  currentOfferingId,
  previousOffering,
  previousAssessment,
  initialFollowUp,
  locked = false,
  onSaved,
  onGoToCurrent,
}: {
  currentOfferingId: string;
  previousOffering: {
    academicYear: number;
    semester: '1' | '2' | '3';
    section: string;
    courseCode: string;
    courseNameTh: string;
  };
  previousAssessment: {
    assessorName: string;
    scores: AssessmentDoc['scores'];
    comments: AssessmentDoc['comments'];
    generalNotes: string | null;
  };
  initialFollowUp: {
    itemDecisions: FollowUpReviewDoc['itemDecisions'];
    itemComments: FollowUpReviewDoc['itemComments'];
    notes: string | null;
  } | null;
  locked?: boolean;
  onSaved?: () => void;
  onGoToCurrent?: () => void;
}) {
  const [itemDecisions, setItemDecisions] = useState<
    Partial<Record<ScoreKey, ImplementationDecision>>
  >(initialFollowUp?.itemDecisions ?? {});
  const [itemComments, setItemComments] = useState<
    Partial<Record<ScoreKey, string>>
  >(initialFollowUp?.itemComments ?? {});
  const [notes, setNotes] = useState(initialFollowUp?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const ERROR_TH: Record<string, string> = {
    followup_locked: 'ผลติดตามถูกล็อกหลังลงนามทวนสอบแล้ว ไม่สามารถแก้ไขได้',
  };

  function setDecision(key: ScoreKey, value: ImplementationDecision) {
    setItemDecisions((prev) =>
      prev[key] === value ? { ...prev, [key]: undefined } : { ...prev, [key]: value },
    );
  }

  function setComment(key: ScoreKey, value: string) {
    setItemComments((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setMessage(null);
    const result = await saveFollowUp(currentOfferingId, itemDecisions, itemComments, notes);
    setSaving(false);
    if ('ok' in result) {
      setSaved(true);
      setMessage({ type: 'ok', text: 'บันทึกผลติดตามเรียบร้อย' });
      onSaved?.();
    } else {
      setMessage({
        type: 'err',
        text: ERROR_TH[result.error] || result.error || 'เกิดข้อผิดพลาด',
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Previous offering header */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500">ผลการทวนสอบที่นำมาติดตาม</p>
        <p className="mt-0.5 text-sm font-medium text-slate-800">
          ปีการศึกษา {previousOffering.academicYear}{' '}
          {SEMESTER_LABEL[previousOffering.semester]} ตอนเรียน{' '}
          {previousOffering.section}
        </p>
        <p className="text-xs text-slate-500">
          ทวนสอบโดย {previousAssessment.assessorName}
        </p>
      </div>

      {/* 7 rubric items */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">
            ผลการทวนสอบ 7 รายการ และผลการติดตามการนำไปปฏิบัติ
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            เลือกระดับการดำเนินการสำหรับแต่ละรายการ
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {RUBRIC_ITEMS.map((item) => {
            const score = previousAssessment.scores[item.key];
            const comment = previousAssessment.comments?.[item.key];
            const isNa = score === 'na';
            const selected = itemDecisions[item.key];

            return (
              <div key={item.key} className="px-4 py-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Left — previous assessment result */}
                  <div>
                    <div className="flex items-start gap-2">
                      <ScoreBadge score={score} />
                      <span className="text-sm font-medium text-slate-800">
                        {item.number}. {item.labelTh}
                      </span>
                    </div>

                    {!isNa && (comment?.strengths || comment?.improvements) && (
                      <div className="mt-2 space-y-1.5 pl-9">
                        {comment?.strengths && (
                          <div className="rounded-md bg-green-50 px-3 py-1.5">
                            <span className="text-xs font-medium text-green-700">ข้อดี: </span>
                            <span className="text-xs text-green-800">{comment.strengths}</span>
                          </div>
                        )}
                        {comment?.improvements && (
                          <div className="rounded-md bg-amber-50 px-3 py-1.5">
                            <span className="text-xs font-medium text-amber-700">ข้อเสนอแนะ: </span>
                            <span className="text-xs text-amber-800">{comment.improvements}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {isNa && (
                      <p className="mt-1 pl-9 text-xs text-slate-400">ไม่มีการสอบ — ไม่ประเมิน</p>
                    )}
                  </div>

                  {/* Right — assessor comment + decision buttons */}
                  {!isNa && (
                    <div className="flex h-full flex-col lg:pl-2">
                      <textarea
                        value={itemComments[item.key] ?? ''}
                        onChange={(e) => setComment(item.key, e.target.value)}
                        disabled={locked}
                        placeholder="ความเห็นของผู้ทวนสอบต่อการนำไปปฏิบัติ"
                        className="min-h-[5rem] w-full flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-mfu-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {DECISION_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDecision(item.key, opt.value)}
                            disabled={locked}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              selected === opt.value ? opt.active : opt.inactive
                            }`}
                          >
                            {opt.labelTh}
                          </button>
                        ))}
                        {selected && !locked && (
                          <button
                            type="button"
                            onClick={() =>
                              setItemDecisions((prev) => {
                                const next = { ...prev };
                                delete next[item.key];
                                return next;
                              })
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-400 hover:border-slate-300"
                          >
                            ล้าง
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Previous general notes */}
      {previousAssessment.generalNotes && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">
            บันทึกทั่วไป (จากการทวนสอบภาคก่อน)
          </h3>
          <p className="mt-2 text-sm text-slate-600">{previousAssessment.generalNotes}</p>
        </div>
      )}

      {/* Follow-up notes */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-semibold text-slate-700">
          หมายเหตุการติดตามผล
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={locked}
          placeholder="ระบุหลักฐาน ข้อสังเกต หรือรายละเอียดเพิ่มเติมเกี่ยวกับการนำข้อเสนอแนะไปปรับปรุง"
          rows={4}
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-mfu-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      {/* Save */}
      {locked ? (
        <div className="flex items-center gap-4">
          <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
            ลงนามทวนสอบแล้ว — ผลติดตามถูกล็อก ไม่สามารถแก้ไขได้
          </div>
          {onGoToCurrent && (
            <button
              type="button"
              onClick={onGoToCurrent}
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
            >
              ไปที่การประเมินปัจจุบัน <span aria-hidden>→</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-mfu-primary px-5 py-2 text-sm font-medium text-white hover:bg-mfu-primary/90 disabled:opacity-50 transition"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกผลติดตาม'}
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
          {saved && onGoToCurrent && (
            <button
              type="button"
              onClick={onGoToCurrent}
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
            >
              ถัดไป: การประเมินปัจจุบัน <span aria-hidden>→</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
