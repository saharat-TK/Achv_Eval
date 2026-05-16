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

      {/* AI Report — read-only for assessor */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">
          รายงานการวิเคราะห์ AI
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          ผลวิเคราะห์จากระบบ AI เพื่อประกอบการพิจารณาของผู้ทวนสอบ
        </p>
        <AiReportsList offeringId={offering.id} />
      </section>

      {/* Assessment rubric form */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">
          แบบประเมินการทวนสอบ (7 หัวข้อ)
        </h2>
        <p className="mt-1 text-xs text-slate-500 mb-4">
          ให้คะแนนแต่ละหัวข้อ (1–3) พร้อมข้อดีและข้อเสนอแนะ
          แล้วบันทึกหรือลงนามทวนสอบ
        </p>
        <AssessmentForm
          offeringId={offering.id}
          hasExamAssessment={offering.hasExamAssessment}
        />
      </section>
    </div>
  );
}
