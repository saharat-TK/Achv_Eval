import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllPrograms, getProgramsByIds } from '@/lib/data/programs';
import { getCourseCountsByProgram } from '@/lib/data/courses';
import { getDepartmentMap } from '@/lib/data/departments';
import { PROGRAM_LEVEL_LABEL, PLO_SCHEMA_LABEL } from '@/lib/constants';
import ProgramAreaTabs from '@/components/ProgramAreaTabs';
import type { ProgramDoc } from '@/lib/types/models';

export const dynamic = 'force-dynamic';

type ProgramWithId = ProgramDoc & { id: string };

interface Section {
  /** Stable key for React. */
  key: string;
  titleTh: string;
  titleEn?: string;
  /** Render the title in red when this section is for dangling refs. */
  isWarning?: boolean;
  programs: ProgramWithId[];
}

export default async function AdminProgramsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isAdmin = profile.roles.isAdmin;
  const programs = isAdmin
    ? await getAllPrograms()
    : await getProgramsByIds(profile.roles.directorOf ?? []);
  const courseCounts = await getCourseCountsByProgram(programs.map((p) => p.id));
  const deptMap = await getDepartmentMap(
    programs.map((p) => p.departmentId).filter((id): id is string => !!id),
  );

  // ----- Group programs into sections by department -----------------
  const byDept: Record<string, ProgramWithId[]> = {};
  const unassigned: ProgramWithId[] = [];
  const dangling: ProgramWithId[] = [];

  for (const p of programs) {
    if (!p.departmentId) {
      unassigned.push(p);
    } else if (deptMap[p.departmentId]) {
      (byDept[p.departmentId] ||= []).push(p);
    } else {
      dangling.push(p);
    }
  }

  // Programs within a section: sort by program.code DESC (largest first).
  const sortByCodeDesc = (a: ProgramWithId, b: ProgramWithId) =>
    b.code.localeCompare(a.code);

  // Real departments first, sorted alphabetically by nameTh.
  const realSections: Section[] = Object.entries(byDept)
    .map(([deptId, ps]) => ({
      key: deptId,
      titleTh: deptMap[deptId].nameTh,
      titleEn: deptMap[deptId].nameEn,
      programs: ps.sort(sortByCodeDesc),
    }))
    .sort((a, b) => a.titleTh.localeCompare(b.titleTh, 'th'));

  const sections: Section[] = [...realSections];
  if (unassigned.length > 0) {
    sections.push({
      key: '_unassigned',
      titleTh: 'ไม่ระบุสาขาวิชา',
      programs: unassigned.sort(sortByCodeDesc),
    });
  }
  if (dangling.length > 0) {
    sections.push({
      key: '_dangling',
      titleTh: 'สาขาวิชาที่ถูกลบ',
      isWarning: true,
      programs: dangling.sort(sortByCodeDesc),
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">เล่มหลักสูตร</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? 'จัดการเล่มหลักสูตร (curriculum) ทั้งหมดในระบบ'
              : 'เล่มหลักสูตรที่ท่านเป็นประธาน'}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/programs/new"
            className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + เพิ่มเล่มหลักสูตร
          </Link>
        )}
      </div>

      {isAdmin && <ProgramAreaTabs current="curriculum" />}

      {programs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีเล่มหลักสูตร
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={section.key}>
              <div className="flex items-end justify-between gap-3 pb-2">
                <div>
                  <h2
                    className={`text-base font-semibold ${
                      section.isWarning ? 'text-red-600' : 'text-slate-800'
                    }`}
                  >
                    {section.titleTh}
                  </h2>
                  {section.titleEn && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {section.titleEn}
                    </p>
                  )}
                </div>
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
                      <th className="whitespace-nowrap px-3 py-3 font-medium">
                        โครงสร้าง PLO
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-center font-medium">
                        จำนวน PLO
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-center font-medium">
                        จำนวนรายวิชา
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {section.programs.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-3">
                          <Link
                            href={`/admin/programs/${p.id}`}
                            className="font-medium text-mfu-primary hover:underline"
                          >
                            {p.code}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{p.nameTh}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {PROGRAM_LEVEL_LABEL[p.level]}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {PLO_SCHEMA_LABEL[p.ploDomainSchema]}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center text-slate-600">
                          {p.plos?.length ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center text-slate-600">
                          {courseCounts[p.id] ?? 0}
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
