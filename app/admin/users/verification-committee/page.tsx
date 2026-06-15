import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getVerificationCommitteeData } from '@/lib/data/verificationCommittee';
import UsersSubNav from '@/components/UsersSubNav';
import VerificationCommitteeClient from '@/components/VerificationCommitteeClient';

export const dynamic = 'force-dynamic';

export default async function AdminVerificationCommitteePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const data = await getVerificationCommitteeData();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">ผู้ใช้งานและสิทธิ์</h1>
      <p className="mt-1 text-sm text-slate-500">
        มอบหมายคณะกรรมการรับรองผลของแต่ละหลักสูตร — กรรมการที่เลือกจะได้รับสิทธิ์รับรองผล
        ขั้นสุดท้ายของหลักสูตรนั้นโดยอัตโนมัติ
      </p>

      <UsersSubNav active="verification" />

      <VerificationCommitteeClient people={data.people} rows={data.rows} />
    </div>
  );
}
