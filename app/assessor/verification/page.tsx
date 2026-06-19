import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getOfferingsPendingVerification } from '@/lib/data/implementationReviews';
import { isCommitteeSignOff, SEMESTER_LABEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const TABLE_CARD_CLASS = 'mt-4 rounded-lg border border-slate-200 bg-white';
const TABLE_WRAPPER_CLASS =
  'overflow-x-auto rounded-b-lg border-t border-slate-100';
const VERIFICATION_TABLE_CLASS = 'min-w-[760px] w-full table-fixed text-xs';
const TABLE_HEADER_ROW_CLASS =
  'bg-slate-50 text-left text-[11px] font-medium text-slate-500';
const TABLE_HEAD_CELL_CLASS = 'px-3 py-2';
const TABLE_CELL_CLASS = 'px-3 py-1.5 align-middle';

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
        <div className={TABLE_CARD_CLASS}>
          <div className={TABLE_WRAPPER_CLASS}>
            <table className={VERIFICATION_TABLE_CLASS}>
              <colgroup>
                <col className="w-[14%]" />
                <col />
                <col className="w-[18%]" />
                <col className="w-[17%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className={TABLE_HEADER_ROW_CLASS}>
                  <th className={TABLE_HEAD_CELL_CLASS}>รหัสวิชา</th>
                  <th className={TABLE_HEAD_CELL_CLASS}>ชื่อรายวิชา</th>
                  <th className={TABLE_HEAD_CELL_CLASS}>ปี/ภาคที่ทวนสอบ</th>
                  <th className={TABLE_HEAD_CELL_CLASS}>ผลการทวนสอบ</th>
                  <th className={TABLE_HEAD_CELL_CLASS}>ภาคถัดไป</th>
                  <th className={TABLE_HEAD_CELL_CLASS}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(({ offering, assessment, nextOffering }) => (
                  <tr key={offering.id} className="transition-colors hover:bg-slate-50">
                    <td className={`${TABLE_CELL_CLASS} whitespace-nowrap font-medium text-slate-800`}>
                      {offering.courseCode}
                    </td>
                    <td className={`${TABLE_CELL_CLASS} min-w-0 text-slate-700`}>
                      <div className="truncate" title={offering.courseNameTh}>
                        {offering.courseNameTh}
                      </div>
                    </td>
                    <td className={`${TABLE_CELL_CLASS} whitespace-nowrap text-slate-600`}>
                      {offering.academicYear} {SEMESTER_LABEL[offering.semester]}
                    </td>
                    <td className={`${TABLE_CELL_CLASS} whitespace-nowrap text-slate-600`}>
                      {assessment && isCommitteeSignOff(assessment.signOffKind)
                        ? `${assessment.totalScore}/${assessment.maxScore} (${assessment.percentScore}%)`
                        : '—'}
                    </td>
                    <td className={`${TABLE_CELL_CLASS} whitespace-nowrap`}>
                      {nextOffering ? (
                        <span className="text-green-700">
                          {nextOffering.academicYear}{' '}
                          {SEMESTER_LABEL[nextOffering.semester]}
                        </span>
                      ) : (
                        <span className="text-slate-400">ยังไม่เปิดสอน</span>
                      )}
                    </td>
                    <td className={`${TABLE_CELL_CLASS} whitespace-nowrap`}>
                      <Link
                        href={`/assessor/verification/${offering.id}`}
                        className="text-mfu-primary hover:underline"
                      >
                        ทวนสอบ →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
