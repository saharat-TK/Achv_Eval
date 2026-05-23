import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllDepartments } from '@/lib/data/departments';
import AcademicProgramForm from '@/components/AcademicProgramForm';

export const dynamic = 'force-dynamic';

export default async function NewAcademicProgramPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const departments = await getAllDepartments();

  return (
    <div>
      <Link
        href="/admin/academic-programs"
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้าหลักสูตร
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">
        เพิ่มหลักสูตรใหม่
      </h1>
      <div className="mt-6">
        <AcademicProgramForm
          mode="create"
          departments={departments.map((d) => ({
            id: d.id,
            nameTh: d.nameTh,
            isActive: d.isActive,
          }))}
        />
      </div>
    </div>
  );
}
