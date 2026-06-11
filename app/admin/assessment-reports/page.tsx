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
import { getAllAllowlistEntries } from '@/lib/data/allowlist';
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
  const [offerings, reports, users, allowlist] = await Promise.all([
    getOfferingsForAcademicPrograms(academicProgramIds),
    getReportsForAcademicPrograms(reportScopeIds),
    getAllUsers(),
    getAllAllowlistEntries(),
  ]);
  const courseReportLinks = await getCourseReportLinks(offerings);

  // Committee combobox roster = signed-in users + allowlisted faculty who have
  // not signed in yet (most of the directory lives in `allowlist` until first
  // sign-in). Deduped by email; signed-in users win since they carry a title
  // and a uid for traceability, while allowlist entries contribute name only.
  const committeeByEmail = new Map<string, { id: string; name: string }>();
  for (const a of allowlist) {
    const email = a.email?.toLowerCase();
    const name = (a.nameTh ?? '').trim();
    if (email && name) committeeByEmail.set(email, { id: '', name });
  }
  for (const u of users) {
    const name = `${u.titleTh ? `${u.titleTh} ` : ''}${u.nameTh ?? ''}`.trim();
    if (name) committeeByEmail.set(u.email?.toLowerCase() ?? u.id, { id: u.id, name });
  }
  const committeeOptions = [...committeeByEmail.values()]
    .filter((o) => o.name.length > 0)
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
