import { REPORT_STYLES, esc, md } from './reportShared';

export interface Tqf3Meta {
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
 * Builds the printable HTML for an on-demand revised มคอ.3 draft.
 * Rendered to PDF by headless Chromium in generateTqf3Draft.
 *
 * `content` is the Markdown body returned by `runTqf3Draft`.
 */
export function buildTqf3Html(content: string, meta: Tqf3Meta): string {
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
  <h1>ร่าง มคอ.3 ฉบับปรับปรุง (จัดทำโดยระบบ AI)</h1>
  <table class="meta">
    <tr><td><strong>รายวิชา</strong></td><td>${esc(meta.courseCode)} ${esc(meta.courseNameTh)} (${esc(meta.courseNameEn)})</td></tr>
    <tr><td><strong>ปีการศึกษา</strong></td><td>${meta.academicYear} ${esc(meta.semesterLabel)} · ตอนเรียน ${esc(meta.section)}</td></tr>
    <tr><td><strong>อาจารย์ผู้รับผิดชอบ</strong></td><td>${esc(meta.lecturerName)}</td></tr>
    <tr><td><strong>วันที่จัดทำร่าง</strong></td><td>${esc(meta.generatedAt)}</td></tr>
  </table>
</div>

<div class="result-box" style="margin-bottom:14px;">
  <strong>หมายเหตุ:</strong> เอกสารนี้เป็น <em>ร่าง</em> ที่จัดทำโดยระบบ AI
  เพื่อใช้เป็นแนวทางประกอบการปรับปรุง มคอ.3 เท่านั้น
  อาจารย์ผู้รับผิดชอบต้องตรวจสอบและแก้ไขก่อนนำไปใช้จริง
</div>

<div class="section-body">${md(content)}</div>

<p class="muted" style="margin-top:14px;font-size:10px;">
  จัดทำโดยระบบประเมินและทวนสอบรายวิชา · ร่างอ้างอิงผลการวิเคราะห์ของระบบและเอกสาร มคอ.3 ต้นฉบับ
</p>

</body>
</html>`;
}
