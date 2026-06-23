import { REPORT_STYLES, esc, revisionLabel } from './reportShared';

/** ` · Revision N` for thesis installments 2–6, else ''. */
function revSuffix(part?: number | null): string {
  const label = revisionLabel(part);
  return label ? ` · ${label}` : '';
}

export interface SummaryTopic {
  number: string;
  labelTh: string;
  strengths: string[];
  improvements: string[];
  averageScore?: number | null;
}

const BAND_TH = (percent: number): string =>
  percent >= 80 ? 'ดีเยี่ยม' : percent >= 70 ? 'ดี' : 'ควรปรับปรุง';

export interface SummaryCourseRow {
  courseCode: string;
  courseNameEn: string;
  courseNameTh: string;
  part?: number | null;
  lecturerName: string | null;
  bandLabel: string | null;
}

export interface SummarySemesterGroup {
  semesterLabel: string;
  rows: SummaryCourseRow[];
}

export interface SummaryProgramRollup {
  code: string;
  name: string;
  totalOfferings: number;
  assessedOfferings: number;
  assessedPercent: number;
  avgScorePercent: number | null;
}

export interface SummaryProgramCourseRow {
  courseCode: string;
  courseNameEn: string;
  part?: number | null;
  semesterLabel: string;
  academicYear?: number;
  percentScore: number | null;
  statusLabel: string;
}

export interface SummaryProgramCourseGroup {
  programLabel: string;
  rows: SummaryProgramCourseRow[];
}

export interface SummaryReportData {
  coverage: 'program' | 'all';
  academicProgramLabel: string;
  academicYear: number;
  scopeLabel: string; // "ภาคต้น" / "ประจำปีการศึกษา" ...
  header: {
    venue: string;
    meetingDateTime: string;
    committee: { name: string; role: string }[];
  };
  totalOfferings: number;
  assessedOfferings: number;
  percent: number;
  overallAveragePercent?: number | null;
  bandDistribution: { improve: number; good: number; excellent: number };
  semesterGroups: SummarySemesterGroup[];
  /** All-programs only — §2 rollup and the appendix course listing. */
  programRollup?: SummaryProgramRollup[];
  programCourseGroups?: SummaryProgramCourseGroup[];
  /** True when §3.1 carries the AI-synthesized overview (vs raw comments). */
  assessorSynthesized?: boolean;
  assessorTopics: SummaryTopic[];
  aiTopics: SummaryTopic[];
  generatedAt: string;
}

function bullets(items: string[]): string {
  return items.length
    ? `<ul>${items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
    : '<span class="muted">—</span>';
}

function avgCell(avg: number | null | undefined): string {
  if (avg == null) return '<span class="muted">N/A</span>';
  return `${avg.toFixed(1)}/3<br/>(${BAND_TH((avg / 3) * 100)})`;
}

/** Section 3.1 — average score + strengths + suggestions per topic. */
function assessorTopicTable(topics: SummaryTopic[]): string {
  const rows = topics
    .map(
      (t) => `<tr>
        <td><strong>${esc(t.number)}. ${esc(t.labelTh)}</strong></td>
        <td>${avgCell(t.averageScore)}</td>
        <td>${bullets(t.strengths)}</td>
        <td>${bullets(t.improvements)}</td>
      </tr>`,
    )
    .join('');
  return `<table>
    <thead><tr><th>หัวข้อการทวนสอบ</th><th>คะแนนเฉลี่ย</th><th>ข้อดี / จุดเด่น</th><th>ข้อเสนอแนะ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** Section 3.2 — single column (synthesized suggestions) per topic. */
function topicBlock(topics: SummaryTopic[]): string {
  return topics
    .map((t) => {
      const body = t.improvements.length
        ? `<ul>${t.improvements.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
        : '<p class="muted">ไม่มีความเห็นเพิ่มเติม</p>';
      return `<div style="margin-bottom:8px;">
        <div><strong>${esc(t.number)}. ${esc(t.labelTh)}</strong></div>
        ${body}
      </div>`;
    })
    .join('');
}

/** A page of committee signature blocks: signature line, name, and position. */
function signatureSection(committee: { name: string; role: string }[]): string {
  if (committee.length === 0) return '';
  const cellStyle =
    'width:50%; border:none; padding:26px 12px 6px; vertical-align:top; text-align:center;';
  const cell = (m: { name: string; role: string }) =>
    `<td style="${cellStyle}">
      <div style="margin-bottom:4px;">ลงชื่อ ......................................................</div>
      <div>( ${esc(m.name)} )</div>
      <div>ตำแหน่ง ${esc(m.role)}</div>
    </td>`;
  const rows: string[] = [];
  for (let i = 0; i < committee.length; i += 2) {
    const pair = committee.slice(i, i + 2).map(cell);
    if (pair.length === 1) pair.push(`<td style="${cellStyle}"></td>`);
    rows.push(`<tr>${pair.join('')}</tr>`);
  }
  return `<div style="page-break-before: always;">
    <h2>ลายมือชื่อคณะกรรมการทวนสอบ</h2>
    <table style="border:none;"><tbody>${rows.join('')}</tbody></table>
  </div>`;
}

/** §2 for the all-programs report — one row per academic program. */
function programRollupTable(rows: SummaryProgramRollup[]): string {
  const body = rows
    .map(
      (p) => `<tr>
        <td>${esc(p.code)}</td>
        <td>${esc(p.name)}</td>
        <td>${p.totalOfferings}</td>
        <td>${p.assessedOfferings} (${p.assessedPercent}%)</td>
        <td>${p.avgScorePercent == null ? '—' : `${p.avgScorePercent}%`}</td>
        <td>${p.avgScorePercent == null ? '—' : BAND_TH(p.avgScorePercent)}</td>
      </tr>`,
    )
    .join('');
  return `<table>
    <thead><tr><th>รหัสหลักสูตร</th><th>ชื่อหลักสูตร</th><th>รายวิชา</th><th>ทวนสอบแล้ว</th><th>คะแนนเฉลี่ย</th><th>ระดับ</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/** Appendix for the all-programs report — course list grouped by program. */
function programCourseListSection(groups: SummaryProgramCourseGroup[]): string {
  if (groups.length === 0) return '';
  const blocks = groups
    .map(
      (g) => `<h3>${esc(g.programLabel)}</h3>
    <table>
      <thead><tr><th>รหัส/ชื่อรายวิชา</th><th>ภาค/ปี</th><th>คะแนน</th><th>ระดับ</th><th>สถานะ</th></tr></thead>
      <tbody>${g.rows
        .map(
          (r) => `<tr>
          <td>${esc(r.courseCode)} ${esc(r.courseNameEn)}${revSuffix(r.part)}</td>
          <td>${esc(r.semesterLabel)}${r.academicYear ? ` / ${r.academicYear}` : ''}</td>
          <td>${r.percentScore == null ? '—' : `${r.percentScore}%`}</td>
          <td>${r.percentScore == null ? '—' : BAND_TH(r.percentScore)}</td>
          <td>${esc(r.statusLabel)}</td>
        </tr>`,
        )
        .join('')}</tbody>
    </table>`,
    )
    .join('');
  return `<div style="page-break-before: always;">
    <h2>ภาคผนวก — รายวิชาทั้งหมด (จำแนกตามหลักสูตร)</h2>
    ${blocks}
  </div>`;
}

/** Builds the printable HTML for an assessment summary (meeting-minutes) report. */
export function buildAssessmentSummaryHtml(d: SummaryReportData): string {
  const committeeRows = d.header.committee
    .map(
      (m) =>
        `<tr><td>${esc(m.name)}</td><td style="text-align:right;">${esc(m.role)}</td></tr>`,
    )
    .join('');

  const semesterTables = d.semesterGroups
    .map(
      (g) => `
    <h3>${esc(g.semesterLabel)} (จำนวน ${g.rows.length} รายวิชา)</h3>
    <table>
      <thead>
        <tr><th>รหัส/ชื่อรายวิชา</th><th>ผู้รับผิดชอบรายวิชา</th><th>ผลการประเมิน</th></tr>
      </thead>
      <tbody>
        ${g.rows
          .map(
            (r) => `<tr>
              <td>${esc(r.courseCode)} ${esc(r.courseNameEn)}${revSuffix(r.part)}</td>
              <td>${esc(r.lecturerName ?? '—')}</td>
              <td>${esc(r.bandLabel ?? '—')}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>`,
    )
    .join('');

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
  <h1>รายงานการประชุมทวนสอบผลสัมฤทธิ์การศึกษา ${esc(d.scopeLabel)} ปีการศึกษา ${d.academicYear}</h1>
  <table class="meta">
    <tr><td><strong>หลักสูตร</strong></td><td>${esc(d.academicProgramLabel)}</td></tr>
    ${d.header.meetingDateTime ? `<tr><td><strong>วันเวลาประชุม</strong></td><td>${esc(d.header.meetingDateTime)}</td></tr>` : ''}
    ${d.header.venue ? `<tr><td><strong>สถานที่</strong></td><td>${esc(d.header.venue)}</td></tr>` : ''}
    <tr><td><strong>วันที่จัดทำรายงาน</strong></td><td>${esc(d.generatedAt)}</td></tr>
  </table>
</div>

${
  committeeRows
    ? `<h2>รายนามคณะกรรมการทวนสอบ</h2>
<table><tbody>${committeeRows}</tbody></table>`
    : ''
}

<h2>รายละเอียดการทวนสอบ</h2>
<p>ประจำปีการศึกษา ${d.academicYear} ${esc(d.scopeLabel)} ${
    d.coverage === 'all' && d.programRollup
      ? `มีหลักสูตรทั้งหมด ${d.programRollup.length} หลักสูตร มีรายวิชาที่รับผิดชอบสอน`
      : 'มีรายวิชาที่รับผิดชอบสอนในหลักสูตร'
  }
${d.totalOfferings} รายวิชา ดำเนินการทวนสอบผลสัมฤทธิ์แล้ว ${d.assessedOfferings} รายวิชา
คิดเป็นร้อยละ ${d.percent} ของรายวิชาที่เปิดสอน</p>

<div class="result-box">
  <strong>สัดส่วนผลการประเมิน 3 กลุ่ม:</strong>
  &nbsp; ควรปรับปรุง ${d.bandDistribution.improve}
  &nbsp; ดี ${d.bandDistribution.good}
  &nbsp; ดีเยี่ยม ${d.bandDistribution.excellent}
</div>

${d.coverage === 'all' && d.programRollup ? programRollupTable(d.programRollup) : semesterTables}

<h2>สรุปข้อเสนอแนะตามหัวข้อการทวนสอบ (7 รายการ) — คณะกรรมการทวนสอบ</h2>
${
  d.assessorSynthesized
    ? '<p class="muted" style="font-size:10px;">สรุปภาพรวมความเห็นของคณะกรรมการทวนสอบ</p>'
    : ''
}
${
  d.overallAveragePercent != null
    ? `<p><strong>ค่าเฉลี่ยผลการทวนสอบรวมทุกรายวิชา:</strong> ${d.overallAveragePercent}% (${BAND_TH(d.overallAveragePercent)})</p>`
    : ''
}
${assessorTopicTable(d.assessorTopics)}

<h2>ข้อเสนอแนะเพิ่มเติมตามหัวข้อการทวนสอบ (7 รายการ) — จากการวิเคราะห์ AI</h2>
${topicBlock(d.aiTopics)}

${signatureSection(d.header.committee)}

${
  d.coverage === 'all'
    ? programCourseListSection(d.programCourseGroups ?? [])
    : d.semesterGroups.some((g) => g.rows.length > 0)
      ? `<div style="page-break-before: always;">
  <h2>ภาคผนวก — รายงานการทวนสอบผลลัพธ์การเรียนรู้รายวิชา (รายฉบับ)</h2>
  <p>เอกสารส่วนนี้รวบรวมรายงานการทวนสอบฉบับลงนามของแต่ละรายวิชาที่ดำเนินการทวนสอบแล้ว ตามลำดับดังนี้</p>
  ${d.semesterGroups
    .map(
      (g) => `<div style="margin-top:6px;"><strong>${esc(g.semesterLabel)}</strong>
      <ol>${g.rows.map((r) => `<li>${esc(r.courseCode)} ${esc(r.courseNameEn)}${revSuffix(r.part)}</li>`).join('')}</ol></div>`,
    )
    .join('')}
</div>`
      : ''
}

<p class="muted" style="margin-top:14px;font-size:10px;">
  เอกสารนี้เป็นส่วนหนึ่งของกระบวนการทวนสอบผลลัพธ์การเรียนรู้รายวิชา
  จัดทำโดยระบบประเมินและทวนสอบรายวิชา สำนักวิชาวิทยาศาสตร์สุขภาพ มหาวิทยาลัยแม่ฟ้าหลวง
</p>

</body>
</html>`;
}
