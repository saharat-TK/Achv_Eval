import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import AssessorOfferingsTable from '@/components/AssessorOfferingsTable';

export const dynamic = 'force-dynamic';

export default async function AssessorDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">รายวิชาที่รอทวนสอบ</h1>
      <p className="mt-1 text-sm text-slate-500">
        รายวิชาที่ได้รับมอบหมายให้ท่านเป็นผู้ทวนสอบ
      </p>
      <AssessorOfferingsTable programIds={profile.roles.assessorOf} />
    </div>
  );
}
