import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllPrograms, getProgramsByIds } from '@/lib/data/programs';
import { getExecutiveDashboardData } from '@/lib/data/dashboard';
import { SEMESTER_LABEL } from '@/lib/constants';
import type { Semester } from '@/lib/types/models';
import PrintButton from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

const PRINT_CSS = `
  @page { size: A4; margin: 14mm; }
  @media print {
    body { background: #ffffff; }
  }
`;

function readValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function scoreText(score: number | null): string {
  return score === null ? '—' : `${score}%`;
}

export default async function DashboardPrintPage({
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

  const rawProgramId = readValue(searchParams.programId);
  const programId = programs.some((program) => program.id === rawProgramId)
    ? rawProgramId
    : undefined;
  const rawYear = Number(readValue(searchParams.academicYear));
  const academicYear =
    Number.isInteger(rawYear) && rawYear >= 2500 ? rawYear : undefined;
  const rawSemester = readValue(searchParams.semester);
  const semester: Semester | undefined =
    rawSemester === '1' || rawSemester === '2' || rawSemester === '3'
      ? rawSemester
      : undefined;

  const data = await getExecutiveDashboardData(programs, {
    programId,
    academicYear,
    semester,
  });

  const context = {
    programLabel: programId
      ? (programs.find((program) => program.id === programId)?.nameTh ??
        programId)
      : 'ทุกหลักสูตร',
    yearLabel: academicYear ? String(academicYear) : 'ทุกปี',
    semesterLabel: semester ? SEMESTER_LABEL[semester] : 'ทุกภาค',
  };
  const generatedAt = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return (
    <div className="mx-auto max-w-3xl bg-white text-slate-900">
      <style>{PRINT_CSS}</style>

      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/admin/dashboard"
          className="text-sm text-slate-500 hover:underline"
        >
          ← กลับไปแดชบอร์ด
        </Link>
        <PrintButton />
      </div>

      <header className="border-b-2 border-mfu-primary pb-3">
        <h1 className="text-lg font-bold text-mfu-primary">
          รายงานแดชบอร์ดคุณภาพการทวนสอบ
        </h1>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
          <Meta label="หลักสูตร" value={context.programLabel} />
          <Meta label="ปีการศึกษา" value={context.yearLabel} />
          <Meta label="ภาคการศึกษา" value={context.semesterLabel} />
          <Meta label="วันที่จัดทำรายงาน" value={generatedAt} />
        </dl>
      </header>

      <Section title="ภาพรวม">
        <table className="w-full text-sm">
          <tbody>
            <SummaryRow label="หลักสูตรในขอบเขต" value={data.summary.totalPrograms} />
            <SummaryRow label="รายวิชาเปิดสอน" value={data.summary.totalOfferings} />
            <SummaryRow label="วิเคราะห์ AI แล้ว" value={data.summary.aiCompleted} />
            <SummaryRow label="ลงนามทวนสอบแล้ว" value={data.summary.assessed} />
            <SummaryRow label="รับรองผลแล้ว" value={data.summary.finalVerified} />
            <SummaryRow label="ต้องติดตาม" value={data.summary.needsFollowUp} />
            <SummaryRow
              label="คะแนนเฉลี่ย"
              value={scoreText(data.summary.averagePercentScore)}
            />
            <SummaryRow
              label="อัตรานำไปปฏิบัติ"
              value={
                data.summary.implementationRate === null
                  ? '—'
                  : `${data.summary.implementationRate}%`
              }
            />
          </tbody>
        </table>
      </Section>

      <Section title="ภาพรวมตามหลักสูตร">
        <table className="w-full border-collapse text-sm">
          <thead>
            <Tr head>
              <Th>หลักสูตร</Th>
              <Th>รายวิชา</Th>
              <Th>AI</Th>
              <Th>ทวนสอบ</Th>
              <Th>รับรอง</Th>
              <Th>ติดตาม</Th>
              <Th>คะแนนเฉลี่ย</Th>
            </Tr>
          </thead>
          <tbody>
            {data.programRows.map((program) => (
              <Tr key={program.programId}>
                <Td>
                  {program.code}
                  <span className="block text-xs text-slate-500">
                    {program.nameTh}
                  </span>
                </Td>
                <Td>{program.totalOfferings}</Td>
                <Td>{program.aiCompleted}</Td>
                <Td>{program.assessed}</Td>
                <Td>{program.finalVerified}</Td>
                <Td>{program.needsFollowUp}</Td>
                <Td>{scoreText(program.averagePercentScore)}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="แนวโน้มข้ามภาคการศึกษา">
        {data.trend.length === 0 ? (
          <Empty />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <Tr head>
                <Th>ภาคการศึกษา</Th>
                <Th>รายวิชา</Th>
                <Th>ความคืบหน้า</Th>
                <Th>คะแนนเฉลี่ย</Th>
                <Th>ดีเยี่ยม</Th>
                <Th>ดี</Th>
                <Th>ควรปรับปรุง</Th>
              </Tr>
            </thead>
            <tbody>
              {data.trend.map((point) => (
                <Tr key={point.termKey}>
                  <Td>{point.label}</Td>
                  <Td>{point.totalOfferings}</Td>
                  <Td>{point.completionRate}%</Td>
                  <Td>{scoreText(point.averagePercentScore)}</Td>
                  <Td>{point.excellent}</Td>
                  <Td>{point.good}</Td>
                  <Td>{point.improve}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="จุดอ่อนที่พบซ้ำ">
        {data.recurringWeaknesses.length === 0 ? (
          <Empty text="ไม่พบจุดอ่อนที่พบซ้ำ" />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <Tr head>
                <Th>หัวข้อการทวนสอบ</Th>
                <Th>จำนวนรายวิชา</Th>
                <Th>สัดส่วน</Th>
                <Th>รายวิชาที่เกี่ยวข้อง</Th>
              </Tr>
            </thead>
            <tbody>
              {data.recurringWeaknesses.map((weakness) => (
                <Tr key={weakness.key}>
                  <Td>
                    {weakness.number}. {weakness.labelTh}
                  </Td>
                  <Td>{weakness.lowCount}</Td>
                  <Td>{weakness.lowRate}%</Td>
                  <Td>
                    {weakness.affectedCourses
                      .map(
                        (course) =>
                          `${course.courseCode} (${course.academicYear}/${course.semester})`,
                      )
                      .join(', ')}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <p className="mt-6 text-xs text-slate-500">
        เอกสารนี้จัดทำจากระบบประเมินและทวนสอบรายวิชา เพื่อใช้ประกอบการประกันคุณภาพ
        การศึกษา ตามข้อกำหนดของ สป.อว. / AUN-QA
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500">{label}:</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5" style={{ breakInside: 'avoid' }}>
      <h2 className="mb-1 text-base font-semibold text-mfu-primary">{title}</h2>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-1 text-slate-600">{label}</td>
      <td className="py-1 text-right font-medium">{value}</td>
    </tr>
  );
}

function Tr({
  children,
  head = false,
}: {
  children: React.ReactNode;
  head?: boolean;
}) {
  return (
    <tr className={head ? 'bg-slate-100' : 'border-b border-slate-100'}>
      {children}
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border border-slate-300 px-2 py-1 text-left font-medium">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-slate-300 px-2 py-1 align-top">{children}</td>;
}

function Empty({ text = 'ไม่มีข้อมูล' }: { text?: string }) {
  return <p className="text-sm text-slate-500">{text}</p>;
}
