import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAssessmentCommitteeData } from '@/lib/data/assessmentCommittee';
import UsersSubNav from '@/components/UsersSubNav';
import AssessmentCommitteeClient from '@/components/AssessmentCommitteeClient';

export const dynamic = 'force-dynamic';

export default async function AdminAssessmentCommitteePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const data = await getAssessmentCommitteeData();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">ผู้ใช้งานและสิทธิ์</h1>
      <p className="mt-1 text-sm text-slate-500">
        มอบหมายคณะกรรมการทวนสอบผลสัมฤทธิ์ของแต่ละหลักสูตร — ผู้ทวนสอบภายใน ประธาน
        และเลขานุการจะได้รับสิทธิ์ผู้ทวนสอบของหลักสูตรนั้นโดยอัตโนมัติ
      </p>

      <UsersSubNav active="committee" />

      <AssessmentCommitteeClient people={data.people} rows={data.rows} />
    </div>
  );
}
