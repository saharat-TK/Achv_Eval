import type { AnalysisResult } from './gemini';
import { REPORT_STYLES, esc, md, scoreCells, signatureTable } from './reportShared';

export interface ReportMeta {
  courseCode: string;
  courseNameTh: string;
  courseNameEn: string;
  academicYear: number;
  semesterLabel: string;
  section: string;
  lecturerName: string;
  generatedAt: string; // formatted Thai date-time
}

/**
 * Builds the full printable HTML for one evaluation report.
 * Rendered to PDF by headless Chromium in generateReportPdf.
 */
export function buildReportHtml(result: AnalysisResult, meta: ReportMeta): string {
  const v = result.section4Verification;

  const rubricRows = v.items
    .map(
      (it) => `
      <tr>
        <td>${esc(it.labelTh)}</td>
        ${scoreCells(it.score)}
        <td>${esc(it.strengths)}</td>
        <td>${esc(it.improvements)}</td>
      </tr>`,
    )
    .join('');

  const criticalList = result.criticalIssues.length
    ? `<ul>${result.criticalIssues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '<p class="muted">ไม่พบประเด็นวิกฤต</p>';

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
  <h1>รายงานการประเมินและทวนสอบผลสัมฤทธิ์รายวิชา</h1>
  <table class="meta">
    <tr><td><strong>รายวิชา</strong></td><td>${esc(meta.courseCode)} ${esc(meta.courseNameTh)} (${esc(meta.courseNameEn)})</td></tr>
    <tr><td><strong>ปีการศึกษา</strong></td><td>${meta.academicYear} ${esc(meta.semesterLabel)} · ตอนเรียน ${esc(meta.section)}</td></tr>
    <tr><td><strong>อาจารย์ผู้รับผิดชอบ</strong></td><td>${esc(meta.lecturerName)}</td></tr>
    <tr><td><strong>วันที่จัดทำรายงาน</strong></td><td>${esc(meta.generatedAt)}</td></tr>
  </table>
</div>

<h2>บทสรุปผู้บริหาร</h2>
<div class="summary section-body">${md(result.overallSummary)}</div>

<h2>ประเด็นสำคัญที่ต้องแก้ไข</h2>
<div class="crit">${criticalList}</div>

<h2>ส่วนที่ 1 — การประเมินผลและการตัดเกรด</h2>
<div class="section-body">${md(result.section1Grading)}</div>

<h2>ส่วนที่ 2 — การประเมินคุณภาพรายวิชา</h2>
<div class="section-body">${md(result.section2Quality)}</div>

${
  result.section3RevisedTqf3
    ? `<h2>ส่วนที่ 3 — ร่าง มคอ.3 ฉบับปรับปรุง</h2>
<div class="section-body">${md(result.section3RevisedTqf3)}</div>`
    : ''
}

<h2>ส่วนที่ 4 — แบบรายงานผลการทวนสอบผลลัพธ์การเรียนรู้รายวิชา</h2>
<table>
  <thead>
    <tr>
      <th>หัวข้อการพิจารณา</th>
      <th class="score">3</th><th class="score">2</th><th class="score">1</th>
      <th>ข้อดี</th><th>ข้อพัฒนา</th>
    </tr>
  </thead>
  <tbody>
    ${rubricRows}
    <tr>
      <td colspan="4"><strong>คะแนนรวม</strong></td>
      <td colspan="2"><strong>${v.totalScore} / ${v.maxScore} (${v.percent}%)</strong></td>
    </tr>
  </tbody>
</table>

<div class="result-box">
  <strong>สรุปผลการทวนสอบ:</strong>
  &nbsp; ${v.band === 'improve' ? '☑' : '☐'} ควรปรับปรุง (&lt;70%)
  &nbsp; ${v.band === 'good' ? '☑' : '☐'} ดี (70–79%)
  &nbsp; ${v.band === 'excellent' ? '☑' : '☐'} ดีเยี่ยม (80–100%)
</div>

${signatureTable()}

<p class="muted" style="margin-top:14px;font-size:10px;">
  เอกสารนี้เป็นส่วนหนึ่งของกระบวนการทวนสอบผลลัพธ์การเรียนรู้รายวิชา
  ตามข้อกำหนดของ สป.อว. / AUN-QA Criterion 3 · จัดทำโดยระบบประเมินและทวนสอบรายวิชา
</p>

</body>
</html>`;
}
