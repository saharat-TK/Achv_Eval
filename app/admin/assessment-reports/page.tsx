import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getManagedAcademicPrograms,
  getOfferingsForAcademicPrograms,
} from '@/lib/data/offeringManager';
import { getReportsForAcademicPrograms } from '@/lib/data/assessmentReports';
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
  const [offerings, reports] = await Promise.all([
    getOfferingsForAcademicPrograms(academicProgramIds),
    getReportsForAcademicPrograms(academicProgramIds),
  ]);

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
        academicPrograms={programs.map((p) => ({
          id: p.id,
          code: p.code,
          nameTh: p.nameTh,
        }))}
      />
    </div>
  );
}
