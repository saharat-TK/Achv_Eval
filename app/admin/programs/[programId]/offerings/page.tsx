import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getProgram } from '@/lib/data/programs';
import { getOfferingsForProgram } from '@/lib/data/offerings';
import CloneOfferingsPanel from '@/components/CloneOfferingsPanel';
import StatusBadge from '@/components/StatusBadge';
import { SEMESTER_LABEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function ProgramOfferingsPage({
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

  const offerings = await getOfferingsForProgram(program.id);
  const base = `/admin/programs/${program.id}/offerings`;

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
            รายวิชาที่เปิดสอน — {program.code}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{program.nameTh}</p>
        </div>
        <Link
          href={`${base}/new`}
          className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + เพิ่มรายวิชาที่เปิดสอน
        </Link>
      </div>

      <div className="mt-6">
        <CloneOfferingsPanel programId={program.id} />
      </div>

      {offerings.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีรายวิชาที่เปิดสอน
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">ปี/ภาค</th>
                <th className="px-4 py-3 font-medium">รหัสวิชา</th>
                <th className="px-4 py-3 font-medium">ชื่อวิชา</th>
                <th className="px-4 py-3 font-medium">ตอน</th>
                <th className="px-4 py-3 font-medium">อาจารย์ผู้รับผิดชอบ</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offerings.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">
                    {o.academicYear}/{SEMESTER_LABEL[o.semester]}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`${base}/${o.id}`}
                      className="font-medium text-mfu-primary hover:underline"
                    >
                      {o.courseCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{o.courseNameTh}</td>
                  <td className="px-4 py-3 text-slate-600">{o.section}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {o.lecturerEmail ?? '— ยังไม่กำหนด —'}
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
