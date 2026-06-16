import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getOffering } from '@/lib/data/offerings';
import { getAssessmentById, getFollowUpReview } from '@/lib/data/assessments';
import {
  getOfferingCommittee,
  deriveUserCommitteeRole,
} from '@/lib/data/assessmentCommittee';
import StatusBadge from '@/components/StatusBadge';
import AssessorOfferingTabs from '@/components/AssessorOfferingTabs';
import { SEMESTER_LABEL } from '@/lib/constants';
import type { OfferingStatus } from '@/lib/types/models';

export const dynamic = 'force-dynamic';

const ASSESSMENT_VISIBLE_STATUSES: OfferingStatus[] = [
  'pending_assessment',
  'assessor_review',
  'pending_head_signoff',
  'assessed',
];

export default async function AssessorOfferingPage({
  params,
}: {
  params: { offeringId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const offering = await getOffering(params.offeringId);

  // Assessor must be assigned to the offering's program. Admins may view
  // any offering read-only — the sign-off API still checks assessorOf.
  if (
    !offering ||
    !ASSESSMENT_VISIBLE_STATUSES.includes(offering.status) ||
    (!profile.roles.isAdmin &&
      (!profile.roles.assessorOf.includes(offering.programId) ||
        offering.isActive === false))
  ) {
    notFound();
  }

  // Resolve the caller's position on the program's assessment committee, which
  // drives the two-step sign-off (secretary drafts/submits, head signs/returns).
  const committee = await getOfferingCommittee(offering.programId);
  const committeeRole = deriveUserCommitteeRole(committee, profile.uid);

  // Fetch previous offering and its assessment (1 hop back) for the follow-up tab.
  let previousOffering = null;
  let previousAssessment = null;
  let initialFollowUp = null;

  if (offering.previousOfferingId) {
    previousOffering = await getOffering(offering.previousOfferingId);
    if (previousOffering?.assessmentId) {
      previousAssessment = await getAssessmentById(
        previousOffering.id,
        previousOffering.assessmentId,
      );
    }
    if (previousAssessment) {
      initialFollowUp = await getFollowUpReview(offering.id);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
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

      <AssessorOfferingTabs
        offeringId={offering.id}
        hasExamAssessment={offering.hasExamAssessment}
        offeringStatus={offering.status}
        committeeRole={committeeRole}
        isAdmin={profile.roles.isAdmin === true}
        isSuperAdmin={profile.roles.isSuperAdmin === true}
        previousOffering={
          previousOffering
            ? {
                id: previousOffering.id,
                academicYear: previousOffering.academicYear,
                semester: previousOffering.semester,
                section: previousOffering.section,
                courseCode: previousOffering.courseCode,
                courseNameTh: previousOffering.courseNameTh,
              }
            : null
        }
        previousAssessment={
          previousAssessment
            ? {
                assessorName: previousAssessment.assessorName,
                scores: previousAssessment.scores,
                comments: previousAssessment.comments,
                generalNotes: previousAssessment.generalNotes,
              }
            : null
        }
        initialFollowUp={
          initialFollowUp
            ? {
                itemDecisions: initialFollowUp.itemDecisions,
                itemComments: initialFollowUp.itemComments ?? {},
                notes: initialFollowUp.notes,
                isLocked: initialFollowUp.isLocked ?? false,
              }
            : null
        }
      />
    </div>
  );
}
