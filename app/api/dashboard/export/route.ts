import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/firebase/auth-server';
import { getAllPrograms, getProgramsByIds } from '@/lib/data/programs';
import { getAllAcademicPrograms } from '@/lib/data/academicPrograms';
import {
  getExecutiveDashboardData,
  type DashboardFilters,
  type ExecutiveDashboardData,
} from '@/lib/data/dashboard';
import {
  consolidateByAcademicProgram,
  type ApConsolidatedRow,
} from '@/lib/utils/dashboardConsolidate';
import { OFFERING_STATUS, SEMESTER_LABEL } from '@/lib/constants';
import type { OfferingStatus, Semester } from '@/lib/types/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Wraps a CSV field, escaping quotes and forcing text quoting. */
function csv(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function row(...values: (string | number | null)[]): string {
  return values.map(csv).join(',');
}

function scoreText(score: number | null): string {
  return score === null ? '—' : `${score}%`;
}

function buildCsv(
  data: ExecutiveDashboardData,
  apRows: ApConsolidatedRow[],
  context: { programLabel: string; yearLabel: string; semesterLabel: string },
): string {
  const lines: string[] = [];

  lines.push(row('รายงานแดชบอร์ดคุณภาพการทวนสอบ'));
  lines.push(
    row('จัดทำเมื่อ', new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })),
  );
  lines.push(row('หลักสูตร', context.programLabel));
  lines.push(row('ปีการศึกษา', context.yearLabel));
  lines.push(row('ภาคการศึกษา', context.semesterLabel));
  lines.push('');

  lines.push(row('[ภาพรวม]'));
  lines.push(row('ตัวชี้วัด', 'ค่า'));
  lines.push(row('หลักสูตรในขอบเขต', data.summary.totalPrograms));
  lines.push(row('รายวิชาเปิดสอน', data.summary.totalOfferings));
  lines.push(row('วิเคราะห์ AI แล้ว', data.summary.aiCompleted));
  lines.push(row('ลงนามทวนสอบแล้ว', data.summary.assessed));
  lines.push(row('รับรองผลแล้ว', data.summary.finalVerified));
  lines.push(row('ต้องติดตาม', data.summary.needsFollowUp));
  lines.push(row('ติดตามผลแล้ว', data.summary.followUpCompleted));
  lines.push(row('คะแนนเฉลี่ย', scoreText(data.summary.averagePercentScore)));
  lines.push(
    row(
      'อัตรานำไปปฏิบัติ',
      data.summary.implementationRate === null
        ? '—'
        : `${data.summary.implementationRate}%`,
    ),
  );
  lines.push('');

  lines.push(row('[ภาพรวมตามหลักสูตร]'));
  lines.push(
    row('รหัส', 'ชื่อหลักสูตร (AP)', 'จำนวนหลักสูตร', 'รายวิชา', 'AI', 'ทวนสอบ', 'รับรอง', 'ติดตาม', 'ติดตามผลแล้ว', 'คะแนนเฉลี่ย'),
  );
  for (const apRow of apRows) {
    lines.push(
      row(
        apRow.code,
        apRow.nameTh,
        apRow.programCount,
        apRow.totalOfferings,
        apRow.aiCompleted,
        apRow.assessed,
        apRow.finalVerified,
        apRow.needsFollowUp,
        apRow.followUpCompleted,
        scoreText(apRow.averagePercentScore),
      ),
    );
  }
  lines.push('');

  lines.push(row('[แนวโน้มข้ามภาคการศึกษา]'));
  lines.push(
    row('ภาคการศึกษา', 'รายวิชา', 'ความคืบหน้า %', 'คะแนนเฉลี่ย', 'ดีเยี่ยม', 'ดี', 'ควรปรับปรุง'),
  );
  for (const point of data.trend) {
    lines.push(
      row(
        point.label,
        point.totalOfferings,
        point.completionRate,
        scoreText(point.averagePercentScore),
        point.excellent,
        point.good,
        point.improve,
      ),
    );
  }
  lines.push('');

  lines.push(row('[จุดอ่อนที่พบซ้ำ]'));
  lines.push(row('หัวข้อ', 'จำนวนรายวิชา', 'สัดส่วน %', 'รายวิชาที่เกี่ยวข้อง'));
  for (const weakness of data.recurringWeaknesses) {
    lines.push(
      row(
        `${weakness.number}. ${weakness.labelTh}`,
        weakness.lowCount,
        weakness.lowRate,
        weakness.affectedCourses
          .map((course) => `${course.courseCode} (${course.academicYear}/${course.semester})`)
          .join('; '),
      ),
    );
  }

  return lines.join('\r\n');
}

/**
 * GET /api/dashboard/export
 *
 * Returns the executive dashboard as a CSV for AUN-QA reporting. Honors the
 * same program/year/semester filters as the dashboard page and the same
 * admin/director scoping.
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const isAdmin = profile.roles.isAdmin;
  const directorOf = profile.roles.directorOf ?? [];
  if (!isAdmin && directorOf.length === 0) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }

  const [programs, allAcademicPrograms] = await Promise.all([
    isAdmin ? getAllPrograms() : getProgramsByIds(directorOf),
    getAllAcademicPrograms(),
  ]);

  const sp = request.nextUrl.searchParams;
  const rawDepartmentId = sp.get('departmentId') ?? undefined;
  const rawAcademicProgramId = sp.get('academicProgramId') ?? undefined;
  const rawProgramId = sp.get('programId') ?? undefined;
  const programId = programs.some((program) => program.id === rawProgramId)
    ? rawProgramId
    : undefined;

  const rawYear = Number(sp.get('academicYear'));
  const academicYear =
    Number.isInteger(rawYear) && rawYear >= 2500 ? rawYear : undefined;

  const rawSemester = sp.get('semester');
  const semester: Semester | undefined =
    rawSemester === '1' || rawSemester === '2' || rawSemester === '3'
      ? rawSemester
      : undefined;
  const rawStatus = sp.get('status');
  const status: OfferingStatus | undefined =
    rawStatus && rawStatus in OFFERING_STATUS ? (rawStatus as OfferingStatus) : undefined;

  const filters: DashboardFilters = {
    departmentId: rawDepartmentId || undefined,
    academicProgramId: rawAcademicProgramId || undefined,
    programId,
    academicYear,
    semester,
    status,
  };
  const data = await getExecutiveDashboardData(programs, filters);
  const apRows = consolidateByAcademicProgram(data.programRows, programs, allAcademicPrograms);

  const csvText = buildCsv(data, apRows, {
    programLabel: programId
      ? (programs.find((p) => p.id === programId)?.nameTh ?? programId)
      : 'ทุกหลักสูตร',
    yearLabel: academicYear ? String(academicYear) : 'ทุกปี',
    semesterLabel: semester ? SEMESTER_LABEL[semester] : 'ทุกภาค',
  });

  const filename = `dashboard-qa-export-${new Date().toISOString().slice(0, 10)}.csv`;

  // UTF-8 BOM so Excel renders Thai text correctly.
  return new NextResponse(`﻿${csvText}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
