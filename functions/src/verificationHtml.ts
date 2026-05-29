import type { AnalysisResult } from './gemini';
import type { ReportMeta } from './reportHtml';
import {
  REPORT_STYLES,
  esc,
  renderAiSection,
  renderAssessorSection,
  renderFollowUpSection,
  signatureTable,
  type AssessmentForReport,
  type FollowUpForReport,
} from './reportShared';

export type { FollowUpForReport };

export interface VerificationForReport {
  decision: 'verified' | 'needs_follow_up';
  verifierName: string;
  signedAtText: string;
  committeeNotes: string | null;
  requiredActions: string | null;
}

const DECISION_TH: Record<VerificationForReport['decision'], string> = {
  verified: 'รับรองผลการทวนสอบ',
  needs_follow_up: 'รับรองแบบมีเงื่อนไข / ต้องติดตาม',
};

/**
 * Builds the final verification report HTML: the AI analysis, the assessor's
 * official form, and the verification committee's final sign-off decision.
 * Rendered to PDF when the committee signs off (Phase 4B-2).
 */
export function buildFinalVerificationHtml(args: {
  aiResult: AnalysisResult;
  assessment: AssessmentForReport;
  verification: VerificationForReport;
  meta: ReportMeta;
  followUp?: FollowUpForReport | null;
}): string {
  const { aiResult, assessment, verification, meta, followUp } = args;

  const committeeSectionNumber = followUp ? 4 : 3;
  const committeeSection = `
<h2>ส่วนที่ ${committeeSectionNumber} — ผลการรับรองขั้นสุดท้ายของคณะกรรมการ <span class="official">ฉบับทางการ</span></h2>
<div class="result-box">
  <p><strong>มติการรับรอง:</strong> ${esc(DECISION_TH[verification.decision])}</p>
  ${
    verification.committeeNotes
      ? `<p><strong>บันทึก / ข้อสังเกตของคณะกรรมการ:</strong><br/>${esc(verification.committeeNotes)}</p>`
      : ''
  }
  ${
    verification.requiredActions
      ? `<p><strong>รายการที่ต้องติดตาม:</strong><br/>${esc(verification.requiredActions)}</p>`
      : ''
  }
  <p class="muted">รับรองโดย ${esc(verification.verifierName)} · ${esc(verification.signedAtText)}</p>
</div>`;

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
  <h1>รายงานการประเมินและทวนสอบผลสัมฤทธิ์รายวิชา (ฉบับรับรองสุดท้าย)</h1>
  <table class="meta">
    <tr><td><strong>รายวิชา</strong></td><td>${esc(meta.courseCode)} ${esc(meta.courseNameTh)} (${esc(meta.courseNameEn)})</td></tr>
    <tr><td><strong>ปีการศึกษา</strong></td><td>${meta.academicYear} ${esc(meta.semesterLabel)} · ตอนเรียน ${esc(meta.section)}</td></tr>
    <tr><td><strong>อาจารย์ผู้รับผิดชอบ</strong></td><td>${esc(meta.lecturerName)}</td></tr>
    <tr><td><strong>ผู้ทวนสอบ</strong></td><td>${esc(assessment.assessorName)}</td></tr>
    <tr><td><strong>คณะกรรมการรับรองผล</strong></td><td>${esc(verification.verifierName)}</td></tr>
    <tr><td><strong>วันที่รับรองผล</strong></td><td>${esc(verification.signedAtText)}</td></tr>
  </table>
</div>

${renderAiSection(aiResult)}

${renderAssessorSection(assessment)}

${followUp ? renderFollowUpSection(followUp) : ''}

${committeeSection}

${signatureTable()}

<p class="muted" style="margin-top:14px;font-size:10px;">
  เอกสารนี้เป็นส่วนหนึ่งของกระบวนการทวนสอบผลลัพธ์การเรียนรู้รายวิชา
  ตามข้อกำหนดของ สป.อว. / AUN-QA Criterion 3 · รับรองผลโดย ${esc(verification.verifierName)}
</p>

</body>
</html>`;
}
