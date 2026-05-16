import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/firebase/auth-server';
import LecturerOfferingsTable from '@/components/LecturerOfferingsTable';

export const dynamic = 'force-dynamic';

export default async function LecturerDashboard() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">รายวิชาที่รับผิดชอบ</h1>
      <p className="mt-1 text-sm text-slate-500">
        รายวิชาที่ได้รับมอบหมายให้ท่านเป็นอาจารย์ผู้รับผิดชอบ
      </p>
      <LecturerOfferingsTable uid={user.uid} />
    </div>
  );
}
