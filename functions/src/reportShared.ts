import { marked } from 'marked';
import type { AnalysisResult } from './gemini';

/** Shared print stylesheet for every report PDF. */
export const REPORT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', sans-serif; color: #1e293b; font-size: 12px; line-height: 1.6; margin: 0; }
  h1 { font-size: 18px; color: #00704A; margin: 0 0 4px; }
  h2 { font-size: 14px; color: #00704A; border-bottom: 2px solid #1E3932; padding-bottom: 3px; margin: 22px 0 8px; }
  h3 { font-size: 12.5px; margin: 12px 0 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; margin: 6px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
  th { background: #f1f5f9; text-align: left; }
  .cover { border-bottom: 3px solid #00704A; padding-bottom: 10px; margin-bottom: 8px; }
  .muted { color: #64748b; }
  .meta td { border: none; padding: 1px 0; }
  .score { text-align: center; width: 28px; font-size: 13px; }
  .crit { background: #fef2f2; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; }
  .summary { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; }
  .result-box { border: 1px solid #cbd5e1; padding: 8px 12px; margin-top: 8px; }
  .sign td { height: 54px; vertical-align: bottom; text-align: center; font-size: 11px; }
  .section-body { page-break-inside: auto; }
  .official { background: #E3F1EA; border: 1px solid #00704A; padding: 4px 10px; border-radius: 4px; display: inline-block; font-size: 11px; }
`;

export const BAND_TH: Record<string, string> = {
  excellent: 'ดีเยี่ยม',
  good: 'ดี',
  improve: 'ควรปรับปรุง',
};

export type RubricScore = 1 | 2 | 3 | 'na';

/** The 7 official rubric items, in order. */
export const RUBRIC_ITEMS: { key: string; labelTh: string }[] = [
  { key: 'item1Clo', labelTh: '1. ผลการเรียนรู้ที่คาดหวังของรายวิชา (CLO)' },
  { key: 'item21Content', labelTh: '2.1 เนื้อหาสาระของรายวิชา' },
  { key: 'item22Methods', labelTh: '2.2 วิธีการสอน' },
  { key: 'item31AssessmentMethods', labelTh: '3.1 วิธีการวัดและประเมินผล' },
  { key: 'item32AssessmentForms', labelTh: '3.2 รูปแบบเครื่องมือวัดผล' },
  { key: 'item33Proportions', labelTh: '3.3 สัดส่วนการวัดและประเมินผล' },
  { key: 'item34ExamQuality', labelTh: '3.4 คุณภาพข้อสอบ' },
];

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

export function esc(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Repairs common Markdown-table malformations from the LLM before parsing.
 * On long, wide tables (the มคอ.3 weekly plan) the model produces delimiter
 * rows that `marked` rejects — e.g. a single runaway dash run
 * (`| :------…------ |`) instead of per-column `| :--- | :--- |` cells, or
 * the header and delimiter merged onto one line. A rejected delimiter makes
 * the whole table render as a paragraph (a flood of dashes).
 *
 * Idempotent — well-formed tables pass through unchanged.
 */
export function normalizeMarkdownTables(src: string): string {
  let text = src ?? '';

  // (a) Collapse runaway dash padding the model adds to delimiter cells.
  //     Safe: prose almost never contains 6+ consecutive dashes.
  text = text.replace(/-{6,}/g, '---');

  // (b) Split a merged "header | | :--- | delimiter" line into two lines.
  text = text.replace(/\|[ \t]+(\|(?:[ \t]*:?-{1,}:?[ \t]*\|)+)/g, '|\n$1');

  // (c) Rebuild a delimiter row to match its header's column count, so a
  //     malformed delimiter (wrong cell count / single dash run) still parses.
  const lines = text.split('\n');
  const isDelimiterish = (l: string): boolean =>
    l.includes('|') && /^[\s|:-]+$/.test(l.trim()) && l.includes('-');
  const columnCount = (l: string): number =>
    l.trim().replace(/^\||\|$/g, '').split('|').length;
  for (let i = 0; i < lines.length - 1; i++) {
    if (
      lines[i].includes('|') &&
      !isDelimiterish(lines[i]) &&
      isDelimiterish(lines[i + 1])
    ) {
      const n = columnCount(lines[i]);
      if (n >= 1) lines[i + 1] = '| ' + Array(n).fill('---').join(' | ') + ' |';
    }
  }
  return lines.join('\n');
}

export function md(src: string): string {
  return marked.parse(normalizeMarkdownTables(src ?? ''), { async: false }) as string;
}

/** A score row carries ● in the column matching the item's score. */
export function scoreCells(score: number): string {
  return [3, 2, 1]
    .map((n) => `<td class="score">${score === n ? '●' : ''}</td>`)
    .join('');
}

/** ☑/☐ band checkboxes used in every result box. */
function bandChecks(band: string): string {
  return (
    `&nbsp; ${band === 'improve' ? '☑' : '☐'} ควรปรับปรุง (&lt;70%)` +
    `&nbsp; ${band === 'good' ? '☑' : '☐'} ดี (70–79%)` +
    `&nbsp; ${band === 'excellent' ? '☑' : '☐'} ดีเยี่ยม (80–100%)`
  );
}

/** The 5-cell certification signature block, shared by all reports. */
export function signatureTable(): string {
  return `
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
</table>`;
}

/**
 * "ส่วนที่ 1 — ผลการประเมินจากระบบ AI": the full AI analysis plus the
 * AI-generated 7-item verification rubric. Shared by the combined report
 * and the final verification report.
 */
export function renderAiSection(aiResult: AnalysisResult): string {
  const criticalList = aiResult.criticalIssues.length
    ? `<ul>${aiResult.criticalIssues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '<p class="muted">ไม่พบประเด็นวิกฤต</p>';

  const v = aiResult.section4Verification;
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

  return `
<h2>ส่วนที่ 1 — ผลการประเมินจากระบบ AI</h2>
<div class="summary section-body">${md(aiResult.overallSummary)}</div>
<h3>ประเด็นสำคัญที่ต้องแก้ไข</h3>
<div class="crit">${criticalList}</div>
<h3>การประเมินผลและการตัดเกรด</h3>
<div class="section-body">${md(aiResult.section1Grading)}</div>
<h3>การประเมินคุณภาพรายวิชา</h3>
<div class="section-body">${md(aiResult.section2Quality)}</div>
<h3>แบบรายงานผลการทวนสอบผลลัพธ์การเรียนรู้รายวิชา (ประเมินโดยระบบ AI)</h3>
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
  <strong>สรุปผลการทวนสอบ (ระบบ AI):</strong> ${bandChecks(v.band)}
</div>`;
}

export const IMPLEMENTATION_DECISION_TH: Record<string, string> = {
  implemented: 'ดำเนินการแล้ว',
  partially_implemented: 'ดำเนินการบางส่วน',
  not_implemented: 'ยังไม่ดำเนินการ',
};

export interface FollowUpForReport {
  /** Previous offering term, e.g. "2567 ภาคปลาย · ตอนเรียน 01". */
  previousTermText: string;
  /** Assessor who produced the previous assessment being followed up. */
  previousAssessorName: string;
  /** The assessor recording this follow-up. */
  reviewerName: string;
  /** Per-item implementation decision keyed by rubric item key. */
  itemDecisions: Record<string, string | undefined>;
  /** Per-item follow-up comment keyed by rubric item key. */
  itemComments: Record<string, string | undefined>;
  /** Previous assessment's scores — shown for context per item. */
  previousScores: Record<string, RubricScore>;
  /** Previous assessment's improvement notes per item. */
  previousComments: Record<string, { strengths?: string; improvements?: string }>;
  notes: string | null;
}

/**
 * "ส่วนที่ 3 — ติดตามผลการปรับปรุง": the assessor's follow-up on the previous
 * semester's verification result. Rendered only when a follow-up review exists.
 */
export function renderFollowUpSection(followUp: FollowUpForReport): string {
  const rows = RUBRIC_ITEMS.map((item) => {
    const prevScore = followUp.previousScores[item.key] ?? 'na';
    const improvement = followUp.previousComments[item.key]?.improvements ?? '';
    const decisionKey = followUp.itemDecisions[item.key];
    const decision = decisionKey ? IMPLEMENTATION_DECISION_TH[decisionKey] ?? decisionKey : '—';
    const comment = followUp.itemComments[item.key] ?? '';
    return `
      <tr>
        <td>${esc(item.labelTh)}</td>
        <td class="score">${prevScore === 'na' ? 'N/A' : prevScore}</td>
        <td>${esc(improvement)}</td>
        <td>${esc(decision)}</td>
        <td>${esc(comment)}</td>
      </tr>`;
  }).join('');

  return `
<h2>ส่วนที่ 3 — ติดตามผลการปรับปรุง (จากการทวนสอบภาคก่อนหน้า)</h2>
<table class="meta">
  <tr><td><strong>ผลการทวนสอบที่นำมาติดตาม</strong></td><td>${esc(followUp.previousTermText)}</td></tr>
  <tr><td><strong>ทวนสอบภาคก่อนโดย</strong></td><td>${esc(followUp.previousAssessorName)}</td></tr>
  <tr><td><strong>ผู้ติดตามผล</strong></td><td>${esc(followUp.reviewerName)}</td></tr>
</table>
<table>
  <thead>
    <tr>
      <th>หัวข้อการพิจารณา</th>
      <th class="score">คะแนนเดิม</th>
      <th>ข้อเสนอแนะเดิม</th>
      <th>ผลการนำไปปฏิบัติ</th>
      <th>ความเห็นผู้ติดตามผล</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
${
  followUp.notes
    ? `<h3>หมายเหตุการติดตามผล</h3><p>${esc(followUp.notes)}</p>`
    : ''
}`;
}

/**
 * "ส่วนที่ 2 — ผลการทวนสอบโดยผู้ทวนสอบ": the assessor's official 7-item
 * form. Shared by the combined report and the final verification report.
 */
export function renderAssessorSection(assessment: AssessmentForReport): string {
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

  return `
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
  <strong>สรุปผลการทวนสอบ:</strong> ${bandChecks(assessment.band)}
  &nbsp; — ระดับที่ได้: <strong>${BAND_TH[assessment.band] ?? assessment.band}</strong>
</div>
${
  assessment.generalNotes
    ? `<h3>บันทึกเพิ่มเติมของผู้ทวนสอบ</h3><p>${esc(assessment.generalNotes)}</p>`
    : ''
}`;
}
