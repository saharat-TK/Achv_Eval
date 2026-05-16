import { marked } from 'marked';
import type { AnalysisResult } from './gemini';
import type { ReportMeta } from './reportHtml';

type RubricScore = 1 | 2 | 3 | 'na';

export interface AssessmentForReport {
  assessorName: string;
  signedAtText: string;
  scores: Record<string, RubricScore>;
  comments: Record<string, { strengths?: string; improvements?: string }>;
  totalScore: number;
  maxScore: number;
  percentScore: number;
  band: string;
  generalNotes: string | null;
}

/** The 7 official rubric items, in order. */
const RUBRIC_ITEMS: { key: string; labelTh: string }[] = [
  { key: 'item1Clo', labelTh: '1. ผลการเรียนรู้ที่คาดหวังของรายวิชา (CLO)' },
  { key: 'item21Content', labelTh: '2.1 เนื้อหาสาระของรายวิชา' },
  { key: 'item22Methods', labelTh: '2.2 วิธีการสอน' },
  { key: 'item31AssessmentMethods', labelTh: '3.1 วิธีการวัดและประเมินผล' },
  { key: 'item32AssessmentForms', labelTh: '3.2 รูปแบบเครื่องมือวัดผล' },
  { key: 'item33Proportions', labelTh: '3.3 สัดส่วนการวัดและประเมินผล' },
  { key: 'item34ExamQuality', labelTh: '3.4 คุณภาพข้อสอบ' },
];

const BAND_TH: Record<string, string> = {
  excellent: 'ดีเยี่ยม',
  good: 'ดี',
  improve: 'ควรปรับปรุง',
};

function esc(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function md(src: string): string {
  return marked.parse(src ?? '', { async: false }) as string;
}

function scoreCells(score: RubricScore): string {
  return [3, 2, 1]
    .map((n) => `<td class="score">${score === n ? '●' : ''}</td>`)
    .join('');
}

/**
 * Builds the combined report HTML: the AI analysis plus the official
 * assessor verification form (the assessor's own scores and comments),
 * rendered to PDF on sign-off.
 */
export function buildCombinedReportHtml(args: {
  aiResult: AnalysisResult;
  assessment: AssessmentForReport;
  meta: ReportMeta;
}): string {
  const { aiResult, assessment, meta } = args;

  const rubricRows = RUBRIC_ITEMS.map((item) => {
    const score = assessment.scores[item.key] ?? 'na';
    const c = assessment.comments[item.key] ?? {};
    return `
      <tr>
        <td>${esc(item.labelTh)}</td>
        ${score === 'na' ? '<td colspan="3" class="score">N/A</td>' : scoreCells(score)}
        <td>${esc(c.strengths ?? '')}</td>
        <td>${esc(c.improvements ?? '')}</td>
      </tr>`;
  }).join('');

  const criticalList = aiResult.criticalIssues.length
    ? `<ul>${aiResult.criticalIssues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
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
  .official { background: #fffbeb; border: 1px solid #f0b323; padding: 4px 10px; border-radius: 4px; display: inline-block; font-size: 11px; }
  @page { size: A4; margin: 18mm 16mm; }
</style>
</head>
<body>

<div class="cover">
  <h1>รายงานการประเมินและทวนสอบผลสัมฤทธิ์รายวิชา (ฉบับลงนาม)</h1>
  <table class="meta">
    <tr><td><strong>รายวิชา</strong></td><td>${esc(meta.courseCode)} ${esc(meta.courseNameTh)} (${esc(meta.courseNameEn)})</td></tr>
    <tr><td><strong>ปีการศึกษา</strong></td><td>${meta.academicYear} ${esc(meta.semesterLabel)} · ตอนเรียน ${esc(meta.section)}</td></tr>
    <tr><td><strong>อาจารย์ผู้รับผิดชอบ</strong></td><td>${esc(meta.lecturerName)}</td></tr>
    <tr><td><strong>ผู้ทวนสอบ</strong></td><td>${esc(assessment.assessorName)}</td></tr>
    <tr><td><strong>วันที่ลงนามทวนสอบ</strong></td><td>${esc(assessment.signedAtText)}</td></tr>
  </table>
</div>

<h2>ส่วนที่ 1 — ผลการประเมินจากระบบ AI</h2>
<div class="summary">${md(aiResult.overallSummary)}</div>
<h3>ประเด็นสำคัญที่ต้องแก้ไข</h3>
<div class="crit">${criticalList}</div>
<h3>การประเมินผลและการตัดเกรด</h3>
<div>${md(aiResult.section1Grading)}</div>
<h3>การประเมินคุณภาพรายวิชา</h3>
<div>${md(aiResult.section2Quality)}</div>
<h3>ร่าง มคอ.3 ฉบับปรับปรุง</h3>
<div>${md(aiResult.section3RevisedTqf3)}</div>

<h2>ส่วนที่ 2 — ผลการทวนสอบโดยผู้ทวนสอบ <span class="official">ฉบับทางการ</span></h2>
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
      <td colspan="2"><strong>${assessment.totalScore} / ${assessment.maxScore} (${assessment.percentScore}%)</strong></td>
    </tr>
  </tbody>
</table>

<div class="result-box">
  <strong>สรุปผลการทวนสอบ:</strong>
  &nbsp; ${assessment.band === 'improve' ? '☑' : '☐'} ควรปรับปรุง (&lt;70%)
  &nbsp; ${assessment.band === 'good' ? '☑' : '☐'} ดี (70–79%)
  &nbsp; ${assessment.band === 'excellent' ? '☑' : '☐'} ดีเยี่ยม (80–100%)
  &nbsp; — ระดับที่ได้: <strong>${BAND_TH[assessment.band] ?? assessment.band}</strong>
</div>

${
  assessment.generalNotes
    ? `<h3>บันทึกเพิ่มเติมของผู้ทวนสอบ</h3><p>${esc(assessment.generalNotes)}</p>`
    : ''
}

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
  ตามข้อกำหนดของ สป.อว. / AUN-QA Criterion 3 · ลงนามทวนสอบโดย ${esc(assessment.assessorName)}
</p>

</body>
</html>`;
}
