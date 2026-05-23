import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllDepartments } from '@/lib/data/departments';
import { getAllAcademicPrograms } from '@/lib/data/academicPrograms';
import ProgramForm from '@/components/ProgramForm';
import type { ProgramFormData } from '@/app/admin/programs/actions';

export const dynamic = 'force-dynamic';

export default async function NewProgramPage({
  searchParams,
}: {
  searchParams: { program?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  // Only admins create curriculum revisions.
  if (!profile.roles.isAdmin) redirect('/admin');

  const [departments, academicPrograms] = await Promise.all([
    getAllDepartments(),
    getAllAcademicPrograms(),
  ]);

  // Prefill the parent program (and inherit its department) when arriving
  // from a program's "+ เพิ่มฉบับปรับปรุง" button.
  const parent = searchParams.program
    ? academicPrograms.find((p) => p.id === searchParams.program)
    : undefined;
  const initial: ProgramFormData | undefined = parent
    ? {
        code: '',
        nameTh: '',
        nameEn: '',
        school: 'Health Science',
        level: parent.level,
        ploDomainSchema: '6_domain_tqf',
        isActive: true,
        departmentId: parent.departmentId ?? null,
        parentProgramId: parent.id,
        plos: [],
      }
    : undefined;

  return (
    <div>
      <Link
        href={
          parent ? `/admin/academic-programs/${parent.id}` : '/admin'
        }
        className="text-sm text-slate-500 hover:underline"
      >
        ← {parent ? 'กลับไปหน้าหลักสูตร' : 'กลับไปหน้ารายการ'}
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">
        เพิ่มฉบับปรับปรุงใหม่
        {parent && (
          <span className="ml-2 text-base font-normal text-slate-500">
            ในหลักสูตร {parent.code}
          </span>
        )}
      </h1>
      <div className="mt-6">
        <ProgramForm
          mode="create"
          initial={initial}
          departments={departments.map((d) => ({
            id: d.id,
            nameTh: d.nameTh,
            isActive: d.isActive,
          }))}
          parentPrograms={academicPrograms.map((p) => ({
            id: p.id,
            code: p.code,
            nameTh: p.nameTh,
          }))}
        />
      </div>
    </div>
  );
}
