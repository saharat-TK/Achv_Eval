import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getDepartmentMap } from '@/lib/data/departments';
import { getAllPrograms, getProgramsByIds } from '@/lib/data/programs';
import AssessorOfferingsTable from '@/components/AssessorOfferingsTable';

export const dynamic = 'force-dynamic';

export default async function AssessorDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const assessorOf = profile.roles.assessorOf ?? [];
  // Admins without an assessor assignment see every program's offerings
  // read-only (the sign-off route still gates on assessorOf).
  const adminViewing = profile.roles.isAdmin && assessorOf.length === 0;
  const programs = adminViewing
    ? await getAllPrograms()
    : await getProgramsByIds(assessorOf);
  const programIds = adminViewing
    ? programs.map((program) => program.id)
    : assessorOf;
  const departmentMap = await getDepartmentMap(
    programs.map((program) => program.departmentId ?? '').filter(Boolean),
  );
  const programMetaById = Object.fromEntries(
    programs.map((program) => {
      const department = program.departmentId
        ? departmentMap[program.departmentId]
        : null;
      return [
        program.id,
        {
          code: program.code,
          nameTh: program.nameTh,
          departmentId: program.departmentId ?? null,
          departmentNameTh: department?.nameTh ?? null,
        },
      ];
    }),
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">รายวิชาที่รอทวนสอบ</h1>
      <p className="mt-1 text-sm text-slate-500">
        {adminViewing
          ? 'มุมมองผู้ดูแลระบบ — แสดงรายวิชาทุกหลักสูตร (อ่านอย่างเดียว)'
          : 'รายวิชาที่ได้รับมอบหมายให้ท่านเป็นผู้ทวนสอบ'}
      </p>
      <AssessorOfferingsTable
        programIds={programIds}
        programMetaById={programMetaById}
      />
    </div>
  );
}
