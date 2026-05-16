import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/firebase/auth-server';
import { getOffering, getAiReportsForOffering } from '@/lib/data/offerings';
import StatusBadge from '@/components/StatusBadge';
import AnalyzeCoursePanel from '@/components/AnalyzeCoursePanel';
import { SEMESTER_LABEL, REPORT_STATUS_TH } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function OfferingDetailPage({
  params,
}: {
  params: { offeringId: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const offering = await getOffering(params.offeringId);
  // Lecturer may only view their own offering. Admin/director/assessor views
  // arrive in later phases through their own workspaces.
  if (!offering || offering.lecturerId !== user.uid) {
    notFound();
  }

  const aiReports = await getAiReportsForOffering(offering.id);

  return (
    <div>
      <Link href="/lecturer" className="text-sm text-slate-500 hover:underline">
        ← กลับไปหน้ารายวิชา
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {offering.courseCode} {offering.courseNameTh}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {offering.courseNameEn} · ปีการศึกษา {offering.academicYear}{' '}
            {SEMESTER_LABEL[offering.semester]} · ตอนเรียน {offering.section}
          </p>
        </div>
        <StatusBadge status={offering.status} />
      </div>

      {/* Analysis submission */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">
          ส่งเอกสารเพื่อวิเคราะห์ด้วย AI
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          ไฟล์ที่อัปโหลดจะถูกส่งให้ระบบ AI วิเคราะห์ทันทีและ
          <strong>ไม่ถูกจัดเก็บไว้ในระบบ</strong> — ระบบเก็บเฉพาะรายงาน PDF
          ที่สร้างขึ้นเท่านั้น
        </p>
        <div className="mt-3">
          <AnalyzeCoursePanel offeringId={offering.id} />
        </div>
      </section>

      {/* AI reports */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">
          รายงานการวิเคราะห์
        </h2>
        {aiReports.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">ยังไม่มีรายงาน</p>
        ) : (
          <div className="mt-2 space-y-3">
            {aiReports.map((r) => {
              const out = r.structuredOutput as
                | { overallSummary?: string; criticalIssues?: string[] }
                | null;
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">
                      รายงานเวอร์ชัน {r.version}
                    </span>
                    <span className="text-xs text-slate-500">
                      {REPORT_STATUS_TH[r.status] ?? r.status}
                    </span>
                  </div>

                  {r.status === 'failed' && r.errorMessage && (
                    <p className="mt-2 text-xs text-red-600">{r.errorMessage}</p>
                  )}

                  {r.status === 'succeeded' && out && (
                    <div className="mt-3 space-y-2">
                      {out.overallSummary && (
                        <p className="whitespace-pre-wrap text-sm text-slate-700">
                          {out.overallSummary}
                        </p>
                      )}
                      {out.criticalIssues && out.criticalIssues.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-red-700">
                            ประเด็นสำคัญที่ต้องแก้ไข
                          </div>
                          <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                            {out.criticalIssues.map((issue, i) => (
                              <li key={i}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {r.reportDownloadUrl && (
                    <a
                      href={r.reportDownloadUrl}
                      className="mt-3 inline-block text-sm text-mfu-primary hover:underline"
                    >
                      ดาวน์โหลดรายงาน PDF
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">
          การสร้างรายงาน PDF และจัดเก็บจะเปิดใช้งานใน Phase 1C
        </p>
      </section>
    </div>
  );
}
