import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllPrograms, getProgramsByIds } from '@/lib/data/programs';
import { getExecutiveDashboardData } from '@/lib/data/dashboard';
import { OFFERING_STATUS, SEMESTER_LABEL } from '@/lib/constants';
import type { AssessmentBand, OfferingStatus, Semester } from '@/lib/types/models';
import StatusBadge from '@/components/StatusBadge';
import DashboardTrends from '@/components/DashboardTrends';
import DashboardPdfButton from '@/components/DashboardPdfButton';

export const dynamic = 'force-dynamic';

const BAND_LABEL: Record<AssessmentBand, string> = {
  excellent: 'ดีเยี่ยม',
  good: 'ดี',
  improve: 'ควรปรับปรุง',
};

const STATUS_ORDER: OfferingStatus[] = [
  'draft',
  'documents_pending',
  'ready_for_ai',
  'ai_in_progress',
  'ai_complete',
  'assessor_review',
  'assessed',
  'verification_review',
  'verified',
  'needs_follow_up',
  'pending_review_next_semester',
  'implemented',
  'not_implemented',
];

function scoreText(score: number | null): string {
  return score === null ? '—' : `${score}%`;
}

function completionText(done: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((done / total) * 1000) / 10}%`;
}

function readSearchValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readAcademicYear(value: string | string[] | undefined): number | undefined {
  const raw = readSearchValue(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 2500 ? parsed : undefined;
}

function readSemester(value: string | string[] | undefined): Semester | undefined {
  const raw = readSearchValue(value);
  return raw === '1' || raw === '2' || raw === '3' ? raw : undefined;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: {
    programId?: string | string[];
    academicYear?: string | string[];
    semester?: string | string[];
  };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isAdmin = profile.roles.isAdmin;
  const programs = isAdmin
    ? await getAllPrograms()
    : await getProgramsByIds(profile.roles.directorOf ?? []);
  const selectedProgramId = readSearchValue(searchParams.programId);
  const selectedAcademicYear = readAcademicYear(searchParams.academicYear);
  const selectedSemester = readSemester(searchParams.semester);
  const programFilter = programs.some((program) => program.id === selectedProgramId)
    ? selectedProgramId
    : undefined;
  const data = await getExecutiveDashboardData(programs, {
    programId: programFilter,
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  });

  const visibleStatuses = STATUS_ORDER.filter(
    (status) => (data.statusCounts[status] ?? 0) > 0,
  );

  const exportParams = new URLSearchParams();
  if (programFilter) exportParams.set('programId', programFilter);
  if (selectedAcademicYear) {
    exportParams.set('academicYear', String(selectedAcademicYear));
  }
  if (selectedSemester) exportParams.set('semester', selectedSemester);
  const exportQuery = exportParams.toString();
  const exportHref = `/api/dashboard/export${exportQuery ? `?${exportQuery}` : ''}`;

  const reportContext = {
    programLabel: programFilter
      ? (programs.find((program) => program.id === programFilter)?.nameTh ??
        programFilter)
      : 'ทุกหลักสูตร',
    yearLabel: selectedAcademicYear ? String(selectedAcademicYear) : 'ทุกปี',
    semesterLabel: selectedSemester
      ? SEMESTER_LABEL[selectedSemester]
      : 'ทุกภาค',
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            แดชบอร์ดคุณภาพการทวนสอบ
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            ภาพรวมรายวิชา คะแนนทวนสอบ และรายการที่ควรติดตามในขอบเขตสิทธิ์ของคุณ
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <DashboardPdfButton data={data} context={reportContext} />
          <a
            href={exportHref}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-mfu-primary hover:bg-slate-50"
          >
            ส่งออก CSV
          </a>
          <Link
            href="/verification"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            รายการรับรองผล
          </Link>
        </div>
      </div>

      <form
        action="/admin/dashboard"
        className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1.3fr_0.8fr_0.8fr_auto]"
      >
        <label className="text-sm">
          <span className="text-xs font-medium text-slate-500">หลักสูตร</span>
          <select
            name="programId"
            defaultValue={programFilter ?? ''}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">ทุกหลักสูตร</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.code} — {program.nameTh}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="text-xs font-medium text-slate-500">ปีการศึกษา</span>
          <select
            name="academicYear"
            defaultValue={selectedAcademicYear ?? ''}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">ทุกปี</option>
            {data.availableAcademicYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="text-xs font-medium text-slate-500">ภาคการศึกษา</span>
          <select
            name="semester"
            defaultValue={selectedSemester ?? ''}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">ทุกภาค</option>
            {(Object.keys(SEMESTER_LABEL) as Semester[]).map((semester) => (
              <option key={semester} value={semester}>
                {SEMESTER_LABEL[semester]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-mfu-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            กรองข้อมูล
          </button>
          <Link
            href="/admin/dashboard"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ล้าง
          </Link>
        </div>
      </form>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <MetricCard
          label="หลักสูตรในขอบเขต"
          value={data.summary.totalPrograms.toLocaleString('th-TH')}
          detail={`${data.summary.totalOfferings.toLocaleString('th-TH')} รายวิชาเปิดสอน`}
        />
        <MetricCard
          label="วิเคราะห์ AI แล้ว"
          value={data.summary.aiCompleted.toLocaleString('th-TH')}
          detail={completionText(data.summary.aiCompleted, data.summary.totalOfferings)}
        />
        <MetricCard
          label="ลงนามทวนสอบแล้ว"
          value={data.summary.assessed.toLocaleString('th-TH')}
          detail={completionText(data.summary.assessed, data.summary.totalOfferings)}
        />
        <MetricCard
          label="คะแนนเฉลี่ย"
          value={scoreText(data.summary.averagePercentScore)}
          detail={
            data.summary.implementationRate === null
              ? 'ยังไม่มีผลติดตาม'
              : `นำไปปฏิบัติ ${data.summary.implementationRate}%`
          }
        />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-800">
          แนวโน้มข้ามภาคการศึกษา
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          ครอบคลุมทุกภาคการศึกษาในขอบเขตหลักสูตรที่เลือก (ไม่จำกัดด้วยตัวกรองปี/ภาค)
        </p>
        <div className="mt-3">
          <DashboardTrends trend={data.trend} />
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-800">
              ภาพรวมตามหลักสูตร
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">หลักสูตร</th>
                  <th className="px-4 py-3 font-medium">รายวิชา</th>
                  <th className="px-4 py-3 font-medium">AI</th>
                  <th className="px-4 py-3 font-medium">ทวนสอบ</th>
                  <th className="px-4 py-3 font-medium">รับรอง</th>
                  <th className="px-4 py-3 font-medium">ติดตาม</th>
                  <th className="px-4 py-3 font-medium">คะแนนเฉลี่ย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.programRows.map((program) => (
                  <tr key={program.programId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/programs/${program.programId}`}
                        className="font-medium text-mfu-primary hover:underline"
                      >
                        {program.code}
                      </Link>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {program.nameTh}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {program.totalOfferings}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{program.aiCompleted}</td>
                    <td className="px-4 py-3 text-slate-700">{program.assessed}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {program.finalVerified}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {program.needsFollowUp}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {scoreText(program.averagePercentScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-800">
              สถานะรายวิชา
            </h2>
            <div className="mt-3 space-y-2">
              {visibleStatuses.length === 0 ? (
                <p className="text-sm text-slate-500">ยังไม่มีข้อมูลรายวิชา</p>
              ) : (
                visibleStatuses.map((status) => (
                  <div
                    key={status}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-slate-600">
                      {OFFERING_STATUS[status].labelTh}
                    </span>
                    <span className="font-semibold text-slate-800">
                      {data.statusCounts[status]}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-800">
              ระดับผลทวนสอบ
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(Object.keys(BAND_LABEL) as AssessmentBand[]).map((band) => (
                <div key={band} className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{BAND_LABEL[band]}</div>
                  <div className="mt-1 text-xl font-semibold text-slate-800">
                    {data.bandCounts[band]}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-800">
              หัวข้อที่ควรจับตา
            </h2>
            <div className="mt-3 space-y-2">
              {data.weakestRubricItems.length === 0 ? (
                <p className="text-sm text-slate-500">ยังไม่มีคะแนนทวนสอบ</p>
              ) : (
                data.weakestRubricItems.map((item) => (
                  <div key={item.key} className="text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-700">
                        {item.number}. {item.labelTh}
                      </span>
                      <span className="font-semibold text-slate-800">
                        {item.averageScore}/3
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-mfu-primary"
                        style={{ width: `${(item.averageScore / 3) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-800">
            จุดอ่อนที่พบซ้ำ
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            หัวข้อการทวนสอบที่ได้คะแนนระดับ &ldquo;ควรปรับปรุง&rdquo; (1 คะแนน)
            พร้อมรายวิชาที่เกี่ยวข้อง
          </p>
        </div>
        {data.recurringWeaknesses.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            ไม่พบหัวข้อที่ได้คะแนนระดับควรปรับปรุงในขอบเขตที่เลือก
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recurringWeaknesses.map((weakness) => (
              <div key={weakness.key} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700">
                    {weakness.number}. {weakness.labelTh}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-amber-700">
                    {weakness.lowCount} รายวิชา · {weakness.lowRate}%
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {weakness.affectedCourses.map((course) => (
                    <Link
                      key={course.offeringId}
                      href={`/admin/programs/${course.programId}/offerings/${course.offeringId}`}
                      className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
                    >
                      {course.courseCode} ({course.academicYear}/{course.semester})
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-800">
            รายการที่ควรติดตาม
          </h2>
        </div>
        {data.attentionItems.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            ยังไม่มีรายการที่ต้องติดตามในขณะนี้
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">รายวิชา</th>
                  <th className="px-4 py-3 font-medium">ปี/ภาค</th>
                  <th className="px-4 py-3 font-medium">คะแนน</th>
                  <th className="px-4 py-3 font-medium">สถานะ</th>
                  <th className="px-4 py-3 font-medium">เหตุผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.attentionItems.map((item) => (
                  <tr key={item.offeringId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/programs/${item.programId}/offerings/${item.offeringId}`}
                        className="font-medium text-mfu-primary hover:underline"
                      >
                        {item.courseCode}
                      </Link>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {item.courseNameTh}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.academicYear} {SEMESTER_LABEL[item.semester]} ตอน{' '}
                      {item.section}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {scoreText(item.percentScore)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}
