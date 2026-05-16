import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgram } from '@/lib/data/programs';
import CourseForm from '@/components/CourseForm';

export const dynamic = 'force-dynamic';

export default async function NewCoursePage({
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

  return (
    <div>
      <Link
        href={`/admin/programs/${program.id}/courses`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้ารายวิชา
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">
        เพิ่มรายวิชา — {program.code}
      </h1>
      <div className="mt-6">
        <CourseForm mode="create" programId={program.id} />
      </div>
    </div>
  );
}
