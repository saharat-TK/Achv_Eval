import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgram } from '@/lib/data/programs';
import { getCoursesForProgram } from '@/lib/data/courses';
import CourseCsvUpload from '@/components/CourseCsvUpload';
import { COURSE_TYPE_LABEL } from '@/lib/constants';

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
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">รหัสวิชา</th>
                <th className="px-4 py-3 font-medium">ชื่อวิชา</th>
                <th className="px-4 py-3 font-medium">หน่วยกิต</th>
                <th className="px-4 py-3 font-medium">ประเภท</th>
                <th className="px-4 py-3 font-medium">ชั้นปี</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`${base}/${c.id}`}
                      className="font-medium text-mfu-primary hover:underline"
                    >
                      {c.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{c.nameTh}</td>
                  <td className="px-4 py-3 text-slate-600">{c.creditStructure}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {COURSE_TYPE_LABEL[c.type]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.yearOfStudy ? `ปี ${c.yearOfStudy}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.isActive ? (
                      <span className="text-green-700">เปิดใช้งาน</span>
                    ) : (
                      <span className="text-slate-400">ปิดใช้งาน</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
