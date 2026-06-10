import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getReportById } from '@/lib/data/assessmentReports';
import { SEMESTER_LABEL } from '@/lib/constants';
import ReportArtifacts from '@/components/ReportArtifacts';
import DeleteReportButton from '@/components/DeleteReportButton';
import CourseListByProgram from '@/components/CourseListByProgram';
import {
  bandFromPercent,
  bandFromScore,
  type AssessmentBand,
  type ReportStatus,
  type ReportTopicSummary,
  type Semester,
} from '@/lib/types/models';

export const dynamic = 'force-dynamic';

const BAND_LABEL: Record<AssessmentBand, string> = {
  improve: 'ควรปรับปรุง',
  good: 'ดี',
  excellent: 'ดีเยี่ยม',
};

const BAND_BADGE: Record<AssessmentBand, string> = {
  improve: 'bg-amber-50 text-amber-800 border-amber-200',
  good: 'bg-blue-50 text-blue-800 border-blue-200',
  excellent: 'bg-green-50 text-green-800 border-green-200',
};

function BandBadge({ band }: { band: AssessmentBand }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${BAND_BADGE[band]}`}
    >
      {BAND_LABEL[band]}
    </span>
  );
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: 'ฉบับร่าง',
  synthesizing: 'กำลังสังเคราะห์ข้อเสนอแนะ',
  synthesized: 'สังเคราะห์ข้อเสนอแนะแล้ว',
  rendering: 'กำลังสร้างเอกสาร',
  ready: 'พร้อมใช้งาน',
  failed: 'ไม่สำเร็จ',
};

export default async function AssessmentReportPage({
  params,
}: {
  params: { reportId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const report = await getReportById(params.reportId);
  if (!report) notFound();

  const isAdmin = profile.roles.isAdmin === true;
  const isDirector = (profile.roles.directorOfAcademicPrograms ?? []).includes(
    report.academicProgramId,
  );
  if (!isAdmin && !isDirector) notFound();

  const { snapshot, header } = report;
  const isAll = report.coverage === 'all';
  const scopeLabel =
    report.scope === 'annual'
      ? 'ประจำปีการศึกษา'
      : SEMESTER_LABEL[report.semester as Semester];
  const assessedRows = snapshot.courseRows.filter((r) => r.assessed);

  // Group assessed courses by semester for the detail table.
  const bySemester = new Map<Semester, typeof assessedRows>();
  for (const r of assessedRows) {
    if (!bySemester.has(r.semester)) bySemester.set(r.semester, []);
    bySemester.get(r.semester)!.push(r);
  }
  const semesters = [...bySemester.keys()].sort((a, b) => Number(a) - Number(b));

  return (
    <div className="space-y-6">
      <Link
        href="/admin/assessment-reports"
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้ารายงานการทวนสอบ
      </Link>

      {/* Header */}
      <header className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-slate-800">
          รายงานการประชุมทวนสอบผลสัมฤทธิ์การศึกษา {scopeLabel} ปีการศึกษา{' '}
          {report.academicYear}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{report.academicProgramLabel}</p>
        {header.meetingDateTime && (
          <p className="mt-2 text-sm text-slate-600">{header.meetingDateTime}</p>
        )}
        {header.venue && <p className="text-sm text-slate-600">ณ {header.venue}</p>}

        {header.committee.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500">
              รายนามคณะกรรมการ
            </div>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
              {header.committee.map((m, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>{m.name}</span>
                  <span className="text-slate-500">{m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            สถานะ: {STATUS_LABEL[report.status] ?? 'ฉบับร่าง'}
          </span>
          <DeleteReportButton reportId={report.id} />
        </div>
      </header>

      {/* Section 2 — Assessment detail */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-800">
          รายละเอียดการทวนสอบ
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          {isAll && snapshot.programRollup
            ? `มีหลักสูตรทั้งหมด ${snapshot.programRollup.length} หลักสูตร มีรายวิชาที่รับผิดชอบสอน`
            : 'มีรายวิชาที่รับผิดชอบสอนในหลักสูตร'}{' '}
          {snapshot.totalOfferings} รายวิชา ดำเนินการทวนสอบผลสัมฤทธิ์แล้ว{' '}
          {snapshot.assessedOfferings} รายวิชา คิดเป็นร้อยละ {snapshot.percent}{' '}
          ของรายวิชาที่เปิดสอน
        </p>

        {/* Band distribution */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
            ควรปรับปรุง {snapshot.bandDistribution.improve}
          </span>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">
            ดี {snapshot.bandDistribution.good}
          </span>
          <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-800">
            ดีเยี่ยม {snapshot.bandDistribution.excellent}
          </span>
        </div>

        {/* All-programs: per-program rollup table. Per-program: per-semester courses. */}
        {isAll && snapshot.programRollup ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">รหัสหลักสูตร</th>
                <th className="py-1 pr-3 font-medium">ชื่อหลักสูตร</th>
                <th className="py-1 pr-3 font-medium">รายวิชา</th>
                <th className="py-1 pr-3 font-medium">ทวนสอบแล้ว</th>
                <th className="py-1 pr-3 font-medium">คะแนนเฉลี่ย</th>
                <th className="py-1 font-medium">ระดับ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshot.programRollup.map((p) => (
                <tr key={p.academicProgramId}>
                  <td className="py-1.5 pr-3 text-slate-700">{p.code}</td>
                  <td className="py-1.5 pr-3 text-slate-700">{p.name}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{p.totalOfferings}</td>
                  <td className="py-1.5 pr-3 text-slate-600">
                    {p.assessedOfferings} ({p.assessedPercent}%)
                  </td>
                  <td className="py-1.5 pr-3 text-slate-600">
                    {p.avgScorePercent != null ? `${p.avgScorePercent}%` : '—'}
                  </td>
                  <td className="py-1.5">{p.band ? <BandBadge band={p.band} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          semesters.map((sem) => (
            <div key={sem} className="mt-4">
              <div className="text-sm font-semibold text-slate-600">
                {SEMESTER_LABEL[sem]} ({bySemester.get(sem)!.length} รายวิชา)
              </div>
              <table className="mt-1 w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">รหัส/ชื่อรายวิชา</th>
                    <th className="py-1 pr-3 font-medium">ผู้รับผิดชอบ</th>
                    <th className="py-1 font-medium">ผลการประเมิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bySemester.get(sem)!.map((r) => (
                    <tr key={r.offeringId}>
                      <td className="py-1.5 pr-3 text-slate-700">
                        {r.courseCode} {r.courseNameEn}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600">{r.lecturerName ?? '—'}</td>
                      <td className="py-1.5 text-slate-600">
                        {r.band ? BAND_LABEL[r.band] : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      {/* Section 3.1 — Assessor topic summary (strengths + suggestions) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-800">
            สรุปข้อเสนอแนะตามหัวข้อการทวนสอบ (7 รายการ) — จากผู้ทวนสอบ
          </h2>
          {snapshot.overallAveragePercent != null && (
            <span className="inline-flex items-center gap-2 text-sm text-slate-600">
              ค่าเฉลี่ยรวมทุกรายวิชา: {snapshot.overallAveragePercent}%
              <BandBadge band={bandFromPercent(snapshot.overallAveragePercent)} />
            </span>
          )}
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="w-1/5 px-3 py-2 font-medium">หัวข้อการทวนสอบ</th>
                <th className="px-3 py-2 font-medium">คะแนนเฉลี่ย</th>
                <th className="px-3 py-2 font-medium">ข้อดี / จุดเด่น</th>
                <th className="px-3 py-2 font-medium">ข้อเสนอแนะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {snapshot.assessorTopicSummary.map((t) => (
                <tr key={t.key}>
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {t.number}. {t.labelTh}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {t.averageScore == null ? (
                      <span className="text-slate-300">N/A</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        {t.averageScore.toFixed(1)}/3
                        <BandBadge band={bandFromScore(t.averageScore)} />
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {t.strengths.length === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <ul className="list-disc space-y-0.5 pl-4">
                        {t.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {t.improvements.length === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <ul className="list-disc space-y-0.5 pl-4">
                        {t.improvements.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3.2 — AI-synthesized topic suggestions (once generated) */}
      {report.aiSynthesis && report.aiSynthesis.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-800">
            ข้อเสนอแนะเพิ่มเติมตามหัวข้อการทวนสอบ (7 รายการ) — จากการวิเคราะห์ AI
          </h2>
          <div className="mt-3 space-y-3">
            {report.aiSynthesis.map((t: ReportTopicSummary) => (
              <div key={t.key} className="border-l-2 border-slate-200 pl-3">
                <div className="text-sm font-medium text-slate-700">
                  {t.number}. {t.labelTh}
                </div>
                {t.improvements.length === 0 ? (
                  <p className="text-xs text-slate-400">ไม่มีข้อเสนอแนะเพิ่มเติม</p>
                ) : (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                    {t.improvements.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All-programs: full course listing grouped by academic program (filterable) */}
      {isAll && <CourseListByProgram rows={snapshot.courseRows} />}

      {/* Generate / download PDF + DOCX */}
      <ReportArtifacts
        reportId={report.id}
        status={report.status}
        pdfUrl={report.pdfUrl}
      />
    </div>
  );
}
