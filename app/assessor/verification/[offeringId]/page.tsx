import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getVerificationContext,
  getImplementationReview,
} from '@/lib/data/implementationReviews';
import VerificationForm from '@/components/VerificationForm';
import StatusBadge from '@/components/StatusBadge';
import { SEMESTER_LABEL, IMPLEMENTATION_DECISION } from '@/lib/constants';
import type { AssessmentDoc } from '@/lib/types/models';

export const dynamic = 'force-dynamic';

// Short labels for the 7 rubric items — used to caption carried-forward
// improvement recommendations.
const RUBRIC_LABELS: Record<keyof AssessmentDoc['scores'], string> = {
  item1Clo: '1. ผลลัพธ์การเรียนรู้รายวิชา',
  item21Content: '2.1 เนื้อหาการเรียนการสอน',
  item22Methods: '2.2 วิธีการเรียนการสอน',
  item31AssessmentMethods: '3.1 วิธีการวัดและประเมินผล',
  item32AssessmentForms: '3.2 รูปแบบการประเมินผล',
  item33Proportions: '3.3 สัดส่วนการวัดและประเมินผล',
  item34ExamQuality: '3.4 คุณภาพข้อสอบ',
};

export default async function VerificationDetailPage({
  params,
}: {
  params: { offeringId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const context = await getVerificationContext(params.offeringId);
  if (
    !context ||
    !profile.roles.assessorOf.includes(context.offering.programId) ||
    context.offering.isActive === false
  ) {
    notFound();
  }

  const { offering, assessment, nextOffering } = context;
  const existingReview = await getImplementationReview(offering.id);

  const improvementItems = assessment
    ? (Object.keys(RUBRIC_LABELS) as (keyof AssessmentDoc['scores'])[])
        .map((key) => ({
          label: RUBRIC_LABELS[key],
          text: assessment.comments?.[key]?.improvements?.trim(),
        }))
        .filter((i) => i.text)
    : [];

  return (
    <div className="max-w-3xl">
      <Link
        href="/assessor/verification"
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้ารายการทวนสอบการนำไปปฏิบัติ
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {offering.courseCode} {offering.courseNameTh}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {offering.courseNameEn} · ทวนสอบจากการเปิดสอนปีการศึกษา{' '}
            {offering.academicYear} {SEMESTER_LABEL[offering.semester]} ตอนเรียน{' '}
            {offering.section}
          </p>
        </div>
        <StatusBadge status={offering.status} />
      </div>

      {/* Carried-forward recommendations from the signed assessment */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">
          ข้อเสนอแนะจากการทวนสอบภาคที่ผ่านมา
        </h2>
        {!assessment ? (
          <p className="mt-2 text-xs text-slate-400">
            ไม่พบผลการทวนสอบของรายวิชานี้
          </p>
        ) : improvementItems.length === 0 && !assessment.generalNotes ? (
          <p className="mt-2 text-xs text-slate-400">
            ไม่มีข้อเสนอแนะที่ระบุไว้ในแบบทวนสอบ
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {improvementItems.map((item) => (
              <div key={item.label}>
                <div className="text-xs font-medium text-slate-600">
                  {item.label}
                </div>
                <p className="mt-0.5 text-sm text-slate-700">{item.text}</p>
              </div>
            ))}
            {assessment.generalNotes && (
              <div>
                <div className="text-xs font-medium text-slate-600">
                  บันทึกทั่วไป
                </div>
                <p className="mt-0.5 text-sm text-slate-700">
                  {assessment.generalNotes}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Next-semester offering */}
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">
          การเปิดสอนภาคการศึกษาถัดไป
        </h2>
        {nextOffering ? (
          <p className="mt-2 text-sm text-slate-700">
            ปีการศึกษา {nextOffering.academicYear}{' '}
            {SEMESTER_LABEL[nextOffering.semester]} ตอนเรียน{' '}
            {nextOffering.section} —{' '}
            <Link
              href={`/assessor/${nextOffering.id}`}
              className="text-mfu-primary hover:underline"
            >
              ดูรายละเอียด
            </Link>
          </p>
        ) : (
          <p className="mt-2 text-xs text-amber-700">
            ยังไม่มีการเปิดสอนรายวิชานี้ในภาคการศึกษาถัดไป —
            ยังไม่สามารถทวนสอบการนำไปปฏิบัติได้
          </p>
        )}
      </section>

      {/* Decision */}
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">
          ผลการทวนสอบการนำไปปฏิบัติ
        </h2>
        {existingReview ? (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-slate-700">
              ผลการทวนสอบ:{' '}
              <span className="font-semibold">
                {IMPLEMENTATION_DECISION[existingReview.decision].labelTh}
              </span>
            </p>
            {existingReview.notes && (
              <p className="text-slate-600">{existingReview.notes}</p>
            )}
            <p className="text-xs text-slate-400">
              ทวนสอบโดย {existingReview.reviewerName}
            </p>
          </div>
        ) : !nextOffering ? (
          <p className="mt-2 text-xs text-slate-400">
            รอการเปิดสอนภาคถัดไปก่อนจึงจะทวนสอบได้
          </p>
        ) : (
          <div className="mt-3">
            <VerificationForm previousOfferingId={offering.id} />
          </div>
        )}
      </section>
    </div>
  );
}
