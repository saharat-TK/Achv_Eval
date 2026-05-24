import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile, getSessionUser } from '@/lib/firebase/auth-server';
import { getUser } from '@/lib/data/users';
import { getAllAcademicPrograms } from '@/lib/data/academicPrograms';
import { getAllPrograms } from '@/lib/data/programs';
import UserRolesEditor from '@/components/UserRolesEditor';
import UserActiveToggle from '@/components/UserActiveToggle';

export const dynamic = 'force-dynamic';

export default async function ManageUserRolesPage({
  params,
}: {
  params: { userId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const [actor, target, academicPrograms, curriculums] = await Promise.all([
    getSessionUser(),
    getUser(params.userId),
    getAllAcademicPrograms(),
    getAllPrograms(),
  ]);
  if (!target) notFound();

  const canManageAdmins = profile.roles.isSuperAdmin === true;
  const targetIsAdmin =
    target.roles?.isAdmin === true || target.roles?.isSuperAdmin === true;
  const activeLocked = targetIsAdmin && !canManageAdmins;
  const curriculumToAcademicProgram = new Map(
    curriculums.map((program) => [program.id, program.parentProgramId ?? null]),
  );

  function academicRoleIds(
    nextIds: string[] | undefined,
    legacyCurriculumIds: string[] | undefined,
  ): string[] {
    if (nextIds?.length) return [...new Set(nextIds.filter(Boolean))];
    return [
      ...new Set(
        (legacyCurriculumIds ?? [])
          .map((id) => curriculumToAcademicProgram.get(id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }

  return (
    <div>
      <Link href="/admin/users" className="text-sm text-slate-500 hover:underline">
        ← กลับไปหน้าผู้ใช้งาน
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">
        จัดการสิทธิ์ — {target.nameTh || target.email}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{target.email}</p>

      <div className="mt-6 space-y-5">
        <UserActiveToggle
          userId={target.id}
          isSelf={actor?.uid === target.id}
          initialActive={target.isActive ?? true}
          locked={activeLocked}
        />
        <UserRolesEditor
          userId={target.id}
          isSelf={actor?.uid === target.id}
          canManageAdmins={canManageAdmins}
          academicPrograms={academicPrograms.map((p) => ({
            id: p.id,
            code: p.code,
            nameTh: p.nameTh,
          }))}
          initial={{
            isSuperAdmin: target.roles?.isSuperAdmin ?? false,
            isAdmin: target.roles?.isAdmin ?? false,
            isLecturer: target.roles?.isLecturer ?? false,
            directorOfAcademicPrograms: academicRoleIds(
              target.roles?.directorOfAcademicPrograms,
              target.roles?.directorOf,
            ),
            assessorOfAcademicPrograms: academicRoleIds(
              target.roles?.assessorOfAcademicPrograms,
              target.roles?.assessorOf,
            ),
            verifierOfAcademicPrograms: academicRoleIds(
              target.roles?.verifierOfAcademicPrograms,
              target.roles?.verifierOf,
            ),
          }}
        />
      </div>
    </div>
  );
}
