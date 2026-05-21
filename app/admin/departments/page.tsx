import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getAllDepartments,
  getProgramCountsByDepartment,
} from '@/lib/data/departments';

export const dynamic = 'force-dynamic';

export default async function AdminDepartmentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.roles.isAdmin) redirect('/admin');

  const departments = await getAllDepartments();
  const programCounts = await getProgramCountsByDepartment(
    departments.map((d) => d.id),
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">สาขาวิชา</h1>
          <p className="mt-1 text-sm text-slate-500">
            จัดการสาขาวิชาทั้งหมดในระบบ — หลักสูตรหนึ่งหลักสูตรสังกัด
            หนึ่งสาขาวิชา
          </p>
        </div>
        <Link
          href="/admin/departments/new"
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + เพิ่มสาขาวิชา
        </Link>
      </div>

      {departments.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีสาขาวิชา
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">ชื่อสาขาวิชา (ไทย)</th>
                <th className="px-4 py-3 font-medium">ชื่อสาขาวิชา (อังกฤษ)</th>
                <th className="px-4 py-3 font-medium">จำนวนหลักสูตร</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departments.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/departments/${d.id}`}
                      className="font-medium text-mfu-primary hover:underline"
                    >
                      {d.nameTh}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{d.nameEn}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {programCounts[d.id] ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    {d.isActive ? (
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
