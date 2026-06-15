import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile, getSessionUser } from '@/lib/firebase/auth-server';
import { getUser } from '@/lib/data/users';
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

  const [actor, target] = await Promise.all([
    getSessionUser(),
    getUser(params.userId),
  ]);
  if (!target) notFound();

  const canManageAdmins = profile.roles.isSuperAdmin === true;
  const targetIsAdmin =
    target.roles?.isAdmin === true || target.roles?.isSuperAdmin === true;
  const activeLocked = targetIsAdmin && !canManageAdmins;

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
          initial={{
            isSuperAdmin: target.roles?.isSuperAdmin ?? false,
            isAdmin: target.roles?.isAdmin ?? false,
            isLecturer: target.roles?.isLecturer ?? false,
          }}
        />
      </div>
    </div>
  );
}
