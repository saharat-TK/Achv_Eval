import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getDepartment } from '@/lib/data/departments';
import DepartmentForm from '@/components/DepartmentForm';
import DepartmentLifecyclePanel from '@/components/DepartmentLifecyclePanel';
import {
  checkDepartmentBlockers,
  type DepartmentFormData,
} from '@/app/admin/departments/actions';

export const dynamic = 'force-dynamic';

export default async function EditDepartmentPage({
  params,
}: {
  params: { deptId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const dept = await getDepartment(params.deptId);
  if (!dept) notFound();

  const initial: DepartmentFormData = {
    nameTh: dept.nameTh,
    nameEn: dept.nameEn,
    isActive: dept.isActive,
  };

  const blockersRes = await checkDepartmentBlockers(dept.id);
  const blockers = blockersRes.ok
    ? blockersRes.blockers
    : { programsCount: 0 };

  return (
    <div>
      <Link
        href="/admin/departments"
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้าสาขาวิชา
      </Link>

      <div className="mt-3 grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_256px]">
        {/* Header — spans both columns */}
        <div className="lg:col-span-2">
          <h1 className="text-xl font-semibold text-slate-800">
            แก้ไขสาขาวิชา {dept.nameTh}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{dept.nameEn}</p>
        </div>

        {/* Body — left */}
        <div className="mt-6">
          <DepartmentForm
            mode="edit"
            deptId={dept.id}
            initial={initial}
          />
        </div>

        {/* Body — right (lifecycle sidebar) */}
        <aside className="mt-6 lg:sticky lg:top-24 lg:self-start">
          <DepartmentLifecyclePanel
            deptId={dept.id}
            deptNameTh={dept.nameTh}
            isActive={dept.isActive}
            blockers={blockers}
          />
        </aside>
      </div>
    </div>
  );
}
