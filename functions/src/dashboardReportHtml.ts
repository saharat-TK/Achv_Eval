import { REPORT_STYLES, esc } from './reportShared';

export interface DashboardReportInput {
  context: {
    programLabel: string;
    yearLabel: string;
    semesterLabel: string;
  };
  summary: {
    totalPrograms: number;
    totalOfferings: number;
    aiCompleted: number;
    assessed: number;
    finalVerified: number;
    needsFollowUp: number;
    averagePercentScore: number | null;
    implementationRate: number | null;
  };
  programRows: {
    code: string;
    nameTh: string;
    totalOfferings: number;
    aiCompleted: number;
    assessed: number;
    finalVerified: number;
    needsFollowUp: number;
    averagePercentScore: number | null;
  }[];
  trend: {
    label: string;
    totalOfferings: number;
    completionRate: number;
    averagePercentScore: number | null;
    excellent: number;
    good: number;
    improve: number;
  }[];
  recurringWeaknesses: {
    number: string;
    labelTh: string;
    lowCount: number;
    lowRate: number;
    affectedCourses: { courseCode: string; academicYear: number; semester: string }[];
  }[];
}

function scoreText(score: number | null): string {
  return score === null ? '—' : `${score}%`;
}

/**
 * Builds the printable HTML for the executive-dashboard QA report.
 * Rendered to PDF by generateDashboardReport.
 */
export function buildDashboardReportHtml(
  input: DashboardReportInput,
  generatedAt: string,
): string {
  const { context, summary, programRows, trend, recurringWeaknesses } = input;

  const summaryRows = [
    ['หลักสูตรในขอบเขต', String(summary.totalPrograms)],
    ['รายวิชาเปิดสอน', String(summary.totalOfferings)],
    ['วิเคราะห์ AI แล้ว', String(summary.aiCompleted)],
    ['ลงนามทวนสอบแล้ว', String(summary.assessed)],
    ['รับรองผลแล้ว', String(summary.finalVerified)],
    ['ต้องติดตาม', String(summary.needsFollowUp)],
    ['คะแนนเฉลี่ย', scoreText(summary.averagePercentScore)],
    [
      'อัตรานำไปปฏิบัติ',
      summary.implementationRate === null ? '—' : `${summary.implementationRate}%`,
    ],
  ]
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('');

  const programRowsHtml = programRows.length
    ? programRows
        .map(
          (p) => `
      <tr>
        <td>${esc(p.code)}<br/><span class="muted">${esc(p.nameTh)}</span></td>
        <td>${p.totalOfferings}</td>
        <td>${p.aiCompleted}</td>
        <td>${p.assessed}</td>
        <td>${p.finalVerified}</td>
        <td>${p.needsFollowUp}</td>
        <td>${esc(scoreText(p.averagePercentScore))}</td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="7" class="muted">ไม่มีข้อมูล</td></tr>';

  const trendRowsHtml = trend.length
    ? trend
        .map(
          (t) => `
      <tr>
        <td>${esc(t.label)}</td>
        <td>${t.totalOfferings}</td>
        <td>${t.completionRate}%</td>
        <td>${esc(scoreText(t.averagePercentScore))}</td>
        <td>${t.excellent}</td>
        <td>${t.good}</td>
        <td>${t.improve}</td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="7" class="muted">ไม่มีข้อมูล</td></tr>';

  const weaknessRowsHtml = recurringWeaknesses.length
    ? recurringWeaknesses
        .map(
          (w) => `
      <tr>
        <td>${esc(w.number)}. ${esc(w.labelTh)}</td>
        <td>${w.lowCount}</td>
        <td>${w.lowRate}%</td>
        <td>${esc(
          w.affectedCourses
            .map((c) => `${c.courseCode} (${c.academicYear}/${c.semester})`)
            .join(', '),
        )}</td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="muted">ไม่พบจุดอ่อนที่พบซ้ำ</td></tr>';

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap" rel="stylesheet" />
<style>${REPORT_STYLES}
  @page { size: A4; margin: 18mm 16mm; }
</style>
</head>
<body>

<div class="cover">
  <h1>รายงานแดชบอร์ดคุณภาพการทวนสอบ</h1>
  <table class="meta">
    <tr><td><strong>หลักสูตร</strong></td><td>${esc(context.programLabel)}</td></tr>
    <tr><td><strong>ปีการศึกษา</strong></td><td>${esc(context.yearLabel)}</td></tr>
    <tr><td><strong>ภาคการศึกษา</strong></td><td>${esc(context.semesterLabel)}</td></tr>
    <tr><td><strong>วันที่จัดทำรายงาน</strong></td><td>${esc(generatedAt)}</td></tr>
  </table>
</div>

<h2>ภาพรวม</h2>
<table>
  <thead><tr><th>ตัวชี้วัด</th><th>ค่า</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>

<h2>ภาพรวมตามหลักสูตร</h2>
<table>
  <thead>
    <tr>
      <th>หลักสูตร</th><th>รายวิชา</th><th>AI</th><th>ทวนสอบ</th>
      <th>รับรอง</th><th>ติดตาม</th><th>คะแนนเฉลี่ย</th>
    </tr>
  </thead>
  <tbody>${programRowsHtml}</tbody>
</table>

<h2>แนวโน้มข้ามภาคการศึกษา</h2>
<table>
  <thead>
    <tr>
      <th>ภาคการศึกษา</th><th>รายวิชา</th><th>ความคืบหน้า</th><th>คะแนนเฉลี่ย</th>
      <th>ดีเยี่ยม</th><th>ดี</th><th>ควรปรับปรุง</th>
    </tr>
  </thead>
  <tbody>${trendRowsHtml}</tbody>
</table>

<h2>จุดอ่อนที่พบซ้ำ</h2>
<table>
  <thead>
    <tr><th>หัวข้อการทวนสอบ</th><th>จำนวนรายวิชา</th><th>สัดส่วน</th><th>รายวิชาที่เกี่ยวข้อง</th></tr>
  </thead>
  <tbody>${weaknessRowsHtml}</tbody>
</table>

<p class="muted" style="margin-top:14px;font-size:10px;">
  เอกสารนี้จัดทำจากระบบประเมินและทวนสอบรายวิชา เพื่อใช้ประกอบการประกันคุณภาพการศึกษา
  ตามข้อกำหนดของ สป.อว. / AUN-QA
</p>

</body>
</html>`;
}
