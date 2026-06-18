import type { AnalysisResult } from './gemini';
import type { ReportMeta } from './reportHtml';
import {
  REPORT_STYLES,
  esc,
  renderAiSection,
  renderAssessorSection,
  renderCommitteeCover,
  renderFollowUpSection,
  renderSelfAssessmentSection,
  signatureTable,
  type AssessmentForReport,
  type CommitteeMemberForReport,
  type FollowUpForReport,
  type SelfAssessmentForReport,
} from './reportShared';

export type {
  AssessmentForReport,
  CommitteeMemberForReport,
  FollowUpForReport,
  SelfAssessmentForReport,
};

/**
 * Builds the combined report HTML: the AI analysis plus the official
 * assessor verification form (the assessor's own scores and comments),
 * rendered to PDF on sign-off.
 */
export function buildCombinedReportHtml(args: {
  aiResult: AnalysisResult;
  assessment: AssessmentForReport;
  meta: ReportMeta;
  followUp?: FollowUpForReport | null;
  selfAssessment?: SelfAssessmentForReport | null;
  committee?: CommitteeMemberForReport[] | null;
}): string {
  const { aiResult, assessment, meta, followUp, selfAssessment, committee } = args;

  // Sequential section numbers, skipping any optional section that's absent.
  let n = 1;
  const aiSection = renderAiSection(aiResult, n++);
  const selfSection = selfAssessment ? renderSelfAssessmentSection(selfAssessment, n++) : '';
  const assessorSection = renderAssessorSection(assessment, n++);
  const followUpSection = followUp ? renderFollowUpSection(followUp, n++) : '';

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
  <h1>รายงานการประเมินและทวนสอบผลสัมฤทธิ์รายวิชา (ฉบับลงนาม)</h1>
  <table class="meta">
    <tr><td><strong>รายวิชา</strong></td><td>${esc(meta.courseCode)} ${esc(meta.courseNameTh)} (${esc(meta.courseNameEn)})</td></tr>
    <tr><td><strong>ปีการศึกษา</strong></td><td>${meta.academicYear} ${esc(meta.semesterLabel)} · ตอนเรียน ${esc(meta.section)}</td></tr>
    <tr><td><strong>อาจารย์ผู้รับผิดชอบ</strong></td><td>${esc(meta.lecturerName)}</td></tr>
    <tr><td><strong>ผู้ทวนสอบ</strong></td><td>${esc(assessment.assessorName)}</td></tr>
    <tr><td><strong>วันที่ลงนามทวนสอบ</strong></td><td>${esc(assessment.signedAtText)}</td></tr>
  </table>
  ${renderCommitteeCover(committee)}
</div>

${aiSection}

${selfSection}

${assessorSection}

${followUpSection}

${signatureTable()}

<p class="muted" style="margin-top:14px;font-size:10px;">
  เอกสารนี้เป็นส่วนหนึ่งของกระบวนการทวนสอบผลลัพธ์การเรียนรู้รายวิชา
  ตามข้อกำหนดของ สป.อว. / AUN-QA Criterion 3 · ลงนามทวนสอบโดย ${esc(assessment.assessorName)}
</p>

</body>
</html>`;
}
