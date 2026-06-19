import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getOffering } from '@/lib/data/offerings';
import { getLatestAssessment, getSelfAssessment } from '@/lib/data/assessments';
import StatusBadge from '@/components/StatusBadge';
import AnalyzeCoursePanel from '@/components/AnalyzeCoursePanel';
import AiReportsList from '@/components/AiReportsList';
import SelfAssessmentForm from '@/components/SelfAssessmentForm';
import { SEMESTER_LABEL, SIGNED_OFF_STATUSES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function OfferingDetailPage({
  params,
}: {
  params: { offeringId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const offering = await getOffering(params.offeringId);
  // Lecturer may only view their own offering. Admin/director/assessor views
  // arrive in later phases through their own workspaces.
  if (!offering || offering.lecturerId !== profile.uid || offering.isActive === false) {
    notFound();
  }

  const assessment = SIGNED_OFF_STATUSES.includes(offering.status)
    ? await getLatestAssessment(offering.id)
    : null;

  // Self-assessment: editable while ai_complete, shown read-only once sent.
  const self = await getSelfAssessment(offering.id);
  const showSelfAssessment = offering.status === 'ai_complete' || self !== null;
  const selfEditable = offering.status === 'ai_complete';

  return (
    <div className="mx-auto max-w-[1108px]">
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

      {/* Single card — upload action + reports always fill container width */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">

        {/* Upload row — header strip */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">
            ส่งเอกสารเพื่อวิเคราะห์ด้วย AI
          </span>
          <AnalyzeCoursePanel
            offeringId={offering.id}
            status={offering.status}
            attemptLimit={offering.analysisAttemptLimit ?? 4}
            attemptCount={offering.analysisAttemptCount ?? 0}
            isSuperAdmin={profile.roles.isSuperAdmin === true}
          />
        </div>

        {/* Reports body */}
        <div className="px-4 py-4">
          <h2 className="text-sm font-semibold text-slate-700">รายงานการวิเคราะห์</h2>
          <AiReportsList
            offeringId={offering.id}
            combinedReportUrl={assessment?.signedPdfUrl ?? null}
            combinedReportPending={Boolean(assessment && !assessment.signedPdfUrl)}
          />
        </div>

      </div>

      {/* Lecturer self-assessment (7 items) — sent to the assessor */}
      {showSelfAssessment && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">
            แบบประเมินตนเอง (7 หัวข้อ)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {selfEditable
              ? 'ให้คะแนนแต่ละหัวข้อ (1–3) พร้อมข้อดีและข้อเสนอแนะ แล้วส่งให้ผู้ทวนสอบ'
              : 'ผลการประเมินตนเองที่ส่งให้ผู้ทวนสอบแล้ว'}
          </p>
          <div className="mt-4">
            <SelfAssessmentForm
              offeringId={offering.id}
              hasExamAssessment={offering.hasExamAssessment}
              editable={selfEditable}
              initial={
                self
                  ? {
                      scores: self.scores,
                      comments: self.comments ?? {},
                      generalNotes: self.generalNotes ?? '',
                      isSubmitted: self.isSubmitted,
                    }
                  : null
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
