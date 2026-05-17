import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgram } from '@/lib/data/programs';
import { getCoursesForProgram } from '@/lib/data/courses';
import { getAllUsers } from '@/lib/data/users';
import OfferingForm from '@/components/OfferingForm';

export const dynamic = 'force-dynamic';

export default async function NewOfferingPage({
  params,
}: {
  params: { programId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const program = await getProgram(params.programId);
  if (!program) notFound();
  const allowed =
    profile.roles.isAdmin || profile.roles.directorOf?.includes(program.id);
  if (!allowed) notFound();

  const [courses, users] = await Promise.all([
    getCoursesForProgram(program.id),
    getAllUsers(),
  ]);

  return (
    <div>
      <Link
        href={`/admin/programs/${program.id}/offerings`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้ารายวิชาที่เปิดสอน
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">
        เพิ่มรายวิชาที่เปิดสอน — {program.code}
      </h1>
      <div className="mt-6">
        <OfferingForm
          mode="create"
          programId={program.id}
          courses={courses.map((c) => ({
            id: c.id,
            code: c.code,
            nameTh: c.nameTh,
          }))}
          lecturers={users.map((u) => ({
            id: u.id,
            nameTh: u.nameTh,
            email: u.email,
          }))}
          plos={(program.plos ?? []).map((p) => ({
            ploNumber: p.ploNumber,
            descriptionTh: p.descriptionTh,
          }))}
        />
      </div>
    </div>
  );
}
