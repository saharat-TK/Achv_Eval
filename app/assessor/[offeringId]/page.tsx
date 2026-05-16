import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getOffering } from '@/lib/data/offerings';
import StatusBadge from '@/components/StatusBadge';
import AiReportsList from '@/components/AiReportsList';
import AssessmentForm from '@/components/AssessmentForm';
import { SEMESTER_LABEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function AssessorOfferingPage({
  params,
}: {
  params: { offeringId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const offering = await getOffering(params.offeringId);

  // Assessor must be assigned to the offering's program.
  if (
    !offering ||
    !profile.roles.assessorOf.includes(offering.programId)
  ) {
    notFound();
  }

  return (
    <div>
      <Link href="/assessor" className="text-sm text-slate-500 hover:underline">
        ← กลับไปหน้ารายการ
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
          {offering.lecturerEmail && (
            <p className="mt-1 text-xs text-slate-400">
              อาจารย์ผู้รับผิดชอบ: {offering.lecturerEmail}
            </p>
          )}
        </div>
        <StatusBadge status={offering.status} />
      </div>

      {/* AI report and the evaluation form side by side. On large screens
          each column scrolls on its own so the assessor can read the report
          while filling the form without scrolling the whole page. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Left — AI analysis report (read-only) */}
        <section className="lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto lg:pr-1">
          <h2 className="sticky top-0 z-10 bg-slate-50 py-1 text-sm font-semibold text-slate-700">
            รายงานการวิเคราะห์ AI
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            ผลวิเคราะห์จากระบบ AI เพื่อประกอบการพิจารณาของผู้ทวนสอบ
          </p>
          <AiReportsList offeringId={offering.id} />
        </section>

        {/* Right — assessor evaluation form */}
        <section className="lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto lg:pl-1">
          <h2 className="sticky top-0 z-10 bg-slate-50 py-1 text-sm font-semibold text-slate-700">
            แบบประเมินการทวนสอบ (7 หัวข้อ)
          </h2>
          <p className="mt-1 mb-4 text-xs text-slate-500">
            ให้คะแนนแต่ละหัวข้อ (1–3) พร้อมข้อดีและข้อเสนอแนะ
            แล้วบันทึกหรือลงนามทวนสอบ
          </p>
          <AssessmentForm
            offeringId={offering.id}
            hasExamAssessment={offering.hasExamAssessment}
          />
        </section>
      </div>
    </div>
  );
}
