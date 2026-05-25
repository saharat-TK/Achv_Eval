import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getManagedAcademicPrograms,
  getOfferingsForAcademicPrograms,
} from '@/lib/data/offeringManager';
import OfferingManagerClient from '@/components/OfferingManagerClient';

export const dynamic = 'force-dynamic';

export default async function OfferingManagerPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isAdmin = profile.roles.isAdmin === true;
  const isDirector = (profile.roles.directorOfAcademicPrograms ?? []).length > 0;
  if (!isAdmin && !isDirector) redirect('/admin');

  const { programs } = await getManagedAcademicPrograms(profile);
  const offerings = await getOfferingsForAcademicPrograms(programs.map((p) => p.id));

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">จัดการการเปิดสอน</h1>
      <p className="mt-1 text-sm text-slate-500">
        วางแผนรายวิชาที่เปิดสอนทั้งภาคการศึกษา จัดกลุ่มตามปีการศึกษา ภาค และหลักสูตร
      </p>

      <OfferingManagerClient
        offerings={offerings}
        academicPrograms={programs.map((p) => ({
          id: p.id,
          code: p.code,
          nameTh: p.nameTh,
        }))}
        isAdmin={isAdmin}
      />
    </div>
  );
}
