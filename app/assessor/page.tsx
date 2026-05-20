import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllPrograms } from '@/lib/data/programs';
import AssessorOfferingsTable from '@/components/AssessorOfferingsTable';

export const dynamic = 'force-dynamic';

export default async function AssessorDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const assessorOf = profile.roles.assessorOf ?? [];
  // Admins without an assessor assignment see every program's offerings
  // read-only (the sign-off route still gates on assessorOf).
  const adminViewing = profile.roles.isAdmin && assessorOf.length === 0;
  const programIds = adminViewing
    ? (await getAllPrograms()).map((program) => program.id)
    : assessorOf;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">รายวิชาที่รอทวนสอบ</h1>
      <p className="mt-1 text-sm text-slate-500">
        {adminViewing
          ? 'มุมมองผู้ดูแลระบบ — แสดงรายวิชาทุกหลักสูตร (อ่านอย่างเดียว)'
          : 'รายวิชาที่ได้รับมอบหมายให้ท่านเป็นผู้ทวนสอบ'}
      </p>
      <AssessorOfferingsTable programIds={programIds} />
    </div>
  );
}
