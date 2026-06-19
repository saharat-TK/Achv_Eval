'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  OfferingStatus,
  SignOffKind,
} from '@/lib/types/models';
import { computeRubricResult } from '@/lib/types/models';
import type { UserCommitteeRole } from '@/lib/data/assessmentCommittee';
import { reverseAssessedSignOff } from '@/app/assessor/[offeringId]/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';

/** Mirror of the server's AssessorAction (app/api/assessor/submit/route.ts). */
type AssessorAction = 'draft' | 'submit' | 'sign' | 'return';

// ── Rubric item definitions ─────────────────────────────────────────
type ScoreKey = keyof AssessmentDoc['scores'];

interface RubricDef {
  key: ScoreKey;
  number: string;
  labelTh: string;
  /** Official "รายละเอียดการทวนสอบ" — the criterion the score is judged against. */
  detailTh: string;
  allowNa: boolean;
}

// Topic labels and details from the official school verification form
// (manuals/Evaluation template-ทวนสอบผลลัพธ์การเรียนรู้รายวิชา.pdf).
const RUBRIC_ITEMS: RubricDef[] = [
  {
    key: 'item1Clo',
    number: '1',
    labelTh: 'ผลลัพธ์การเรียนรู้รายวิชา',
    detailTh:
      'ผลลัพธ์การเรียนรู้ของรายวิชาถูกต้องตามระดับการเรียนรู้ (ACTION VERB) มีความครบถ้วนตามที่ได้รับการกระจายผลลัพธ์การเรียนรู้จากหลักสูตร และมีความสอดคล้องกับผลลัพธ์การเรียนรู้ของหลักสูตร',
    allowNa: false,
  },
  {
    key: 'item21Content',
    number: '2.1',
    labelTh: 'เนื้อหาการเรียนการสอน',
    detailTh:
      'หัวข้อการสอน (15 หัวข้อ) มีความสอดคล้องกับผลลัพธ์การเรียนรู้รายวิชา',
    allowNa: false,
  },
  {
    key: 'item22Methods',
    number: '2.2',
    labelTh: 'วิธีการเรียนการสอน',
    detailTh:
      'วิธีการสอนมีความสอดคล้องกับผลลัพธ์การเรียนรู้ที่ระบุไว้ใน มคอ. 3/4 และมีวิธีการสอนที่หลากหลาย',
    allowNa: false,
  },
  {
    key: 'item31AssessmentMethods',
    number: '3.1',
    labelTh: 'วิธีการวัดและประเมินผล',
    detailTh:
      'มีวิธีการวัดและประเมินผลที่ตรงและครอบคลุมผลลัพธ์การเรียนรู้',
    allowNa: false,
  },
  {
    key: 'item32AssessmentForms',
    number: '3.2',
    labelTh: 'รูปแบบการประเมินผล',
    detailTh:
      'ทวนสอบจาก มคอ. 3/4 มีรูปแบบการประเมินครอบคลุมรูปการประเมินทั้ง 3 รูปแบบ ได้แก่ Assessment as learning (AAL), Assessment for learning (AFL), Assessment of learning (AOL)',
    allowNa: false,
  },
  {
    key: 'item33Proportions',
    number: '3.3',
    labelTh: 'สัดส่วนในแต่ละวิธีการวัดและประเมินผล',
    detailTh:
      'สัดส่วนในแต่ละวิธีการวัดและประเมินผลสอดคล้องกับ Domain of Learning ที่ระบุใน มคอ. 3/4 และตรงกับประกาศเกณฑ์การวัดและประเมินผลของสำนักวิชาฯ',
    allowNa: false,
  },
  {
    key: 'item34ExamQuality',
    number: '3.4',
    labelTh: 'คุณภาพข้อสอบ',
    detailTh:
      'มีผลการวิเคราะห์คุณภาพข้อสอบอยู่ในระดับที่ดี และมีการปรับปรุงข้อสอบจากผลการวิเคราะห์ข้อสอบครั้งที่ผ่านมา',
    allowNa: true,
  },
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
  offeringStatus,
  committeeRole,
  isAdmin,
  isSuperAdmin,
  requireFollowUp = false,
  followUpRecorded = false,
  onGoToFollowUp,
  seedScores,
  seedComments,
  seedNotes,
  scrollBody = false,
}: {
  offeringId: string;
  hasExamAssessment: boolean;
  offeringStatus: OfferingStatus;
  committeeRole: UserCommitteeRole;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  requireFollowUp?: boolean;
  followUpRecorded?: boolean;
  onGoToFollowUp?: () => void;
  /** Lecturer self-assessment used to pre-fill a fresh assessor form (only
   *  when no assessor assessment exists yet). */
  seedScores?: AssessmentDoc['scores'];
  seedComments?: Partial<Record<ScoreKey, RubricItemComment>>;
  seedNotes?: string;
  scrollBody?: boolean;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  // Live local copy of the offering status so the action buttons re-gate after
  // a draft/submit/return without a full page reload. Kept in sync with the
  // server-rendered prop after router.refresh().
  const [status, setStatus] = useState<OfferingStatus>(offeringStatus);
  const [signOffKind, setSignOffKind] = useState<SignOffKind>('self_only');
  useEffect(() => setStatus(offeringStatus), [offeringStatus]);
  const [scores, setScores] = useState<AssessmentDoc['scores']>(
    seedScores ?? {
      ...DEFAULT_SCORES,
      item34ExamQuality: hasExamAssessment ? 1 : 'na',
    },
  );
  const [comments, setComments] = useState<
    Partial<Record<ScoreKey, RubricItemComment>>
  >(seedComments ?? {});
  const [generalNotes, setGeneralNotes] = useState(seedNotes ?? '');
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [reversing, setReversing] = useState(false);

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
            setSignOffKind(data.signOffKind ?? 'committee');
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

  // ── Two-step sign-off gating ───────────────────────────────────────
  // `free` = the original single-assessor flow (this caller can both draft and
  // sign): when there is no standing committee, or for an admin who holds no
  // committee position (an override so admins are never locked out). An admin
  // who IS the head/secretary still acts in that committee role. Mirrors the
  // server.
  const onCommittee =
    committeeRole.isHead || committeeRole.isSecretary || committeeRole.isInternal;
  const free = !committeeRole.hasCommittee || (isAdmin && !onCommittee);
  const isSecretaryActor =
    committeeRole.isSecretary || (committeeRole.isHead && !committeeRole.hasSecretary);
  const preSubmit = status === 'pending_assessment' || status === 'assessor_review';
  const atHeadStage = status === 'pending_head_signoff';
  const docsStage = status === 'documents_pending';
  const atFinalStage =
    status === 'assessed' ||
    status === 'assessed_self_only' ||
    status === 'closed_documents_only';
  const effectiveSignOffKind: SignOffKind = docsStage
    ? 'documents_only'
    : signOffKind;
  const committeeMode = effectiveSignOffKind === 'committee';
  const showSignOffSummary = atHeadStage;
  const showRubric = committeeMode;
  const showSelfOnlyNotice = effectiveSignOffKind === 'self_only';
  const showDocumentsOnlyNotice = effectiveSignOffKind === 'documents_only';

  let showDraft = false;
  let showSubmit = false;
  let showSign = false;
  let showReturn = false;
  let waitingNote: string | null = null;
  if (!isLocked) {
    if (free) {
      if (preSubmit) {
        showDraft = committeeMode;
        showSign = true;
      } else if (docsStage) {
        showSign = true;
      } else if (atHeadStage) {
        showSign = true;
      }
    } else if (committeeRole.isHead && atHeadStage) {
      showSign = true;
      showReturn = true;
    } else if (isSecretaryActor && (preSubmit || docsStage)) {
      // Single action for the secretary: save + send to the head in one step.
      showSubmit = true;
    } else if (committeeRole.isHead && preSubmit) {
      waitingNote = 'รอเลขานุการส่งผลการทวนสอบให้ประธานลงนาม';
    } else if (committeeRole.isHead && docsStage) {
      waitingNote = 'รอเลขานุการส่งเอกสารให้ประธานลงนาม';
    } else if (isSecretaryActor && atHeadStage) {
      waitingNote = 'ส่งให้ประธานผู้ทวนสอบแล้ว — รอการลงนาม';
    } else {
      waitingNote = 'เฉพาะเลขานุการและประธานผู้ทวนสอบเท่านั้นที่ดำเนินการได้';
    }
  }
  const readOnly = isLocked || !(showDraft || showSubmit || showSign || showReturn);
  const showSignOffChoice = preSubmit && !docsStage && !atFinalStage && !readOnly;
  const canReverseSignOff = isSuperAdmin && status === 'assessed';

  // Score change handler
  const setScore = useCallback(
    (key: ScoreKey, value: RubricScore) => {
      if (readOnly) return;
      setScores((prev) => ({ ...prev, [key]: value }));
    },
    [readOnly],
  );

  // Comment change handler
  const setComment = useCallback(
    (key: ScoreKey, field: 'strengths' | 'improvements', value: string) => {
      if (readOnly) return;
      setComments((prev) => ({
        ...prev,
        [key]: { ...prev[key], [field]: value },
      }));
    },
    [readOnly],
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

  // Self-heal: when an assessment is locked but has no signed report — e.g.
  // after a status reversal voided the old PDF and the assessor re-signed, or
  // the post-sign-off generation call never completed — regenerate it. Tied to
  // the (assessmentId, locked) cycle via a ref so it fires once per sign-off
  // and not while a generation is already running.
  const autoRegenKey = useRef<string | null>(null);
  useEffect(() => {
    if (!isLocked || !assessmentId || signedPdfUrl || generatingPdf) return;
    const key = `${assessmentId}:locked`;
    if (autoRegenKey.current === key) return;
    autoRegenKey.current = key;
    void generateCombinedPdf(assessmentId);
  }, [isLocked, assessmentId, signedPdfUrl, generatingPdf, generateCombinedPdf]);

  // Once a report URL exists, clear the guard so a later void/re-sign cycle on
  // the same assessment can trigger regeneration again.
  useEffect(() => {
    if (signedPdfUrl) autoRegenKey.current = null;
  }, [signedPdfUrl]);

  // Action handler — posts the chosen step to the shared endpoint.
  const runAction = useCallback(
    async (action: AssessorAction) => {
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
            action,
            signOffKind: effectiveSignOffKind,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (json.error === 'followup_required') {
            throw new Error(
              'ต้องประเมินและบันทึกผล “ติดตามผลการปรับปรุง” ก่อนส่งผลการทวนสอบ',
            );
          }
          if (json.error === 'self_assessment_required') {
            throw new Error(
              'ต้องมีผลประเมินตนเองที่ส่งแล้วก่อนปิดรายการแบบประเมินตนเองเท่านั้น',
            );
          }
          throw new Error(json.error || 'submission_failed');
        }
        if (json.assessmentId) setAssessmentId(json.assessmentId);
        const OK_TEXT: Record<AssessorAction, string> = {
          draft: 'บันทึกร่างเรียบร้อย',
          submit: 'ส่งให้ประธานผู้ทวนสอบแล้ว',
          sign: 'ลงนามทวนสอบแล้ว — ไม่สามารถแก้ไขได้อีก',
          return: 'ส่งกลับให้เลขานุการแก้ไขแล้ว',
        };
        setMessage({ type: 'ok', text: OK_TEXT[action] });
        // Reflect the new status locally so the buttons re-gate without a reload.
        if (action === 'sign') {
          setIsLocked(true);
          setStatus(
            effectiveSignOffKind === 'self_only'
              ? 'assessed_self_only'
              : effectiveSignOffKind === 'documents_only'
                ? 'closed_documents_only'
                : 'assessed',
          );
          await generateCombinedPdf(json.assessmentId ?? assessmentId);
        } else if (action === 'submit') {
          if (effectiveSignOffKind === 'documents_only') {
            setSignOffKind('documents_only');
          }
          setStatus('pending_head_signoff');
        } else if (action === 'return') {
          setStatus(
            effectiveSignOffKind === 'documents_only'
              ? 'documents_pending'
              : 'assessor_review',
          );
        } else if (status === 'pending_assessment') {
          setStatus('assessor_review');
        }
        // Re-fetch the server component so the page's status badge reflects the
        // new offering status (the local state above only re-gates the buttons).
        router.refresh();
      } catch (e: any) {
        setMessage({ type: 'err', text: e.message || 'เกิดข้อผิดพลาด' });
      } finally {
        setSaving(false);
      }
    },
    [
      offeringId,
      assessmentId,
      scores,
      comments,
      generalNotes,
      status,
      effectiveSignOffKind,
      generateCombinedPdf,
      router,
    ],
  );

  // Shared follow-up gate for the steps that advance toward sign-off
  // (secretary `submit`, or `sign` in the single-assessor flow). Returns true
  // when it's OK to proceed; otherwise routes the user to the follow-up tab.
  const ensureFollowUp = useCallback(async (): Promise<boolean> => {
    if (!requireFollowUp || followUpRecorded) return true;
    const go = await confirm({
      title: 'ต้องประเมินติดตามผลการปรับปรุงก่อน',
      message:
        'รายวิชานี้มีผลการทวนสอบภาคก่อนหน้าที่ต้องติดตาม กรุณาประเมินและบันทึกผลในแท็บ “ติดตามผลการปรับปรุง” ก่อน',
      confirmLabel: 'ไปที่แท็บติดตามผล',
      cancelLabel: 'ปิด',
    });
    if (go) onGoToFollowUp?.();
    return false;
  }, [requireFollowUp, followUpRecorded, confirm, onGoToFollowUp]);

  // Super-admin only: void the sign-off and re-open the offering for assessment.
  const handleReverse = useCallback(async () => {
    const ok = await confirm({
      title: 'ย้อนสถานะกลับเป็นรอทวนสอบ',
      message:
        'การลงนามจะถูกยกเลิก รายงานฉบับลงนามจะถูกลบ และรายวิชาจะกลับสู่สถานะรอทวนสอบเพื่อทวนสอบใหม่',
      confirmLabel: 'ย้อนสถานะ',
      variant: 'danger',
      confirmationText: 'ยืนยัน',
    });
    if (!ok) return;
    setReversing(true);
    setMessage(null);
    try {
      const res = await reverseAssessedSignOff(offeringId);
      if ('error' in res) {
        setMessage({ type: 'err', text: 'ย้อนสถานะไม่สำเร็จ — กรุณาลองใหม่' });
        return;
      }
      setIsLocked(false);
      setStatus('pending_assessment');
      setSignedPdfUrl(null);
      setMessage({ type: 'ok', text: 'ย้อนสถานะกลับเป็นรอทวนสอบแล้ว' });
      router.refresh();
    } catch {
      setMessage({ type: 'err', text: 'ย้อนสถานะไม่สำเร็จ — กรุณาลองใหม่' });
    } finally {
      setReversing(false);
    }
  }, [offeringId, confirm, router]);

  const signOffDescription =
    effectiveSignOffKind === 'committee'
      ? 'ระบบจะบันทึกผลการทวนสอบโดยคณะกรรมการและนับในคะแนนเฉลี่ยของรายงาน'
      : effectiveSignOffKind === 'self_only'
        ? 'ระบบจะปิดรายการจากผลประเมินตนเองเท่านั้นและไม่นับในคะแนนเฉลี่ย'
        : 'ระบบจะปิดรายการเอกสารเท่านั้นและไม่ส่งต่อให้คณะกรรมการรับรองผล';
  const signedReportTitle =
    effectiveSignOffKind === 'committee'
      ? 'รายงานฉบับลงนาม (รวมผลวิเคราะห์ AI + ผลการทวนสอบ)'
      : effectiveSignOffKind === 'self_only'
        ? 'รายงานฉบับลงนาม (ผลประเมินตนเองเท่านั้น)'
        : 'รายงานฉบับลงนาม (เอกสารเท่านั้น)';

  if (!loaded) {
    return <p className="text-sm text-slate-400">กำลังโหลดแบบประเมิน…</p>;
  }

  return (
    <div
      className={
        scrollBody
          ? 'space-y-6 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-0 lg:space-y-0'
          : 'space-y-6'
      }
    >
      {showSignOffChoice && (
        <fieldset className="rounded-xl border border-slate-200 bg-white p-4 lg:shrink-0">
          <legend className="text-sm font-semibold text-slate-700">
            รูปแบบการลงนาม
          </legend>
          <div className="mt-3 space-y-2">
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              <input
                type="radio"
                name="signOffKind"
                value="self_only"
                checked={signOffKind === 'self_only'}
                onChange={() => setSignOffKind('self_only')}
                disabled={readOnly}
                className="mt-1"
              />
              <span>
                <span className="font-medium">ประเมินตนเองเท่านั้น</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  ยังไม่ได้รับการทวนสอบจากคณะกรรมการ และจะไม่ถูกนับในคะแนนเฉลี่ย
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              <input
                type="radio"
                name="signOffKind"
                value="committee"
                checked={signOffKind === 'committee'}
                onChange={() => setSignOffKind('committee')}
                disabled={readOnly}
                className="mt-1"
              />
              <span>
                <span className="font-medium">ได้รับการทวนสอบจากคณะกรรมการ</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  ใช้แบบประเมิน 7 รายการ และนับในคะแนนเฉลี่ยของรายงาน
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      )}

      {showSignOffSummary && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 lg:shrink-0">
          <div className="font-semibold">รูปแบบการลงนาม</div>
          <div className="mt-1 text-slate-600">{signOffDescription}</div>
        </div>
      )}

      {/* Scoring summary card */}
      {showRubric && (
        <div
          className={`rounded-xl border p-4 lg:shrink-0 ${bandInfo.color}`}
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
      )}

      {/* Combined signed report */}
      {isLocked && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:shrink-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {signedReportTitle}
            </h3>
            {canReverseSignOff && (
              <button
                type="button"
                onClick={handleReverse}
                disabled={reversing}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {reversing ? 'กำลังย้อน…' : 'ย้อนเป็นรอทวนสอบ'}
              </button>
            )}
          </div>
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
      {showRubric && (
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
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        {item.detailTh}
                      </p>
                    </div>

                    {/* Score radio group */}
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
                            onClick={() => setScore(item.key, v as RubricScore)}
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
                          onChange={(e) =>
                            setComment(item.key, 'improvements', e.target.value)
                          }
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
      )}

      {showSelfOnlyNotice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 lg:shrink-0">
          รายการนี้จะปิดโดยอ้างอิงผลการประเมินตนเองของอาจารย์ผู้รับผิดชอบเท่านั้น
          และจะไม่รวมในคะแนนเฉลี่ยหรือสรุปหัวข้อการทวนสอบของคณะกรรมการ
        </div>
      )}
      {showDocumentsOnlyNotice && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 lg:shrink-0">
          รายการนี้อยู่ในสถานะรอเอกสาร ระบบจะสร้างรายงานหน้าปกเท่านั้น
          และจะไม่เข้าสู่คิวรับรองผล
        </div>
      )}

      {/* General notes */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 lg:shrink-0">
        <label className="text-sm font-semibold text-slate-700">
          บันทึกทั่วไป
        </label>
        <textarea
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
          disabled={readOnly}
          placeholder="ข้อสังเกต ความเห็นเพิ่มเติม ฯลฯ"
          rows={4}
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-mfu-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      {/* Actions */}
      {(showDraft || showSubmit || showSign || showReturn) && (
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
          {showDraft && (
            <button
              onClick={() => runAction('draft')}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึกร่าง'}
            </button>
          )}
          {showReturn && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: 'ส่งกลับให้เลขานุการแก้ไข',
                  message:
                    'ผลการทวนสอบจะถูกส่งกลับให้เลขานุการแก้ไข และกลับสู่สถานะรอผู้ทวนสอบ',
                  confirmLabel: 'ส่งกลับแก้ไข',
                  cancelLabel: 'ยกเลิก',
                });
                if (ok) runAction('return');
              }}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
            >
              ส่งกลับแก้ไข
            </button>
          )}
          {showSubmit && (
            <button
              onClick={async () => {
                if (committeeMode && !(await ensureFollowUp())) return;
                const ok = await confirm({
                  title: 'ส่งให้ประธานผู้ทวนสอบลงนาม',
                  message: `${signOffDescription} หลังจากส่งแล้วจะแก้ไขไม่ได้จนกว่าประธานจะส่งกลับให้แก้ไข`,
                  confirmLabel: 'บันทึกและส่งให้ประธาน',
                  cancelLabel: 'ยกเลิก',
                });
                if (ok) runAction('submit');
              }}
              disabled={saving}
              className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:bg-mfu-primary/90 disabled:opacity-50 transition"
            >
              {saving ? 'กำลังส่ง…' : 'ส่งให้ประธานลงนาม'}
            </button>
          )}
          {showSign && (
            <button
              onClick={async () => {
                if (committeeMode && !(await ensureFollowUp())) return;
                const ok = await confirm({
                  title: 'ยืนยันการลงนามทวนสอบ',
                  message: `${signOffDescription} เมื่อลงนามแล้วจะไม่สามารถแก้ไขได้อีก`,
                  confirmLabel: 'ลงนามทวนสอบ',
                  variant: 'danger',
                  acknowledgementLabel:
                    'ข้าพเจ้ายอมรับว่าเมื่อลงนามแล้วจะไม่สามารถแก้ไขผลทวนสอบนี้ได้อีก',
                  confirmationText: 'ยืนยัน',
                });
                if (ok) runAction('sign');
              }}
              disabled={saving}
              className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:bg-mfu-primary/90 disabled:opacity-50 transition"
            >
              {saving ? 'กำลังลงนาม…' : 'ลงนามทวนสอบ'}
            </button>
          )}
        </div>
      )}

      {/* Read-only waiting note (not this user's turn) */}
      {waitingNote && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 lg:shrink-0">
          {waitingNote}
        </p>
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
