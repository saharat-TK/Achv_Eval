'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  getFirebaseAuth,
  getFirebaseDb,
  getFirebaseFunctions,
} from '@/lib/firebase/config';
import type {
  AssessmentDoc,
  RubricScore,
  RubricItemComment,
} from '@/lib/types/models';
import { computeRubricResult } from '@/lib/types/models';

// ── Rubric item definitions ─────────────────────────────────────────
type ScoreKey = keyof AssessmentDoc['scores'];

interface RubricDef {
  key: ScoreKey;
  number: string;
  labelTh: string;
  allowNa: boolean;
}

const RUBRIC_ITEMS: RubricDef[] = [
  { key: 'item1Clo', number: '1', labelTh: 'ผลการเรียนรู้ที่คาดหวัง (CLO)', allowNa: false },
  { key: 'item21Content', number: '2.1', labelTh: 'เนื้อหาสาระของรายวิชา', allowNa: false },
  { key: 'item22Methods', number: '2.2', labelTh: 'วิธีการสอน', allowNa: false },
  { key: 'item31AssessmentMethods', number: '3.1', labelTh: 'วิธีการวัดและประเมินผล', allowNa: false },
  { key: 'item32AssessmentForms', number: '3.2', labelTh: 'รูปแบบเครื่องมือวัดผล', allowNa: false },
  { key: 'item33Proportions', number: '3.3', labelTh: 'สัดส่วนการวัดผล', allowNa: false },
  { key: 'item34ExamQuality', number: '3.4', labelTh: 'คุณภาพข้อสอบ', allowNa: true },
];

const BAND_LABEL: Record<string, { th: string; color: string }> = {
  excellent: { th: 'ดีเยี่ยม', color: 'text-green-700 bg-green-50 border-green-200' },
  good: { th: 'ดี', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  improve: { th: 'ควรปรับปรุง', color: 'text-amber-700 bg-amber-50 border-amber-200' },
};

const DEFAULT_SCORES: AssessmentDoc['scores'] = {
  item1Clo: 1,
  item21Content: 1,
  item22Methods: 1,
  item31AssessmentMethods: 1,
  item32AssessmentForms: 1,
  item33Proportions: 1,
  item34ExamQuality: 1,
};

// ── Component ───────────────────────────────────────────────────────
export default function AssessmentForm({
  offeringId,
  hasExamAssessment,
}: {
  offeringId: string;
  hasExamAssessment: boolean;
}) {
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [scores, setScores] = useState<AssessmentDoc['scores']>({
    ...DEFAULT_SCORES,
    item34ExamQuality: hasExamAssessment ? 1 : 'na',
  });
  const [comments, setComments] = useState<
    Partial<Record<ScoreKey, RubricItemComment>>
  >({});
  const [generalNotes, setGeneralNotes] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Subscribe to existing assessment
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;

    (async () => {
      await getFirebaseAuth().authStateReady();
      if (cancelled) return;

      const q = query(
        collection(getFirebaseDb(), 'offerings', offeringId, 'assessments'),
        orderBy('createdAt', 'desc'),
        limit(1),
      );

      unsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            const d = snap.docs[0];
            const data = d.data() as AssessmentDoc;
            setAssessmentId(d.id);
            setScores(data.scores);
            setComments(data.comments ?? {});
            setGeneralNotes(data.generalNotes ?? '');
            setIsLocked(data.isLocked);
            setSignedPdfUrl(data.signedPdfUrl ?? null);
          }
          setLoaded(true);
        },
        (err) => {
          console.error('assessment listener error', err);
          setLoaded(true);
        },
      );
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, [offeringId]);

  // Computed result
  const result = useMemo(() => computeRubricResult(scores), [scores]);
  const bandInfo = BAND_LABEL[result.band] ?? BAND_LABEL.improve;

  // Score change handler
  const setScore = useCallback(
    (key: ScoreKey, value: RubricScore) => {
      if (isLocked) return;
      setScores((prev) => ({ ...prev, [key]: value }));
    },
    [isLocked],
  );

  // Comment change handler
  const setComment = useCallback(
    (key: ScoreKey, field: 'strengths' | 'improvements', value: string) => {
      if (isLocked) return;
      setComments((prev) => ({
        ...prev,
        [key]: { ...prev[key], [field]: value },
      }));
    },
    [isLocked],
  );

  // Generates the combined report PDF (AI analysis + assessor form) for a
  // signed assessment. The signedPdfUrl arrives via the onSnapshot listener.
  const generateCombinedPdf = useCallback(
    async (aId: string | null) => {
      if (!aId) return;
      setGeneratingPdf(true);
      try {
        await getFirebaseAuth().authStateReady();
        const callable = httpsCallable(
          getFirebaseFunctions(),
          'generateCombinedReport',
          { timeout: 240_000 },
        );
        await callable({ offeringId, assessmentId: aId });
      } catch {
        setMessage({
          type: 'err',
          text: 'สร้างรายงานฉบับลงนามไม่สำเร็จ — สามารถกดสร้างใหม่ได้ภายหลัง',
        });
      } finally {
        setGeneratingPdf(false);
      }
    },
    [offeringId],
  );

  // Submit handler
  const handleSubmit = useCallback(
    async (lock: boolean) => {
      setSaving(true);
      setMessage(null);
      try {
        const res = await fetch('/api/assessor/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offeringId,
            assessmentId,
            scores,
            comments,
            generalNotes,
            lock,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'submission_failed');
        }
        if (json.assessmentId) setAssessmentId(json.assessmentId);
        setMessage({
          type: 'ok',
          text: lock ? 'ลงนามทวนสอบแล้ว — ไม่สามารถแก้ไขได้อีก' : 'บันทึกร่างเรียบร้อย',
        });
        if (lock) {
          setIsLocked(true);
          await generateCombinedPdf(json.assessmentId ?? assessmentId);
        }
      } catch (e: any) {
        setMessage({ type: 'err', text: e.message || 'เกิดข้อผิดพลาด' });
      } finally {
        setSaving(false);
      }
    },
    [offeringId, assessmentId, scores, comments, generalNotes, generateCombinedPdf],
  );

  if (!loaded) {
    return <p className="text-sm text-slate-400">กำลังโหลดแบบประเมิน…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Scoring summary card */}
      <div
        className={`rounded-xl border p-4 ${bandInfo.color}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">
              ผลการทวนสอบ: {result.totalScore}/{result.maxScore} ({result.percentScore}%)
            </div>
            <div className="text-xs mt-0.5">ระดับ: {bandInfo.th}</div>
          </div>
          {isLocked && (
            <span className="text-xs px-2 py-1 rounded-full bg-white/60 font-medium">
              🔒 ลงนามแล้ว
            </span>
          )}
        </div>
      </div>

      {/* Combined signed report */}
      {isLocked && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">
            รายงานฉบับลงนาม (รวมผลวิเคราะห์ AI + ผลการทวนสอบ)
          </h3>
          {signedPdfUrl ? (
            <a
              href={signedPdfUrl}
              className="mt-2 inline-block text-sm text-mfu-primary hover:underline"
            >
              ดาวน์โหลดรายงานฉบับลงนาม (PDF)
            </a>
          ) : generatingPdf ? (
            <p className="mt-2 text-xs text-slate-500">
              กำลังสร้างรายงานฉบับลงนาม… อาจใช้เวลาสักครู่
            </p>
          ) : (
            <button
              onClick={() => generateCombinedPdf(assessmentId)}
              className="mt-2 text-xs text-mfu-primary underline hover:text-mfu-primary/80"
            >
              สร้างรายงานฉบับลงนาม
            </button>
          )}
        </div>
      )}

      {/* Rubric table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">
            หัวข้อการทวนสอบ (7 รายการ)
          </h3>
        </div>

        <div className="divide-y divide-slate-100">
          {RUBRIC_ITEMS.map((item) => {
            const isNaAllowed = item.allowNa && !hasExamAssessment;
            const currentScore = scores[item.key];

            return (
              <div key={item.key} className="px-4 py-4">
                {/* Item header + score */}
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
                  </div>

                  {/* Score radio group */}
                  <div className="flex gap-2 shrink-0">
                    {isNaAllowed ? (
                      <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-500">
                        N/A
                      </span>
                    ) : (
                      [1, 2, 3].map((v) => (
                        <label
                          key={v}
                          className={`cursor-pointer text-sm px-3 py-1 rounded-lg border transition-colors ${
                            currentScore === v
                              ? 'bg-mfu-primary text-white border-mfu-primary'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          } ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="radio"
                            name={item.key}
                            value={v}
                            checked={currentScore === v}
                            onChange={() => setScore(item.key, v as RubricScore)}
                            disabled={isLocked}
                            className="sr-only"
                          />
                          {v}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Comment fields */}
                {!isNaAllowed && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500">ข้อดี</label>
                      <textarea
                        value={comments[item.key]?.strengths ?? ''}
                        onChange={(e) =>
                          setComment(item.key, 'strengths', e.target.value)
                        }
                        disabled={isLocked}
                        placeholder="ข้อดี / จุดเด่น"
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-mfu-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">ข้อเสนอแนะ</label>
                      <textarea
                        value={comments[item.key]?.improvements ?? ''}
                        onChange={(e) =>
                          setComment(item.key, 'improvements', e.target.value)
                        }
                        disabled={isLocked}
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

      {/* General notes */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-semibold text-slate-700">
          บันทึกทั่วไป
        </label>
        <textarea
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
          disabled={isLocked}
          placeholder="ข้อสังเกต ความเห็นเพิ่มเติม ฯลฯ"
          rows={4}
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-mfu-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      {/* Actions */}
      {!isLocked && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกร่าง'}
          </button>
          <button
            onClick={() => {
              if (
                window.confirm(
                  'เมื่อลงนามแล้วจะไม่สามารถแก้ไขได้อีก ต้องการลงนามหรือไม่?',
                )
              ) {
                handleSubmit(true);
              }
            }}
            disabled={saving}
            className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:bg-mfu-primary/90 disabled:opacity-50 transition"
          >
            {saving ? 'กำลังลงนาม…' : 'ลงนามทวนสอบ'}
          </button>
        </div>
      )}

      {/* Feedback message */}
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
