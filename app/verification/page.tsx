import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getVerificationProgramIds,
  getVerificationQueue,
  type VerificationQueueItem,
} from '@/lib/data/verifications';
import { SEMESTER_LABEL, VERIFICATION_DECISION } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import type { Semester } from '@/lib/types/models';

export const dynamic = 'force-dynamic';

const YEAR_CLASS =
  'rounded-xl border border-l-4 border-[#00704A]/20 border-l-[#00704A] bg-[#00704A]/[0.04]';
const YEAR_TEXT = 'text-[#00704A]';
const INNER_CARD_CLASS = 'rounded-lg border border-slate-200 bg-white';
const TABLE_WRAPPER_CLASS =
  'overflow-x-auto rounded-b-lg border-t border-slate-100';
const VERIFICATION_TABLE_CLASS = 'min-w-[760px] w-full table-fixed text-xs';
const TABLE_HEADER_ROW_CLASS =
  'bg-slate-50 text-left text-[11px] font-medium text-slate-500';
const TABLE_HEAD_CELL_CLASS = 'px-3 py-2';
const TABLE_CELL_CLASS = 'px-3 py-1.5 align-middle';

interface SemesterGroup {
  sem: Semester;
  items: VerificationQueueItem[];
}
interface YearGroup {
  year: number;
  semesters: SemesterGroup[];
  count: number;
}

function groupByYear(items: VerificationQueueItem[]): YearGroup[] {
  const byYear = new Map<number, Map<Semester, VerificationQueueItem[]>>();
  for (const item of items) {
    const y = item.offering.academicYear;
    const s = item.offering.semester as Semester;
    if (!byYear.has(y)) byYear.set(y, new Map());
    const semMap = byYear.get(y)!;
    if (!semMap.has(s)) semMap.set(s, []);
    semMap.get(s)!.push(item);
  }
  return [...byYear.keys()]
    .sort((a, b) => b - a)
    .map((year) => {
      const semMap = byYear.get(year)!;
      const semesters: SemesterGroup[] = [...semMap.keys()]
        .sort((a, b) => Number(b) - Number(a))
        .map((sem) => ({ sem, items: semMap.get(sem)! }));
      const count = semesters.reduce((n, s) => n + s.items.length, 0);
      return { year, semesters, count };
    });
}

export default async function VerificationDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const programIds = getVerificationProgramIds(profile);
  const items = await getVerificationQueue(programIds);

  const total = items.length;
  const assessedOnly = items.filter((i) => i.offering.status === 'assessed').length;
  const inReview = items.filter((i) => i.offering.status === 'verification_review').length;
  const verified = items.filter((i) => i.offering.status === 'verified').length;
  const followUp = items.filter((i) => i.offering.status === 'needs_follow_up').length;

  const pct = (n: number) =>
    total > 0 ? `${Math.round((n / total) * 100)}%` : '—';

  const groups = groupByYear(items);

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

      {/* KPI strip */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="รายวิชาทั้งหมด" value={String(total)} detail="ในคิวรับรองผล" />
        <MetricCard label="รอรับรอง" value={String(assessedOnly)} detail={pct(assessedOnly)} />
        <MetricCard label="อยู่ระหว่างพิจารณา" value={String(inReview)} detail={pct(inReview)} />
        <MetricCard label="รับรองผลแล้ว" value={String(verified)} detail={pct(verified)} />
        <MetricCard label="ต้องติดตามผล" value={String(followUp)} detail={pct(followUp)} />
      </div>

      {groups.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ยังไม่มีรายวิชาที่รอรับรองผล
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.map((g) => (
            <section key={g.year} className={YEAR_CLASS}>
              {/* Year header */}
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className={`text-base font-semibold ${YEAR_TEXT}`}>
                  ปีการศึกษา {g.year}
                </h2>
                <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {g.count} รายวิชา
                </span>
              </div>

              {/* Semester groups */}
              <div className="space-y-4 px-3 pb-3">
                {g.semesters.map((s) => (
                  <div key={s.sem}>
                    <h3 className="mb-1 text-xs font-semibold text-slate-500">
                      {SEMESTER_LABEL[s.sem]}
                    </h3>
                    <div className={INNER_CARD_CLASS}>
                      <div className={TABLE_WRAPPER_CLASS}>
                        <table className={VERIFICATION_TABLE_CLASS}>
                          <colgroup>
                            <col className="w-[14%]" />
                            <col />
                            <col className="w-[18%]" />
                            <col className="w-[17%]" />
                            <col className="w-[15%]" />
                            <col className="w-[16%]" />
                          </colgroup>
                          <thead>
                            <tr className={TABLE_HEADER_ROW_CLASS}>
                              <th className={TABLE_HEAD_CELL_CLASS}>รหัสวิชา</th>
                              <th className={TABLE_HEAD_CELL_CLASS}>ชื่อรายวิชา</th>
                              <th className={TABLE_HEAD_CELL_CLASS}>ผู้ทวนสอบ</th>
                              <th className={TABLE_HEAD_CELL_CLASS}>คะแนนทวนสอบ</th>
                              <th className={TABLE_HEAD_CELL_CLASS}>สถานะ</th>
                              <th className={TABLE_HEAD_CELL_CLASS}>ผลรับรอง</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {s.items.map(({ offering, assessment, latestVerification }) => (
                              <tr key={offering.id} className="hover:bg-slate-50">
                                <td className={`${TABLE_CELL_CLASS} whitespace-nowrap`}>
                                  <Link
                                    href={`/verification/${offering.id}`}
                                    className="font-medium text-mfu-primary hover:underline"
                                  >
                                    {offering.courseCode}
                                  </Link>
                                </td>
                                <td className={`${TABLE_CELL_CLASS} min-w-0 text-slate-700`}>
                                  <div className="truncate" title={offering.courseNameTh}>
                                    {offering.courseNameTh}
                                  </div>
                                </td>
                                <td className={`${TABLE_CELL_CLASS} min-w-0 text-slate-600`}>
                                  <div
                                    className="truncate"
                                    title={assessment?.assessorName ?? undefined}
                                  >
                                    {assessment?.assessorName ?? '—'}
                                  </div>
                                </td>
                                <td className={`${TABLE_CELL_CLASS} whitespace-nowrap text-slate-600`}>
                                  {assessment
                                    ? `${assessment.totalScore}/${assessment.maxScore} (${assessment.percentScore}%)`
                                    : '—'}
                                </td>
                                <td className={`${TABLE_CELL_CLASS} whitespace-nowrap`}>
                                  <StatusBadge status={offering.status} />
                                </td>
                                <td className={`${TABLE_CELL_CLASS} whitespace-nowrap text-slate-600`}>
                                  {latestVerification
                                    ? VERIFICATION_DECISION[latestVerification.decision].labelTh
                                    : 'ยังไม่บันทึก'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}
