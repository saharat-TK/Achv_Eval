import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getDepartmentMap } from '@/lib/data/departments';
import { getAllPrograms, getProgramsByIds } from '@/lib/data/programs';
import AssessorOfferingsTable from '@/components/AssessorOfferingsTable';

export const dynamic = 'force-dynamic';

export default async function AssessorDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  // Full assessors (write-capable) plus external assessors who hold read-only
  // viewer access — both can see the queue and open details. The sign-off route
  // gates writes strictly on assessorOf, so viewers stay read-only.
  const assessorOf = [
    ...new Set([
      ...(profile.roles.assessorOf ?? []),
      ...(profile.roles.assessorViewerOf ?? []),
    ]),
  ];
  // Admins and super-admins get a full oversight view of every program's
  // offerings, regardless of committee membership (the sign-off route still
  // gates on assessorOf, so it's read-only for programs they don't sit on).
  const adminViewing = profile.roles.isAdmin === true;
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
