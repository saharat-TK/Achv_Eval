import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgram } from '@/lib/data/programs';
import { getCourse } from '@/lib/data/courses';
import CourseForm from '@/components/CourseForm';
import type { CourseFormData } from '@/app/admin/programs/[programId]/courses/actions';

export const dynamic = 'force-dynamic';

export default async function EditCoursePage({
  params,
}: {
  params: { programId: string; courseId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const program = await getProgram(params.programId);
  if (!program) notFound();
  const allowed =
    profile.roles.isAdmin || profile.roles.directorOf?.includes(program.id);
  if (!allowed) notFound();

  const course = await getCourse(params.courseId);
  if (!course || course.programId !== program.id) notFound();

  const initial: CourseFormData = {
    code: course.code,
    nameTh: course.nameTh,
    nameEn: course.nameEn,
    creditStructure: course.creditStructure,
    type: course.type,
    yearOfStudy: course.yearOfStudy ?? null,
    semester: course.semester ?? null,
    isActive: course.isActive,
  };

  return (
    <div>
      <Link
        href={`/admin/programs/${program.id}/courses`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้ารายวิชา
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">
        แก้ไขรายวิชา {course.code}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{course.nameTh}</p>
      <div className="mt-6">
        <CourseForm
          mode="edit"
          programId={program.id}
          courseId={course.id}
          initial={initial}
        />
      </div>
    </div>
  );
}
