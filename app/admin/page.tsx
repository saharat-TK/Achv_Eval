import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllPrograms, getProgramsByIds } from '@/lib/data/programs';
import { getCourseCountsByProgram } from '@/lib/data/courses';
import { PROGRAM_LEVEL_LABEL, PLO_SCHEMA_LABEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function AdminProgramsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isAdmin = profile.roles.isAdmin;
  const programs = isAdmin
    ? await getAllPrograms()
    : await getProgramsByIds(profile.roles.directorOf ?? []);
  const courseCounts = await getCourseCountsByProgram(programs.map((p) => p.id));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">หลักสูตร</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? 'จัดการหลักสูตรทั้งหมดในระบบ'
              : 'หลักสูตรที่ท่านเป็นประธาน'}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/programs/new"
            className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + เพิ่มหลักสูตร
          </Link>
        )}
      </div>

      {programs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีหลักสูตร
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">รหัส</th>
                <th className="px-4 py-3 font-medium">ชื่อหลักสูตร</th>
                <th className="px-4 py-3 font-medium">ระดับ</th>
                <th className="px-4 py-3 font-medium">โครงสร้าง PLO</th>
                <th className="px-4 py-3 font-medium">จำนวน PLO</th>
                <th className="px-4 py-3 font-medium">จำนวนรายวิชา</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programs.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/programs/${p.id}`}
                      className="font-medium text-mfu-primary hover:underline"
                    >
                      {p.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{p.nameTh}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {PROGRAM_LEVEL_LABEL[p.level]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {PLO_SCHEMA_LABEL[p.ploDomainSchema]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.plos?.length ?? 0}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {courseCounts[p.id] ?? 0}
                  </td>
                  <td className="px-4 py-3">
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
      )}
    </div>
  );
}
