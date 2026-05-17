import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getVerificationProgramIds,
  getVerificationQueue,
} from '@/lib/data/verifications';
import { SEMESTER_LABEL, VERIFICATION_DECISION } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

export default async function VerificationDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const programIds = getVerificationProgramIds(profile);
  const items = await getVerificationQueue(programIds);
  const pendingCount = items.filter((i) =>
    ['assessed', 'verification_review'].includes(i.offering.status),
  ).length;
  const verifiedCount = items.filter((i) => i.offering.status === 'verified').length;
  const followUpCount = items.filter(
    (i) => i.offering.status === 'needs_follow_up',
  ).length;

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-slate-800">
          รายการรับรองผลการทวนสอบ
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          รายวิชาที่ผู้ทวนสอบลงนามแล้ว เพื่อรอคณะกรรมการตรวจรับรองผลขั้นสุดท้าย
        </p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <SummaryBox label="รอดำเนินการ" value={pendingCount} />
        <SummaryBox label="รับรองผลแล้ว" value={verifiedCount} />
        <SummaryBox label="ต้องติดตาม" value={followUpCount} />
      </div>

      {items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีรายวิชาที่รอรับรองผล
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">รหัสวิชา</th>
                <th className="px-4 py-3 font-medium">ชื่อรายวิชา</th>
                <th className="px-4 py-3 font-medium">ปี/ภาค</th>
                <th className="px-4 py-3 font-medium">คะแนนทวนสอบ</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">ผลรับรอง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(({ offering, assessment, latestVerification }) => (
                <tr key={offering.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/verification/${offering.id}`}
                      className="font-medium text-mfu-primary hover:underline"
                    >
                      {offering.courseCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {offering.courseNameTh}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {offering.academicYear} {SEMESTER_LABEL[offering.semester]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {assessment
                      ? `${assessment.totalScore}/${assessment.maxScore} (${assessment.percentScore}%)`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={offering.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {latestVerification
                      ? VERIFICATION_DECISION[latestVerification.decision].labelTh
                      : 'ยังไม่บันทึก'}
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

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}
