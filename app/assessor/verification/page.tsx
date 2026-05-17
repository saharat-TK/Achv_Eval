import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getOfferingsPendingVerification } from '@/lib/data/implementationReviews';
import { SEMESTER_LABEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function VerificationQueuePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const items = await getOfferingsPendingVerification(profile.roles.assessorOf);

  return (
    <div>
      <Link href="/assessor" className="text-sm text-slate-500 hover:underline">
        ← กลับไปหน้ารายการทวนสอบ
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-slate-800">
        การทวนสอบการนำไปปฏิบัติ (ภาคการศึกษาถัดไป)
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        รายวิชาที่ลงนามทวนสอบแล้ว และรอคณะกรรมการติดตามว่าได้นำข้อเสนอแนะ
        ไปปรับปรุงในการเปิดสอนภาคถัดไปหรือไม่
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">
          ไม่พบรายวิชาที่รอการทวนสอบการนำไปปฏิบัติในขณะนี้
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">รหัสวิชา</th>
                <th className="px-4 py-2">ชื่อรายวิชา</th>
                <th className="px-4 py-2">ปี/ภาคที่ทวนสอบ</th>
                <th className="px-4 py-2">ผลการทวนสอบ</th>
                <th className="px-4 py-2">ภาคถัดไป</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(({ offering, assessment, nextOffering }) => (
                <tr key={offering.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {offering.courseCode}
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {offering.courseNameTh}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {offering.academicYear} {SEMESTER_LABEL[offering.semester]}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {assessment
                      ? `${assessment.totalScore}/${assessment.maxScore} (${assessment.percentScore}%)`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {nextOffering ? (
                      <span className="text-green-700">
                        {nextOffering.academicYear}{' '}
                        {SEMESTER_LABEL[nextOffering.semester]}
                      </span>
                    ) : (
                      <span className="text-slate-400">ยังไม่เปิดสอน</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/assessor/verification/${offering.id}`}
                      className="text-sm text-mfu-primary hover:underline"
                    >
                      ทวนสอบ →
                    </Link>
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
