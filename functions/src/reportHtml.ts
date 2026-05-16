import { marked } from 'marked';
import type { AnalysisResult } from './gemini';

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

const BAND_TH: Record<string, string> = {
  excellent: 'ดีเยี่ยม',
  good: 'ดี',
  improve: 'ควรปรับปรุง',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function md(src: string): string {
  return marked.parse(src ?? '', { async: false }) as string;
}

/** A score cell carries ● in the column matching the item's score. */
function scoreCells(score: number): string {
  return [3, 2, 1]
    .map((n) => `<td class="score">${score === n ? '●' : ''}</td>`)
    .join('');
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
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', sans-serif; color: #1e293b; font-size: 12px; line-height: 1.6; margin: 0; }
  h1 { font-size: 18px; color: #7c1f2e; margin: 0 0 4px; }
  h2 { font-size: 14px; color: #7c1f2e; border-bottom: 2px solid #f0b323; padding-bottom: 3px; margin: 22px 0 8px; }
  h3 { font-size: 12.5px; margin: 12px 0 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; margin: 6px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
  th { background: #f1f5f9; text-align: left; }
  .cover { border-bottom: 3px solid #7c1f2e; padding-bottom: 10px; margin-bottom: 8px; }
  .muted { color: #64748b; }
  .meta td { border: none; padding: 1px 0; }
  .score { text-align: center; width: 28px; font-size: 13px; }
  .crit { background: #fef2f2; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; }
  .summary { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; }
  .result-box { border: 1px solid #cbd5e1; padding: 8px 12px; margin-top: 8px; }
  .sign td { height: 54px; vertical-align: bottom; text-align: center; font-size: 11px; }
  .section-body { page-break-inside: auto; }
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

<h2>ส่วนที่ 3 — ร่าง มคอ.3 ฉบับปรับปรุง</h2>
<div class="section-body">${md(result.section3RevisedTqf3)}</div>

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

<h3>ลายมือชื่อรับรอง</h3>
<table class="sign">
  <tr>
    <td>....................................<br/>ผู้ทวนสอบภายใน</td>
    <td>....................................<br/>ผู้ทวนสอบภายนอก</td>
    <td>....................................<br/>อาจารย์ผู้รับผิดชอบรายวิชา</td>
  </tr>
  <tr>
    <td>....................................<br/>ประธานสาขาวิชา</td>
    <td>....................................<br/>คณบดี / ผู้แทน</td>
    <td></td>
  </tr>
</table>

<p class="muted" style="margin-top:14px;font-size:10px;">
  เอกสารนี้เป็นส่วนหนึ่งของกระบวนการทวนสอบผลลัพธ์การเรียนรู้รายวิชา
  ตามข้อกำหนดของ สป.อว. / AUN-QA Criterion 3 · จัดทำโดยระบบประเมินและทวนสอบรายวิชา
</p>

</body>
</html>`;
}
