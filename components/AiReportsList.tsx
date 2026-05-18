'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase/config';
import { REPORT_STATUS_TH } from '@/lib/constants';
import type { AiReportStatus } from '@/lib/types/models';
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
  status: AiReportStatus;
  errorMessage?: string | null;
  structuredOutput?: StructuredOutput | null;
  reportDownloadUrl?: string | null;
}

const BAND_TH: Record<string, string> = {
  excellent: 'ดีเยี่ยม',
  good: 'ดี',
  improve: 'ควรปรับปรุง',
};

/**
 * Live list of AI reports for an offering. Subscribes to Firestore so the
 * status updates in place (running → succeeded) without a page reload.
 */
export default function AiReportsList({
  offeringId,
  scrollBody = false,
  combinedReportUrl = null,
  combinedReportPending = false,
}: {
  offeringId: string;
  scrollBody?: boolean;
  combinedReportUrl?: string | null;
  combinedReportPending?: boolean;
}) {
  const [reports, setReports] = useState<Report[] | null>(null);

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
      {reports.map((r) => (
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
            <span className="font-medium text-slate-800">
              รายงานเวอร์ชัน {r.version}
            </span>
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
                ระบบกำลังวิเคราะห์ทีละส่วน (4 ส่วน) — หน้านี้จะอัปเดตอัตโนมัติเมื่อเสร็จ
              </p>
            )}

            {r.status === 'failed' && r.errorMessage && (
              <p className="text-xs text-red-600">{r.errorMessage}</p>
            )}

            {r.status === 'succeeded' && r.structuredOutput && (
              <ReportBody out={r.structuredOutput} />
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
          </div>
        </div>
      ))}
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
