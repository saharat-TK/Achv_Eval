'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  getFirebaseAuth,
  getFirebaseDb,
  getFirebaseFunctions,
} from '@/lib/firebase/config';
import { REPORT_STATUS_TH, SEMESTER_LABEL } from '@/lib/constants';
import { sendOfferingForAssessment } from '@/app/lecturer/[offeringId]/actions';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import { useToast } from '@/components/ToastProvider';
import type { AiReportStatus, OfferingStatus, Semester } from '@/lib/types/models';
import MarkdownView from './MarkdownView';

interface RubricItem {
  key: string;
  labelTh: string;
  score: number;
  strengths: string;
  improvements: string;
}
interface StructuredOutput {
  courseCodeDetected?: string;
  section1Grading?: string;
  section2Quality?: string;
  section3RevisedTqf3?: string;
  section4Verification?: {
    items: RubricItem[];
    totalScore: number;
    maxScore: number;
    percent: number;
    band: string;
  };
  overallSummary?: string;
  criticalIssues?: string[];
}
interface Report {
  id: string;
  version: number;
  academicYear?: number;
  semester?: Semester;
  status: AiReportStatus;
  errorMessage?: string | null;
  structuredOutput?: StructuredOutput | null;
  reportDownloadUrl?: string | null;
  createdAt?: { toDate: () => Date } | null;
  tqf3Status?: 'generating' | 'succeeded' | 'failed' | null;
  tqf3DownloadUrl?: string | null;
  tqf3ErrorMessage?: string | null;
}

interface OfferingHandoffState {
  status: OfferingStatus;
  latestAiReportId?: string | null;
}

const BAND_TH: Record<string, string> = {
  excellent: 'ดีเยี่ยม',
  good: 'ดี',
  improve: 'ควรปรับปรุง',
};

function formatCreatedAt(ts: Report['createdAt']): string | null {
  const date = ts?.toDate?.();
  if (!date) return null;
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Live list of AI reports for an offering. Subscribes to Firestore so the
 * status updates in place (running → succeeded) without a page reload.
 */
export default function AiReportsList({
  offeringId,
  scrollBody = false,
  combinedReportUrl = null,
  combinedReportPending = false,
  enableAssessmentHandoff = false,
}: {
  offeringId: string;
  scrollBody?: boolean;
  combinedReportUrl?: string | null;
  combinedReportPending?: boolean;
  enableAssessmentHandoff?: boolean;
}) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [offeringState, setOfferingState] = useState<OfferingHandoffState | null>(
    null,
  );

  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      await getFirebaseAuth().authStateReady();
      if (cancelled) return;
      const q = query(
        collection(getFirebaseDb(), 'offerings', offeringId, 'aiReports'),
        orderBy('version', 'desc'),
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          setReports(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, 'id'>) })),
          );
        },
        (err) => {
          console.error('aiReports listener error', err);
          setReports([]);
        },
      );
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [offeringId]);

  useEffect(() => {
    if (!enableAssessmentHandoff) return undefined;

    let unsub = () => {};
    let cancelled = false;
    (async () => {
      await getFirebaseAuth().authStateReady();
      if (cancelled) return;
      unsub = onSnapshot(
        doc(getFirebaseDb(), 'offerings', offeringId),
        (snap) => {
          if (!snap.exists()) {
            setOfferingState(null);
            return;
          }
          const data = snap.data() as OfferingHandoffState;
          setOfferingState({
            status: data.status,
            latestAiReportId: data.latestAiReportId ?? null,
          });
        },
        (err) => {
          console.error('offering handoff listener error', err);
          setOfferingState(null);
        },
      );
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, [enableAssessmentHandoff, offeringId]);

  if (reports === null) {
    return <p className="text-sm text-slate-400">กำลังโหลด…</p>;
  }
  if (reports.length === 0) {
    return <p className="text-sm text-slate-400">ยังไม่มีรายงาน</p>;
  }

  return (
    <div
      className={
        scrollBody
          ? 'mt-2 space-y-4 lg:mt-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1'
          : 'mt-2 space-y-4'
      }
    >
      {reports.map((r) => {
        const createdAt = formatCreatedAt(r.createdAt);
        const isLatestReport =
          enableAssessmentHandoff &&
          offeringState?.latestAiReportId === r.id &&
          r.status === 'succeeded';
        return (
          <div
            key={r.id}
            className={
              scrollBody
                ? 'rounded-xl border border-slate-200 bg-white'
                : 'rounded-xl border border-slate-200 bg-white p-4'
            }
          >
            <div
              className={
                scrollBody
                  ? 'flex items-center justify-between border-b border-slate-100 bg-white px-4 py-4 text-sm lg:sticky lg:top-0 lg:z-10'
                  : 'flex items-center justify-between text-sm'
              }
            >
              <div>
                <span className="font-medium text-slate-800">
                  รายงานเวอร์ชัน {r.version}
                </span>
                <p className="mt-0.5 text-xs text-slate-500">
                  {r.academicYear ? `ปีการศึกษา ${r.academicYear}` : 'ปีการศึกษา —'}
                  {' · '}
                  {r.semester ? SEMESTER_LABEL[r.semester] : 'ภาคการศึกษา —'}
                  {createdAt ? ` · สร้างเมื่อ ${createdAt}` : ''}
                </p>
              </div>
              <span
                className={
                  r.status === 'failed'
                    ? 'text-xs font-medium text-red-600'
                    : r.status === 'succeeded'
                      ? 'text-xs font-medium text-green-700'
                      : 'text-xs font-medium text-blue-600'
                }
              >
                {REPORT_STATUS_TH[r.status] ?? r.status}
              </span>
            </div>

            <div className={scrollBody ? 'px-4 pb-4 pt-3' : 'mt-2'}>
              {r.status === 'running' && (
                <p className="text-xs text-slate-500">
                  ระบบกำลังวิเคราะห์ทีละส่วน — หน้านี้จะอัปเดตอัตโนมัติเมื่อเสร็จ
                </p>
              )}

              {r.status === 'failed' && r.errorMessage && (
                <p className="text-xs text-red-600">{r.errorMessage}</p>
              )}

              {r.status === 'succeeded' && r.structuredOutput && (
                <ReportBody out={r.structuredOutput} />
              )}

              {isLatestReport && offeringState?.status === 'ai_complete' && (
                <SendForAssessmentButton
                  offeringId={offeringId}
                  onSent={() =>
                    setOfferingState((current) =>
                      current
                        ? { ...current, status: 'pending_assessment' }
                        : current,
                    )
                  }
                />
              )}

              {isLatestReport &&
                ['pending_assessment', 'assessor_review', 'assessed'].includes(
                  offeringState?.status ?? '',
                ) && (
                  <p className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                    ส่งผลการวิเคราะห์ให้ผู้ทวนสอบแล้ว
                  </p>
                )}

              {(r.reportDownloadUrl || combinedReportUrl || combinedReportPending) && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  {r.reportDownloadUrl && (
                    <a
                      href={r.reportDownloadUrl}
                      className="font-medium text-mfu-primary hover:underline"
                    >
                      ดาวน์โหลดรายงาน PDF
                    </a>
                  )}
                  {combinedReportUrl ? (
                    <a
                      href={combinedReportUrl}
                      className="font-medium text-mfu-primary hover:underline"
                    >
                      ดาวน์โหลดรายงานรวมผลทวนสอบ
                    </a>
                  ) : combinedReportPending ? (
                    <span className="text-xs text-slate-400">
                      รายงานรวมกำลังรอการสร้าง
                    </span>
                  ) : null}
                </div>
              )}

              {r.status === 'succeeded' && r.reportDownloadUrl && (
                <Tqf3DraftControl
                  offeringId={offeringId}
                  reportId={r.id}
                  tqf3Status={r.tqf3Status ?? null}
                  tqf3DownloadUrl={r.tqf3DownloadUrl ?? null}
                  tqf3ErrorMessage={r.tqf3ErrorMessage ?? null}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SendForAssessmentButton({
  offeringId,
  onSent,
}: {
  offeringId: string;
  onSent: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function send() {
    const ok = await confirm({
      title: 'ส่งผลการวิเคราะห์ให้ผู้ทวนสอบ',
      message:
        'รายวิชานี้จะเข้าสู่คิวทวนสอบของผู้ทวนสอบ และจะไม่สามารถวิเคราะห์ใหม่ได้จากหน้านี้หลังส่งแล้ว หากต้องการแก้ไขภายหลังต้องให้ผู้ดูแลระบบหรือขั้นตอนงานที่เกี่ยวข้องปรับสถานะกลับ',
      confirmLabel: 'ส่งผลเพื่อทวนสอบ',
      cancelLabel: 'ยกเลิก',
      variant: 'danger',
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await sendOfferingForAssessment(offeringId);
      if (!res.ok) {
        toast({
          title: 'ส่งผลเพื่อทวนสอบไม่สำเร็จ',
          description: res.error,
          variant: 'error',
        });
        return;
      }
      onSent();
      toast({
        title: 'ส่งผลให้ผู้ทวนสอบแล้ว',
        description: 'รายวิชานี้ปรากฏในหน้าผู้ทวนสอบเรียบร้อยแล้ว',
        variant: 'success',
      });
      router.refresh();
    } catch {
      toast({
        title: 'ส่งผลเพื่อทวนสอบไม่สำเร็จ',
        description: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
      <p className="text-sm font-medium text-violet-800">
        รายงาน AI พร้อมส่งให้ผู้ทวนสอบ
      </p>
      <p className="mt-1 text-xs text-violet-700">
        โปรดตรวจสอบผลวิเคราะห์ก่อนส่ง รายวิชาจะเข้าสู่คิวทวนสอบหลังยืนยัน
      </p>
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="mt-3 rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:bg-slate-300 disabled:text-slate-600 disabled:opacity-100"
      >
        {busy ? 'กำลังส่ง…' : 'ส่งผลเพื่อทวนสอบ'}
      </button>
    </div>
  );
}

/**
 * Bottom-right control to generate / download the on-demand revised มคอ.3 draft.
 * One successful draft per report; status updates live via the Firestore
 * subscription in the parent, so this only needs to fire the callable.
 */
function Tqf3DraftControl({
  offeringId,
  reportId,
  tqf3Status,
  tqf3DownloadUrl,
  tqf3ErrorMessage,
}: {
  offeringId: string;
  reportId: string;
  tqf3Status: 'generating' | 'succeeded' | 'failed' | null;
  tqf3DownloadUrl: string | null;
  tqf3ErrorMessage: string | null;
}) {
  const toast = useToast();
  const [starting, setStarting] = useState(false);

  // 'starting' bridges the gap between the click and the first snapshot that
  // shows tqf3Status === 'generating'.
  const generating = starting || tqf3Status === 'generating';

  async function generate() {
    setStarting(true);
    try {
      const callable = httpsCallable<
        { offeringId: string; reportId: string },
        { ok: boolean; downloadUrl: string }
      >(getFirebaseFunctions(), 'generateTqf3Draft');
      await callable({ offeringId, reportId });
      toast({
        title: 'เริ่มสร้างร่าง มคอ.3 แล้ว',
        description: 'ระบบกำลังจัดทำร่าง — ปุ่มจะอัปเดตอัตโนมัติเมื่อเสร็จ',
        variant: 'success',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
      toast({ title: 'สร้างร่าง มคอ.3 ไม่สำเร็จ', description: message, variant: 'error' });
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col items-end gap-1">
      {tqf3Status === 'succeeded' && tqf3DownloadUrl ? (
        <a
          href={tqf3DownloadUrl}
          className="rounded-lg border border-mfu-primary px-3 py-2 text-sm font-medium text-mfu-primary hover:bg-slate-50"
        >
          ดาวน์โหลดร่าง มคอ.3 (PDF)
        </a>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="rounded-lg bg-mfu-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:bg-slate-300 disabled:text-slate-600 disabled:opacity-100"
        >
          {generating
            ? 'กำลังสร้างร่าง มคอ.3…'
            : tqf3Status === 'failed'
              ? 'ลองสร้างร่าง มคอ.3 อีกครั้ง'
              : 'ร่าง มคอ.3 ฉบับใหม่'}
        </button>
      )}
      {tqf3Status === 'failed' && tqf3ErrorMessage && !generating && (
        <p className="text-xs text-red-600">{tqf3ErrorMessage}</p>
      )}
    </div>
  );
}

function ReportBody({ out }: { out: StructuredOutput }) {
  const v = out.section4Verification;
  return (
    <div className="mt-3 space-y-3">
      {out.overallSummary && (
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-700">บทสรุป</div>
          <div className="mt-1">
            <MarkdownView>{out.overallSummary}</MarkdownView>
          </div>
        </div>
      )}

      {out.criticalIssues && out.criticalIssues.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="text-xs font-semibold text-red-700">
            ประเด็นสำคัญที่ต้องแก้ไข
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
            {out.criticalIssues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <Section title="ส่วนที่ 1 — การประเมินผลและการตัดเกรด" body={out.section1Grading} />
      <Section title="ส่วนที่ 2 — การประเมินคุณภาพรายวิชา" body={out.section2Quality} />
      <Section title="ส่วนที่ 3 — ร่าง มคอ.3 ฉบับปรับปรุง" body={out.section3RevisedTqf3} />

      {v && v.items.length > 0 && (
        <details className="rounded-lg border border-slate-200">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
            ส่วนที่ 4 — ผลการทวนสอบ 7 หัวข้อ ({v.totalScore}/{v.maxScore} ·{' '}
            {v.percent}% · {BAND_TH[v.band] ?? v.band})
          </summary>
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1 pr-2">หัวข้อ</th>
                  <th className="py-1 pr-2">คะแนน</th>
                  <th className="py-1 pr-2">ข้อดี</th>
                  <th className="py-1">ข้อพัฒนา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {v.items.map((it) => (
                  <tr key={it.key}>
                    <td className="py-1 pr-2 text-slate-700">{it.labelTh}</td>
                    <td className="py-1 pr-2 font-medium">{it.score}</td>
                    <td className="py-1 pr-2 text-slate-600">{it.strengths}</td>
                    <td className="py-1 text-slate-600">{it.improvements}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <details className="rounded-lg border border-slate-200">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
        {title}
      </summary>
      <div className="px-3 pb-3">
        <MarkdownView>{body}</MarkdownView>
      </div>
    </details>
  );
}
