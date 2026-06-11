import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getManagedAcademicPrograms,
  getOfferingsForAcademicPrograms,
} from '@/lib/data/offeringManager';
import {
  getCourseReportLinks,
  getReportsForAcademicPrograms,
} from '@/lib/data/assessmentReports';
import { getAllUsers } from '@/lib/data/users';
import { ALL_PROGRAMS_ID } from '@/lib/types/models';
import AssessmentReportsClient from '@/components/AssessmentReportsClient';

export const dynamic = 'force-dynamic';

export default async function AssessmentReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isAdmin = profile.roles.isAdmin === true;
  const isDirector = (profile.roles.directorOfAcademicPrograms ?? []).length > 0;
  if (!isAdmin && !isDirector) redirect('/admin');

  // Same scoping as the offering manager: admins see every academic program,
  // directors only their own. Offerings are resolved two-hop (academicProgram →
  // curriculum → offering) and already carry the academicProgramId.
  const { programs } = await getManagedAcademicPrograms(profile);
  const academicProgramIds = programs.map((p) => p.id);
  // Admins can also see school-wide (all-programs) reports.
  const reportScopeIds = isAdmin
    ? [...academicProgramIds, ALL_PROGRAMS_ID]
    : academicProgramIds;
  const [offerings, reports, users] = await Promise.all([
    getOfferingsForAcademicPrograms(academicProgramIds),
    getReportsForAcademicPrograms(reportScopeIds),
    getAllUsers(),
  ]);
  const courseReportLinks = await getCourseReportLinks(offerings);

  // All users (active and inactive) feed the committee-name combobox; id kept
  // for traceability.
  const committeeOptions = users
    .map((u) => ({
      id: u.id,
      name: `${u.titleTh ? `${u.titleTh} ` : ''}${u.nameTh}`.trim(),
    }))
    .filter((u) => u.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">รายงานการทวนสอบ</h1>
      <p className="mt-1 text-sm text-slate-500">
        ตรวจสอบความคืบหน้าการทวนสอบของแต่ละหลักสูตร และสร้างรายงานสรุปผลการทวนสอบ
        รายภาคการศึกษาและรายปีการศึกษา
      </p>

      <AssessmentReportsClient
        offerings={offerings}
        reports={reports}
        courseReportLinks={courseReportLinks}
        isAdmin={isAdmin}
        committeeOptions={committeeOptions}
        academicPrograms={programs.map((p) => ({
          id: p.id,
          code: p.code,
          nameTh: p.nameTh,
        }))}
      />
    </div>
  );
}
