import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { renderHtmlToPdf, storePdf } from './pdf';
import { buildCombinedReportHtml } from './assessmentHtml';
import {
  getProgramCode,
  offeringReportDir,
  offeringReportFileName,
} from './storagePaths';
import type { ReportMeta } from './reportHtml';
import type { AnalysisResult } from './gemini';

const REGION = 'asia-southeast1';
const SEMESTER_LABEL: Record<string, string> = {
  '1': 'ภาคต้น',
  '2': 'ภาคปลาย',
  '3': 'ภาคฤดูร้อน',
};

/**
 * Callable: generate the combined report PDF for a signed-off assessment —
 * the AI analysis plus the assessor's official 7-item verification form.
 *
 * Invoked by the assessor's browser after sign-off. Stores the PDF in
 * Firebase Storage and writes its URL onto the assessment document.
 */
export const generateCombinedReport = onCall(
  { region: REGION, memory: '2GiB', timeoutSeconds: 180 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    }
    const uid = request.auth.uid;
    const offeringId = request.data?.offeringId as string | undefined;
    const assessmentId = request.data?.assessmentId as string | undefined;
    if (!offeringId || !assessmentId) {
      throw new HttpsError('invalid-argument', 'ต้องระบุรายวิชาและผลการทวนสอบ');
    }

    const db = admin.firestore();

    const offeringRef = db.collection('offerings').doc(offeringId);
    const offeringSnap = await offeringRef.get();
    if (!offeringSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบรายวิชา');
    }
    const offering = offeringSnap.data() as {
      programId: string;
      courseCode: string;
      courseNameTh: string;
      courseNameEn: string;
      academicYear: number;
      semester: string;
      section: string;
      lecturerId: string | null;
      lecturerEmail: string | null;
      latestAiReportId: string | null;
    };

    // Authorize: caller must be an assessor of the program (or admin).
    const userSnap = await db.collection('users').doc(uid).get();
    const roles = (userSnap.data()?.roles ?? {}) as {
      isAdmin?: boolean;
      assessorOf?: string[];
    };
    const allowed =
      roles.isAdmin === true ||
      (roles.assessorOf ?? []).includes(offering.programId);
    if (!allowed) {
      throw new HttpsError('permission-denied', 'ท่านไม่ใช่ผู้ทวนสอบของหลักสูตรนี้');
    }

    // Load the signed assessment.
    const assessmentRef = offeringRef.collection('assessments').doc(assessmentId);
    const assessmentSnap = await assessmentRef.get();
    if (!assessmentSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบผลการทวนสอบ');
    }
    const assessment = assessmentSnap.data()!;
    if (!assessment.isLocked) {
      throw new HttpsError('failed-precondition', 'ต้องลงนามทวนสอบก่อนจึงจะสร้างรายงานได้');
    }

    // Load the latest AI analysis result.
    if (!offering.latestAiReportId) {
      throw new HttpsError('failed-precondition', 'ยังไม่มีรายงานการวิเคราะห์');
    }
    const aiSnap = await offeringRef
      .collection('aiReports')
      .doc(offering.latestAiReportId)
      .get();
    const aiResult = aiSnap.data()?.structuredOutput as AnalysisResult | undefined;
    if (!aiResult) {
      throw new HttpsError('failed-precondition', 'ไม่พบผลการวิเคราะห์ของรายวิชา');
    }

    let lecturerName = offering.lecturerEmail ?? '';
    if (offering.lecturerId) {
      const u = await db.collection('users').doc(offering.lecturerId).get();
      lecturerName = (u.data()?.nameTh as string) || lecturerName;
    }

    const signedAt: Date =
      typeof assessment.signedAt?.toDate === 'function'
        ? assessment.signedAt.toDate()
        : new Date();
    const signedAtText = signedAt.toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'long',
      timeStyle: 'short',
    });

    const meta: ReportMeta = {
      courseCode: offering.courseCode,
      courseNameTh: offering.courseNameTh,
      courseNameEn: offering.courseNameEn,
      academicYear: offering.academicYear,
      semesterLabel: SEMESTER_LABEL[offering.semester] ?? offering.semester,
      section: offering.section,
      lecturerName,
      generatedAt: signedAtText,
    };

    const html = buildCombinedReportHtml({
      aiResult,
      assessment: {
        assessorName: assessment.assessorName ?? '',
        signedAtText,
        scores: assessment.scores ?? {},
        comments: assessment.comments ?? {},
        totalScore: assessment.totalScore ?? 0,
        maxScore: assessment.maxScore ?? 21,
        percentScore: assessment.percentScore ?? 0,
        band: assessment.band ?? 'improve',
        generalNotes: assessment.generalNotes ?? null,
      },
      meta,
    });

    const pdf = await renderHtmlToPdf(html);
    const programCode = await getProgramCode(db, offering.programId);
    const pathParts = {
      programCode,
      courseCode: offering.courseCode,
      academicYear: offering.academicYear,
      semester: offering.semester,
      section: offering.section,
    };
    const dir = offeringReportDir(pathParts);
    const { filePath, downloadUrl } = await storePdf(
      pdf,
      `${dir}/combined-${assessmentId}.pdf`,
      offeringReportFileName('combined-report', pathParts, assessmentId),
    );

    await assessmentRef.update({
      signedPdfStoragePath: filePath,
      signedPdfUrl: downloadUrl,
    });

    await db.collection('auditLog').add({
      occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      actorId: uid,
      actorEmail: request.auth.token.email ?? null,
      action: 'combined_report_generated',
      entityType: 'assessments',
      entityId: assessmentId,
      before: null,
      after: null,
    });

    return { url: downloadUrl };
  },
);
