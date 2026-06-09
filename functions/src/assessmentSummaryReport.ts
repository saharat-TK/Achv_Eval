import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { renderHtmlToPdf, storeFile, mergePdfs, downloadStored } from './pdf';
import {
  buildAssessmentSummaryHtml,
  type SummaryReportData,
  type SummaryTopic,
} from './assessmentSummaryHtml';
import type { AnalysisResult } from './gemini';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const REGION = 'asia-southeast1';

const SEMESTER_LABEL: Record<string, string> = {
  '1': 'ภาคต้น',
  '2': 'ภาคปลาย',
  '3': 'ภาคฤดูร้อน',
};
const BAND_LABEL: Record<string, string> = {
  improve: 'ควรปรับปรุง',
  good: 'ดี',
  excellent: 'ดีเยี่ยม',
};
const RUBRIC_TOPICS: { key: string; number: string; labelTh: string }[] = [
  { key: 'item1Clo', number: '1', labelTh: 'ผลลัพธ์การเรียนรู้รายวิชา' },
  { key: 'item21Content', number: '2.1', labelTh: 'เนื้อหาการเรียนการสอน' },
  { key: 'item22Methods', number: '2.2', labelTh: 'วิธีการเรียนการสอน' },
  { key: 'item31AssessmentMethods', number: '3.1', labelTh: 'วิธีการวัดและประเมินผล' },
  { key: 'item32AssessmentForms', number: '3.2', labelTh: 'รูปแบบการประเมินผล' },
  { key: 'item33Proportions', number: '3.3', labelTh: 'สัดส่วนในแต่ละวิธีการวัดและประเมินผล' },
  { key: 'item34ExamQuality', number: '3.4', labelTh: 'คุณภาพข้อสอบ' },
];

interface CourseRow {
  offeringId: string;
  courseCode: string;
  courseNameTh: string;
  courseNameEn: string;
  semester: string;
  lecturerName: string | null;
  assessed: boolean;
  band: string | null;
}

interface StoredTopic {
  key: string;
  number: string;
  labelTh: string;
  strengths: string[];
  improvements: string[];
  averageScore?: number | null;
}

interface ReportData {
  academicProgramId: string;
  academicProgramLabel: string;
  academicYear: number;
  scope: 'semester' | 'annual';
  semester: string | null;
  header: { venue: string; meetingDateTime: string; committee: { name: string; role: string }[] };
  snapshot: {
    totalOfferings: number;
    assessedOfferings: number;
    percent: number;
    overallAveragePercent?: number | null;
    bandDistribution: { improve: number; good: number; excellent: number };
    courseRows: CourseRow[];
    assessorTopicSummary: StoredTopic[];
  };
  aiSynthesis: StoredTopic[] | null;
}

const sts = () => admin.firestore.FieldValue.serverTimestamp();

async function loadReport(
  db: admin.firestore.Firestore,
  reportId: string,
): Promise<{ ref: admin.firestore.DocumentReference; report: ReportData }> {
  const ref = db.collection('assessmentSummaryReports').doc(reportId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'ไม่พบรายงาน');
  return { ref, report: snap.data() as ReportData };
}

async function authorize(
  db: admin.firestore.Firestore,
  uid: string,
  academicProgramId: string,
): Promise<void> {
  const roles = (await db.collection('users').doc(uid).get()).data()?.roles ?? {};
  const allowed =
    roles.isAdmin === true ||
    (roles.directorOfAcademicPrograms ?? []).includes(academicProgramId);
  if (!allowed) throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ในหลักสูตรนี้');
}

function requireAuth(request: CallableRequest): { uid: string; reportId: string } {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
  const reportId = request.data?.reportId as string | undefined;
  if (!reportId) throw new HttpsError('invalid-argument', 'ต้องระบุรายงาน');
  return { uid: request.auth.uid, reportId };
}

/** Gemini synthesis of cross-course AI suggestions per rubric topic. Resilient:
 *  returns empty topics on any failure so the report can still be produced. */
async function synthesizeAiTopics(
  apiKey: string,
  perTopicImprovements: Map<string, string[]>,
): Promise<SummaryTopic[]> {
  const empty = RUBRIC_TOPICS.map((t) => ({
    number: t.number,
    labelTh: t.labelTh,
    strengths: [],
    improvements: [] as string[],
  }));

  const hasInput = [...perTopicImprovements.values()].some((v) => v.length > 0);
  if (!hasInput) return empty;

  const payload = RUBRIC_TOPICS.map((t) => ({
    number: t.number,
    labelTh: t.labelTh,
    courseSuggestions: perTopicImprovements.get(t.key) ?? [],
  }));

  const system =
    'คุณเป็นผู้ช่วยจัดทำรายงานการทวนสอบผลสัมฤทธิ์รายวิชาของสำนักวิชาวิทยาศาสตร์สุขภาพ ' +
    'หน้าที่ของคุณคือสังเคราะห์ข้อเสนอแนะจากการวิเคราะห์ AI ของหลายรายวิชา ให้เป็นข้อเสนอแนะ ' +
    'ภาพรวมระดับหลักสูตรตามหัวข้อการทวนสอบ 7 รายการ ตอบเป็นภาษาไทยและเป็น JSON เท่านั้น';

  const user =
    'ด้านล่างคือข้อเสนอแนะจากการวิเคราะห์ AI รายวิชาต่าง ๆ จัดกลุ่มตามหัวข้อการทวนสอบ ' +
    'กรุณาสรุปเป็นข้อเสนอแนะภาพรวมที่กระชับ ไม่ซ้ำซ้อน หัวข้อละไม่เกิน 4 ข้อ ' +
    'ตอบเป็น JSON รูปแบบ {"topics":[{"number":"1","improvements":["..."]}]} ตามลำดับหัวข้อเดิม\n\n' +
    JSON.stringify(payload, null, 2);

  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      systemInstruction: system,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    });
    const resp = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: user }] }],
    });
    const parsed = JSON.parse(resp.response.text()) as {
      topics?: { number?: string; improvements?: string[] }[];
    };
    const byNumber = new Map((parsed.topics ?? []).map((t) => [t.number, t.improvements ?? []]));
    return RUBRIC_TOPICS.map((t) => ({
      number: t.number,
      labelTh: t.labelTh,
      strengths: [],
      improvements: (byNumber.get(t.number) ?? []).filter(
        (s) => typeof s === 'string' && s.trim(),
      ),
    }));
  } catch (err) {
    console.warn('AI synthesis failed; emitting empty topics', err);
    return empty;
  }
}

/** Gather, synthesize, and persist aiSynthesis on the report doc. */
async function runSynthesis(
  db: admin.firestore.Firestore,
  ref: admin.firestore.DocumentReference,
  report: ReportData,
  apiKey: string,
): Promise<SummaryTopic[]> {
  const perTopic = new Map<string, string[]>(RUBRIC_TOPICS.map((t) => [t.key, []]));
  const assessed = report.snapshot.courseRows.filter((r) => r.assessed);
  for (const row of assessed) {
    const offSnap = await db.collection('offerings').doc(row.offeringId).get();
    const aiId = offSnap.data()?.latestAiReportId as string | undefined;
    if (!aiId) continue;
    const aiSnap = await offSnap.ref.collection('aiReports').doc(aiId).get();
    const result = aiSnap.data()?.structuredOutput as AnalysisResult | undefined;
    if (!result?.section4Verification?.items) continue;
    for (const item of result.section4Verification.items) {
      const imp = item.improvements?.trim();
      if (imp && perTopic.has(item.key)) perTopic.get(item.key)!.push(imp);
    }
  }

  const aiTopics = await synthesizeAiTopics(apiKey, perTopic);
  await ref.update({
    aiSynthesis: aiTopics.map((t, i) => ({
      key: RUBRIC_TOPICS[i].key,
      number: t.number,
      labelTh: t.labelTh,
      strengths: t.strengths,
      improvements: t.improvements,
    })),
    updatedAt: sts(),
  });
  return aiTopics;
}

function assembleData(report: ReportData, aiTopics: SummaryTopic[]): SummaryReportData {
  const assessed = report.snapshot.courseRows.filter((r) => r.assessed);
  const groupsMap = new Map<string, CourseRow[]>();
  for (const r of assessed) {
    if (!groupsMap.has(r.semester)) groupsMap.set(r.semester, []);
    groupsMap.get(r.semester)!.push(r);
  }
  const semesterGroups = [...groupsMap.keys()]
    .sort((a, b) => Number(a) - Number(b))
    .map((sem) => ({
      semesterLabel: SEMESTER_LABEL[sem] ?? sem,
      rows: groupsMap.get(sem)!.map((r) => ({
        courseCode: r.courseCode,
        courseNameEn: r.courseNameEn,
        courseNameTh: r.courseNameTh,
        lecturerName: r.lecturerName,
        bandLabel: r.band ? BAND_LABEL[r.band] ?? r.band : null,
      })),
    }));

  return {
    academicProgramLabel: report.academicProgramLabel,
    academicYear: report.academicYear,
    scopeLabel:
      report.scope === 'annual'
        ? 'ประจำปีการศึกษา'
        : SEMESTER_LABEL[report.semester ?? ''] ?? '',
    header: report.header,
    totalOfferings: report.snapshot.totalOfferings,
    assessedOfferings: report.snapshot.assessedOfferings,
    percent: report.snapshot.percent,
    overallAveragePercent: report.snapshot.overallAveragePercent ?? null,
    bandDistribution: report.snapshot.bandDistribution,
    semesterGroups,
    assessorTopics: report.snapshot.assessorTopicSummary.map((t) => ({
      number: t.number,
      labelTh: t.labelTh,
      strengths: t.strengths,
      improvements: t.improvements,
      averageScore: t.averageScore ?? null,
    })),
    aiTopics,
    generatedAt: new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'long',
      timeStyle: 'short',
    }),
  };
}

/** Download each assessed course's signed combined report PDF, in row order. */
async function collectCourseCombinedPdfs(
  db: admin.firestore.Firestore,
  courseRows: CourseRow[],
): Promise<Buffer[]> {
  const parts: Buffer[] = [];
  for (const row of courseRows.filter((r) => r.assessed)) {
    const offSnap = await db.collection('offerings').doc(row.offeringId).get();
    const assessmentId = offSnap.data()?.assessmentId as string | undefined;
    if (!assessmentId) continue;
    const aSnap = await offSnap.ref.collection('assessments').doc(assessmentId).get();
    const path = aSnap.data()?.signedPdfStoragePath as string | undefined;
    if (!path) continue;
    const bytes = await downloadStored(path);
    if (bytes) parts.push(bytes);
  }
  return parts;
}

/**
 * Callable: run AI analysis + synthesis for Section 3.2 and store it on the
 * report. Invoked right after a report is created so the AI suggestions are
 * ready ahead of PDF/DOCX rendering.
 */
export const synthesizeAssessmentReport = onCall(
  { region: REGION, secrets: [GEMINI_API_KEY], memory: '1GiB', timeoutSeconds: 120 },
  async (request) => {
    const { uid, reportId } = requireAuth(request);
    const db = admin.firestore();
    const { ref, report } = await loadReport(db, reportId);
    await authorize(db, uid, report.academicProgramId);

    await ref.update({ status: 'synthesizing', updatedAt: sts() });
    try {
      await runSynthesis(db, ref, report, GEMINI_API_KEY.value());
      await ref.update({ status: 'synthesized', updatedAt: sts() });
      return { ok: true };
    } catch (err) {
      await ref.update({ status: 'failed', updatedAt: sts() });
      console.error('synthesis failed', err);
      throw new HttpsError('internal', 'วิเคราะห์และสังเคราะห์ข้อเสนอแนะไม่สำเร็จ');
    }
  },
);

/**
 * Callable: render the report PDF + DOCX from the stored snapshot and
 * aiSynthesis. If synthesis hasn't run yet, it is performed inline first.
 */
export const generateAssessmentSummaryReport = onCall(
  { region: REGION, secrets: [GEMINI_API_KEY], memory: '4GiB', timeoutSeconds: 300 },
  async (request) => {
    const { uid, reportId } = requireAuth(request);
    const db = admin.firestore();
    const { ref, report } = await loadReport(db, reportId);
    await authorize(db, uid, report.academicProgramId);

    await ref.update({ status: 'rendering', updatedAt: sts() });
    try {
      const aiTopics: SummaryTopic[] = report.aiSynthesis
        ? report.aiSynthesis.map((t) => ({
            number: t.number,
            labelTh: t.labelTh,
            strengths: t.strengths,
            improvements: t.improvements,
          }))
        : await runSynthesis(db, ref, report, GEMINI_API_KEY.value());

      const data = assembleData(report, aiTopics);
      const html = buildAssessmentSummaryHtml(data);
      const summaryPdf = await renderHtmlToPdf(html);

      // Appendix: append each assessed course's signed combined report PDF, in
      // report order (semester, then course code). Missing/unreadable ones are
      // skipped so a single bad artifact never fails the whole report.
      const appendixParts = await collectCourseCombinedPdfs(db, report.snapshot.courseRows);
      const finalPdf = appendixParts.length
        ? await mergePdfs([summaryPdf, ...appendixParts])
        : summaryPdf;

      const dir = `reports/summary/${report.academicProgramId}/${report.academicYear}`;
      const base = report.scope === 'annual' ? 'annual' : `sem${report.semester}`;
      const pdfStored = await storeFile(
        finalPdf,
        `${dir}/${base}.pdf`,
        'application/pdf',
        `summary-${base}-${report.academicYear}.pdf`,
      );

      await ref.update({
        status: 'ready',
        pdfStoragePath: pdfStored.filePath,
        pdfUrl: pdfStored.downloadUrl,
        docxStoragePath: null,
        docxUrl: null,
        generatedAt: sts(),
        updatedAt: sts(),
      });

      await db.collection('auditLog').add({
        occurredAt: sts(),
        actorId: uid,
        actorEmail: request.auth!.token.email ?? null,
        action: 'summary_report_generated',
        entityType: 'assessmentSummaryReports',
        entityId: reportId,
        before: null,
        after: { assessedOfferings: report.snapshot.assessedOfferings },
      });

      return { pdfUrl: pdfStored.downloadUrl };
    } catch (err) {
      await ref.update({ status: 'failed', updatedAt: sts() });
      console.error('summary report generation failed', err);
      throw new HttpsError('internal', 'สร้างรายงานไม่สำเร็จ');
    }
  },
);
