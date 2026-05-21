import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgram } from '@/lib/data/programs';
import { getCoursesForProgram } from '@/lib/data/courses';
import CourseCsvUpload from '@/components/CourseCsvUpload';
import CoursesTable, { type CourseRow } from '@/components/CoursesTable';

export const dynamic = 'force-dynamic';

export default async function ProgramCoursesPage({
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

  const courses = await getCoursesForProgram(program.id);
  const base = `/admin/programs/${program.id}/courses`;
  const rows: CourseRow[] = courses.map((c) => ({
    id: c.id,
    code: c.code,
    nameTh: c.nameTh,
    creditStructure: c.creditStructure,
    type: c.type,
    yearOfStudy: c.yearOfStudy ?? null,
    semester: c.semester ?? null,
    isActive: c.isActive,
  }));

  return (
    <div>
      <Link
        href={`/admin/programs/${program.id}`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้าหลักสูตร
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            รายวิชาในหลักสูตร {program.code}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{program.nameTh}</p>
        </div>
        <Link
          href={`${base}/new`}
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + เพิ่มรายวิชา
        </Link>
      </div>

      <div className="mt-6">
        <CourseCsvUpload programId={program.id} />
      </div>

      {courses.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีรายวิชาในหลักสูตรนี้
        </div>
      ) : (
        <div className="mt-6">
          <CoursesTable
            courses={rows}
            programId={program.id}
            showBulkActions={profile.roles.isAdmin}
          />
        </div>
      )}
    </div>
  );
}
