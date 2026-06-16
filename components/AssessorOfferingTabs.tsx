'use client';

import { useState } from 'react';
import AiReportsList from '@/components/AiReportsList';
import AssessmentForm from '@/components/AssessmentForm';
import FollowUpReviewPanel from '@/components/FollowUpReviewPanel';
import type {
  AssessmentDoc,
  FollowUpReviewDoc,
  OfferingStatus,
} from '@/lib/types/models';
import type { UserCommitteeRole } from '@/lib/data/assessmentCommittee';

type Tab = 'current' | 'followup';

export default function AssessorOfferingTabs({
  offeringId,
  hasExamAssessment,
  offeringStatus,
  committeeRole,
  isAdmin,
  isSuperAdmin,
  previousOffering,
  previousAssessment,
  initialFollowUp,
}: {
  offeringId: string;
  hasExamAssessment: boolean;
  offeringStatus: OfferingStatus;
  committeeRole: UserCommitteeRole;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  previousOffering: {
    id: string;
    academicYear: number;
    semester: '1' | '2' | '3';
    section: string;
    courseCode: string;
    courseNameTh: string;
  } | null;
  previousAssessment: {
    assessorName: string;
    scores: AssessmentDoc['scores'];
    comments: AssessmentDoc['comments'];
    generalNotes: string | null;
  } | null;
  initialFollowUp: {
    itemDecisions: FollowUpReviewDoc['itemDecisions'];
    itemComments: FollowUpReviewDoc['itemComments'];
    notes: string | null;
    isLocked: boolean;
  } | null;
}) {
  const showFollowUpTab = !!previousAssessment && !!previousOffering;
  const [tab, setTab] = useState<Tab>(showFollowUpTab ? 'followup' : 'current');
  const [followUpRecorded, setFollowUpRecorded] = useState(!!initialFollowUp);

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-mfu-primary text-mfu-primary'
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
    }`;

  return (
    <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      {/* Tab bar — only rendered when there is a previous assessment to follow up on */}
      {showFollowUpTab && (
        <div className="mt-4 flex border-b border-slate-200">
          <button
            className={tabClass('followup')}
            onClick={() => setTab('followup')}
          >
            ติดตามผลการปรับปรุง
          </button>
          <button
            className={tabClass('current')}
            onClick={() => setTab('current')}
          >
            การประเมินปัจจุบัน
          </button>
        </div>
      )}

      {/* Tab 1 — Current assessment (existing two-column layout) */}
      {tab === 'current' && (
        <div className="mt-6 grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
          {/* Left — AI analysis report (read-only) */}
          <section className="lg:flex lg:min-h-0 lg:flex-col lg:pr-1">
            <h2 className="text-sm font-semibold text-slate-700">รายงานการวิเคราะห์ AI</h2>
            <p className="mt-1 text-xs text-slate-500">
              ผลวิเคราะห์จากระบบ AI เพื่อประกอบการพิจารณาของผู้ทวนสอบ
            </p>
            <div className="mt-4 lg:min-h-0 lg:flex-1">
              <AiReportsList offeringId={offeringId} scrollBody />
            </div>
          </section>

          {/* Right — assessor evaluation form */}
          <section className="lg:flex lg:min-h-0 lg:flex-col lg:pl-1">
            <h2 className="text-sm font-semibold text-slate-700">
              แบบประเมินการทวนสอบ (7 หัวข้อ)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              ให้คะแนนแต่ละหัวข้อ (1–3) พร้อมข้อดีและข้อเสนอแนะ
              แล้วบันทึกหรือลงนามทวนสอบ
            </p>
            <div className="mt-4 lg:min-h-0 lg:flex-1">
              <AssessmentForm
                offeringId={offeringId}
                hasExamAssessment={hasExamAssessment}
                offeringStatus={offeringStatus}
                committeeRole={committeeRole}
                isAdmin={isAdmin}
                isSuperAdmin={isSuperAdmin}
                requireFollowUp={showFollowUpTab}
                followUpRecorded={followUpRecorded}
                onGoToFollowUp={() => setTab('followup')}
                scrollBody
              />
            </div>
          </section>
        </div>
      )}

      {/* Tab 2 — Follow-up on previous assessment */}
      {tab === 'followup' && showFollowUpTab && (
        <div className="mt-6">
          <FollowUpReviewPanel
            currentOfferingId={offeringId}
            previousOffering={previousOffering!}
            previousAssessment={previousAssessment!}
            initialFollowUp={initialFollowUp}
            initialLocked={!!initialFollowUp?.isLocked}
            onSaved={() => setFollowUpRecorded(true)}
            onGoToCurrent={() => setTab('current')}
          />
        </div>
      )}
    </div>
  );
}
