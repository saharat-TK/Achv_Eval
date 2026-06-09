import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { renderHtmlToPdf, storeFile } from './pdf';
import {
  buildAssessmentSummaryHtml,
  type SummaryReportData,
  type SummaryTopic,
} from './assessmentSummaryHtml';
import { buildAssessmentSummaryDocx } from './assessmentSummaryDocx';
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

/**
 * Synthesize cross-course AI suggestions per rubric topic from each assessed
 * offering's AI analysis. Resilient: on any failure returns empty topics so
 * the report still generates with the assessor section intact.
 */
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
    const byNumber = new Map(
      (parsed.topics ?? []).map((t) => [t.number, t.improvements ?? []]),
    );
    return RUBRIC_TOPICS.map((t) => ({
      number: t.number,
      labelTh: t.labelTh,
      strengths: [],
      improvements: (byNumber.get(t.number) ?? []).filter((s) => typeof s === 'string' && s.trim()),
    }));
  } catch (err) {
    console.warn('AI synthesis failed; emitting empty topics', err);
    return empty;
  }
}

/**
 * Callable: generate the assessment summary report (PDF + DOCX) for a stored
 * assessmentSummaryReports document, including a Gemini-synthesized Section 3.2.
 */
export const generateAssessmentSummaryReport = onCall(
  { region: REGION, secrets: [GEMINI_API_KEY], memory: '4GiB', timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    const uid = request.auth.uid;
    const reportId = request.data?.reportId as string | undefined;
    if (!reportId) throw new HttpsError('invalid-argument', 'ต้องระบุรายงาน');

    const db = admin.firestore();
    const ref = db.collection('assessmentSummaryReports').doc(reportId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'ไม่พบรายงาน');
    const report = snap.data() as {
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
        bandDistribution: { improve: number; good: number; excellent: number };
        courseRows: CourseRow[];
        assessorTopicSummary: {
          number: string;
          labelTh: string;
          strengths: string[];
          improvements: string[];
        }[];
      };
    };

    // Authorize: admin or director of the report's academic program.
    const roles = (await db.collection('users').doc(uid).get()).data()?.roles ?? {};
    const allowed =
      roles.isAdmin === true ||
      (roles.directorOfAcademicPrograms ?? []).includes(report.academicProgramId);
    if (!allowed) throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ในหลักสูตรนี้');

    await ref.update({ status: 'generating', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    try {
      // Gather AI analysis improvements per rubric topic across assessed courses.
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

      const aiTopics = await synthesizeAiTopics(GEMINI_API_KEY.value(), perTopic);

      // Group assessed course rows by semester for the detail tables.
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

      const generatedAt = new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        dateStyle: 'long',
        timeStyle: 'short',
      });

      const data: SummaryReportData = {
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
        bandDistribution: report.snapshot.bandDistribution,
        semesterGroups,
        assessorTopics: report.snapshot.assessorTopicSummary.map((t) => ({
          number: t.number,
          labelTh: t.labelTh,
          strengths: t.strengths,
          improvements: t.improvements,
        })),
        aiTopics,
        generatedAt,
      };

      const html = buildAssessmentSummaryHtml(data);
      const [pdf, docx] = await Promise.all([
        renderHtmlToPdf(html),
        buildAssessmentSummaryDocx(data),
      ]);

      const dir = `reports/summary/${report.academicProgramId}/${report.academicYear}`;
      const base = report.scope === 'annual' ? 'annual' : `sem${report.semester}`;
      const [pdfStored, docxStored] = await Promise.all([
        storeFile(pdf, `${dir}/${base}.pdf`, 'application/pdf', `summary-${base}-${report.academicYear}.pdf`),
        storeFile(
          docx,
          `${dir}/${base}.docx`,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          `summary-${base}-${report.academicYear}.docx`,
        ),
      ]);

      await ref.update({
        aiSynthesis: aiTopics.map((t, i) => ({
          key: RUBRIC_TOPICS[i].key,
          number: t.number,
          labelTh: t.labelTh,
          strengths: t.strengths,
          improvements: t.improvements,
        })),
        status: 'ready',
        pdfStoragePath: pdfStored.filePath,
        pdfUrl: pdfStored.downloadUrl,
        docxStoragePath: docxStored.filePath,
        docxUrl: docxStored.downloadUrl,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('auditLog').add({
        occurredAt: admin.firestore.FieldValue.serverTimestamp(),
        actorId: uid,
        actorEmail: request.auth.token.email ?? null,
        action: 'summary_report_generated',
        entityType: 'assessmentSummaryReports',
        entityId: reportId,
        before: null,
        after: { assessedOfferings: report.snapshot.assessedOfferings },
      });

      return { pdfUrl: pdfStored.downloadUrl, docxUrl: docxStored.downloadUrl };
    } catch (err) {
      await ref.update({
        status: 'failed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.error('summary report generation failed', err);
      throw new HttpsError('internal', 'สร้างรายงานไม่สำเร็จ');
    }
  },
);
