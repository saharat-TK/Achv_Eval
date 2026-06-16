'use client';

import type { AssessmentDoc, RubricScore, RubricItemComment } from '@/lib/types/models';
import { RUBRIC_ITEMS, type ScoreKey } from '@/lib/rubric';

/**
 * Presentational 7-item rubric input shared by the assessor form, the lecturer
 * self-assessment, and the read-only reference panel. Holds no state — the
 * parent owns scores/comments/notes and the change handlers.
 */
export default function RubricScorer({
  scores,
  comments,
  generalNotes,
  hasExamAssessment,
  readOnly,
  onScore,
  onComment,
  onNotes,
  scrollBody = false,
}: {
  scores: AssessmentDoc['scores'];
  comments: Partial<Record<ScoreKey, RubricItemComment>>;
  generalNotes: string;
  hasExamAssessment: boolean;
  readOnly: boolean;
  onScore?: (key: ScoreKey, value: RubricScore) => void;
  onComment?: (key: ScoreKey, field: 'strengths' | 'improvements', value: string) => void;
  onNotes?: (value: string) => void;
  scrollBody?: boolean;
}) {
  return (
    <>
      <div
        className={
          scrollBody
            ? 'overflow-hidden rounded-xl border border-slate-200 bg-white lg:flex lg:min-h-[12rem] lg:flex-[3_1_0%] lg:flex-col'
            : 'overflow-hidden rounded-xl border border-slate-200 bg-white'
        }
      >
        <div className="border-b border-slate-100 px-4 py-3 lg:shrink-0">
          <h3 className="text-sm font-semibold text-slate-700">
            หัวข้อการทวนสอบ (7 รายการ)
          </h3>
        </div>

        <div
          className={
            scrollBody
              ? 'divide-y divide-slate-100 lg:min-h-0 lg:flex-1 lg:overflow-y-auto'
              : 'divide-y divide-slate-100'
          }
        >
          {RUBRIC_ITEMS.map((item) => {
            const isNaAllowed = item.allowNa && !hasExamAssessment;
            const currentScore = scores[item.key];

            return (
              <div key={item.key} className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-sm font-medium text-slate-800">
                      {item.number}. {item.labelTh}
                    </span>
                    {isNaAllowed && (
                      <span className="ml-2 text-xs text-slate-400">
                        (ไม่มีการสอบ — ไม่ประเมิน)
                      </span>
                    )}
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {item.detailTh}
                    </p>
                  </div>

                  <div
                    className="flex shrink-0 gap-2"
                    role="radiogroup"
                    aria-label={`${item.number}. ${item.labelTh}`}
                  >
                    {isNaAllowed ? (
                      <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-500">
                        N/A
                      </span>
                    ) : (
                      [1, 2, 3].map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={currentScore === v}
                          onClick={() => onScore?.(item.key, v as RubricScore)}
                          disabled={readOnly}
                          className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-colors ${
                            currentScore === v
                              ? 'bg-mfu-primary text-white border-mfu-primary'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          } ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {v}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {!isNaAllowed && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500">ข้อดี</label>
                      <textarea
                        value={comments[item.key]?.strengths ?? ''}
                        onChange={(e) => onComment?.(item.key, 'strengths', e.target.value)}
                        disabled={readOnly}
                        placeholder="ข้อดี / จุดเด่น"
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-mfu-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">ข้อเสนอแนะ</label>
                      <textarea
                        value={comments[item.key]?.improvements ?? ''}
                        onChange={(e) => onComment?.(item.key, 'improvements', e.target.value)}
                        disabled={readOnly}
                        placeholder="ข้อเสนอแนะ / ข้อพัฒนา"
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-mfu-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 lg:shrink-0">
        <label className="text-sm font-semibold text-slate-700">บันทึกทั่วไป</label>
        <textarea
          value={generalNotes}
          onChange={(e) => onNotes?.(e.target.value)}
          disabled={readOnly}
          placeholder="ข้อสังเกต ความเห็นเพิ่มเติม ฯลฯ"
          rows={4}
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-mfu-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>
    </>
  );
}
