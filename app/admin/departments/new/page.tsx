import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import DepartmentForm from '@/components/DepartmentForm';

export const dynamic = 'force-dynamic';

export default async function NewDepartmentPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  return (
    <div>
      <Link
        href="/admin/departments"
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้าสาขาวิชา
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">
        เพิ่มสาขาวิชาใหม่
      </h1>
      <div className="mt-6">
        <DepartmentForm mode="create" />
      </div>
    </div>
  );
}
