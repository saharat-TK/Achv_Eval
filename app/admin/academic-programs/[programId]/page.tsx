import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAcademicProgram } from '@/lib/data/academicPrograms';
import { getCurriculumsForProgram } from '@/lib/data/programs';
import { getAllDepartments } from '@/lib/data/departments';
import AcademicProgramForm from '@/components/AcademicProgramForm';
import AcademicProgramLifecyclePanel from '@/components/AcademicProgramLifecyclePanel';
import {
  checkAcademicProgramBlockers,
  type AcademicProgramFormData,
} from '@/app/admin/academic-programs/actions';

export const dynamic = 'force-dynamic';

export default async function EditAcademicProgramPage({
  params,
}: {
  params: { programId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const program = await getAcademicProgram(params.programId);
  if (!program) notFound();

  const [curriculums, departments, blockersRes] = await Promise.all([
    getCurriculumsForProgram(program.id),
    getAllDepartments(),
    checkAcademicProgramBlockers(program.id),
  ]);

  const initial: AcademicProgramFormData = {
    code: program.code,
    nameTh: program.nameTh,
    nameEn: program.nameEn,
    level: program.level,
    departmentId: program.departmentId ?? null,
    isActive: program.isActive,
  };
  const blockers = blockersRes.ok
    ? blockersRes.blockers
    : { curriculumsCount: 0 };
  const curriculumBase = `/admin/programs`;

  return (
    <div>
      <Link
        href="/admin/academic-programs"
        className="text-sm text-slate-500 hover:underline"
      >
        ← กลับไปหน้าหลักสูตร
      </Link>

      <div className="mt-3 grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_256px]">
        <div className="lg:col-span-2">
          <h1 className="text-xl font-semibold text-slate-800">
            แก้ไขหลักสูตร {program.code}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{program.nameTh}</p>
        </div>

        {/* Left: edit form + curriculum list */}
        <div className="mt-6 space-y-6">
          <AcademicProgramForm
            mode="edit"
            programId={program.id}
            initial={initial}
            departments={departments.map((d) => ({
              id: d.id,
              nameTh: d.nameTh,
              isActive: d.isActive,
            }))}
          />

          {/* Curriculum revisions under this program */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                เล่มหลักสูตร (Curriculum)
              </h2>
              <Link
                href={`${curriculumBase}/new?program=${program.id}`}
                className="rounded-lg bg-mfu-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                + เพิ่มเล่มหลักสูตร
              </Link>
            </div>

            {curriculums.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                ยังไม่มีเล่มหลักสูตรในหลักสูตรนี้
              </div>
            ) : (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">รหัส</th>
                      <th className="w-full px-3 py-3 font-medium">ชื่อเล่มหลักสูตร</th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {curriculums.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-3">
                          <Link
                            href={`${curriculumBase}/${c.id}`}
                            className="font-medium text-mfu-primary hover:underline"
                          >
                            {c.code}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{c.nameTh}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs">
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
          </section>
        </div>

        {/* Right: lifecycle sidebar */}
        <aside className="mt-6 lg:sticky lg:top-24 lg:self-start">
          <AcademicProgramLifecyclePanel
            programId={program.id}
            programNameTh={program.nameTh}
            isActive={program.isActive}
            blockers={blockers}
          />
        </aside>
      </div>
    </div>
  );
}
