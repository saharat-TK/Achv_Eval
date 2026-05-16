import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/firebase/auth-server';
import { getOfferingsForLecturer } from '@/lib/data/offerings';
import StatusBadge from '@/components/StatusBadge';
import { SEMESTER_LABEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function LecturerDashboard() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const offerings = await getOfferingsForLecturer(user.uid);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800">รายวิชาที่รับผิดชอบ</h1>
      <p className="mt-1 text-sm text-slate-500">
        รายวิชาที่ได้รับมอบหมายให้ท่านเป็นอาจารย์ผู้รับผิดชอบ
      </p>

      {offerings.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-sm text-slate-500">
            ยังไม่มีรายวิชาที่ได้รับมอบหมาย
          </p>
          <p className="mt-2 text-xs text-slate-400">
            ผู้ดูแลระบบหรือประธานหลักสูตรจะเป็นผู้มอบหมายรายวิชาให้ท่าน
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">รหัสวิชา</th>
                <th className="px-4 py-3 font-medium">ชื่อรายวิชา</th>
                <th className="px-4 py-3 font-medium">ปี/ภาค</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offerings.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/lecturer/${o.id}`}
                      className="font-medium text-mfu-primary hover:underline"
                    >
                      {o.courseCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{o.courseNameTh}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {o.academicYear}/{SEMESTER_LABEL[o.semester]}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
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
