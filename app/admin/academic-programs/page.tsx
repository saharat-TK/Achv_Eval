import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getAllAcademicPrograms,
  getCurriculumCountsByProgram,
} from '@/lib/data/academicPrograms';
import { getDepartmentMap } from '@/lib/data/departments';
import { PROGRAM_LEVEL_LABEL } from '@/lib/constants';
import ProgramAreaTabs from '@/components/ProgramAreaTabs';
import type { AcademicProgramWithId } from '@/lib/data/academicPrograms';

export const dynamic = 'force-dynamic';

interface Section {
  key: string;
  titleTh: string;
  isWarning?: boolean;
  programs: AcademicProgramWithId[];
}

export default async function AdminAcademicProgramsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const programs = await getAllAcademicPrograms();
  const [curriculumCounts, deptMap] = await Promise.all([
    getCurriculumCountsByProgram(programs.map((p) => p.id)),
    getDepartmentMap(
      programs.map((p) => p.departmentId).filter((id): id is string => !!id),
    ),
  ]);

  // Group by department.
  const byDept: Record<string, AcademicProgramWithId[]> = {};
  const unassigned: AcademicProgramWithId[] = [];
  for (const p of programs) {
    if (p.departmentId && deptMap[p.departmentId]) {
      (byDept[p.departmentId] ||= []).push(p);
    } else {
      unassigned.push(p);
    }
  }
  const sections: Section[] = Object.entries(byDept)
    .map(([deptId, ps]) => ({
      key: deptId,
      titleTh: deptMap[deptId].nameTh,
      programs: ps.sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.titleTh.localeCompare(b.titleTh, 'th'));
  if (unassigned.length > 0) {
    sections.push({
      key: '_unassigned',
      titleTh: 'ไม่ระบุสาขาวิชา',
      programs: unassigned.sort((a, b) => a.code.localeCompare(b.code)),
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">หลักสูตร</h1>
          <p className="mt-1 text-sm text-slate-500">
            จัดการหลักสูตรในแต่ละสาขาวิชา — แต่ละหลักสูตรมีเล่มหลักสูตร
            (curriculum) ได้หลายเล่ม
          </p>
        </div>
        <Link
          href="/admin/academic-programs/new"
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + เพิ่มหลักสูตร
        </Link>
      </div>

      <ProgramAreaTabs current="program" />

      {programs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีหลักสูตร
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={section.key}>
              <div className="flex items-end justify-between gap-3 pb-2">
                <h2 className="text-base font-semibold text-slate-800">
                  {section.titleTh}
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {section.programs.length} หลักสูตร
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">รหัส</th>
                      <th className="w-full px-3 py-3 font-medium">ชื่อหลักสูตร</th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">ระดับ</th>
                      <th className="whitespace-nowrap px-3 py-3 text-center font-medium">
                        เล่มหลักสูตร
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {section.programs.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-3">
                          <Link
                            href={`/admin/academic-programs/${p.id}`}
                            className="font-medium text-mfu-primary hover:underline"
                          >
                            {p.code}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{p.nameTh}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {PROGRAM_LEVEL_LABEL[p.level]}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center text-slate-600">
                          {curriculumCounts[p.id] ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {p.isActive ? (
                            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                              กำลังใช้งาน
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                              ปิดใช้งาน
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
