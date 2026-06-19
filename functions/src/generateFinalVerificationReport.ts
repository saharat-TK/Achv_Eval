import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { renderHtmlToPdf, storePdf } from './pdf';
import { buildFinalVerificationHtml } from './verificationHtml';
import type { ReportMeta } from './reportHtml';
import type { AnalysisResult } from './gemini';
import { normalizeSignOffKind } from './reportShared';
import type {
  FollowUpForReport,
  RubricScore,
  SelfAssessmentForReport,
  SignOffKind,
} from './reportShared';
import {
  getProgramCode,
  offeringReportDir,
  offeringReportFileName,
} from './storagePaths';

const REGION = 'asia-southeast1';
const SEMESTER_LABEL: Record<string, string> = {
  '1': 'ภาคต้น',
  '2': 'ภาคปลาย',
  '3': 'ภาคฤดูร้อน',
};

function thaiDateTime(value: unknown): string {
  const date =
    value && typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : new Date();
  return date.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

/**
 * Callable: generate the final verification PDF after the committee signs
 * off — the AI analysis, the assessor's official form, and the committee's
 * final decision. Invoked by the verifier's browser after sign-off; stores
 * the PDF in Storage and writes its URL onto the verification document.
 */
export const generateFinalVerificationReport = onCall(
  { region: REGION, memory: '4GiB', timeoutSeconds: 180 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    }
    const uid = request.auth.uid;
    const offeringId = request.data?.offeringId as string | undefined;
    const verificationId = request.data?.verificationId as string | undefined;
    if (!offeringId || !verificationId) {
      throw new HttpsError('invalid-argument', 'ต้องระบุรายวิชาและผลการรับรอง');
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
      previousOfferingId: string | null;
      status?: string;
    };

    // Authorize: signing a verification is committee-only. Mirrors the
    // /api/verification/submit route.
    const userSnap = await db.collection('users').doc(uid).get();
    const roles = (userSnap.data()?.roles ?? {}) as {
      verifierOf?: string[];
    };
    const allowed = (roles.verifierOf ?? []).includes(offering.programId);
    if (!allowed) {
      throw new HttpsError('permission-denied', 'ท่านไม่มีสิทธิ์รับรองผลของหลักสูตรนี้');
    }

    // Load the signed verification.
    const verificationRef = offeringRef
      .collection('verifications')
      .doc(verificationId);
    const verificationSnap = await verificationRef.get();
    if (!verificationSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบผลการรับรอง');
    }
    const verification = verificationSnap.data()!;
    if (verification.isLocked !== true) {
      throw new HttpsError('failed-precondition', 'ต้องลงนามรับรองผลก่อนจึงจะสร้างรายงานได้');
    }

    // Load the assessor's signed assessment.
    if (!verification.assessmentId) {
      throw new HttpsError('failed-precondition', 'ไม่พบผลการทวนสอบของผู้ทวนสอบ');
    }
    const assessmentSnap = await offeringRef
      .collection('assessments')
      .doc(verification.assessmentId)
      .get();
    if (!assessmentSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบผลการทวนสอบ');
    }
    const assessment = assessmentSnap.data()!;
    const signOffKind = inferSignOffKind(assessment.signOffKind, offering.status);
    if (signOffKind === 'documents_only') {
      throw new HttpsError(
        'failed-precondition',
        'เอกสารเท่านั้นยังไม่สามารถสร้างรายงานรับรองผลขั้นสุดท้ายได้',
      );
    }

    // Load the AI analysis result.
    const aiReportId = verification.aiReportId ?? offering.latestAiReportId;
    if (!aiReportId) {
      throw new HttpsError('failed-precondition', 'ยังไม่มีรายงานการวิเคราะห์');
    }
    const aiSnap = await offeringRef.collection('aiReports').doc(aiReportId).get();
    const aiResult = aiSnap.data()?.structuredOutput as AnalysisResult | undefined;
    if (!aiResult) {
      throw new HttpsError('failed-precondition', 'ไม่พบผลการวิเคราะห์ของรายวิชา');
    }

    let lecturerName = offering.lecturerEmail ?? '';
    if (offering.lecturerId) {
      const u = await db.collection('users').doc(offering.lecturerId).get();
      lecturerName = (u.data()?.nameTh as string) || lecturerName;
    }

    const meta: ReportMeta = {
      courseCode: offering.courseCode,
      courseNameTh: offering.courseNameTh,
      courseNameEn: offering.courseNameEn,
      academicYear: offering.academicYear,
      semesterLabel: SEMESTER_LABEL[offering.semester] ?? offering.semester,
      section: offering.section,
      lecturerName,
      generatedAt: thaiDateTime(verification.signedAt),
    };

    // Load the follow-up review for this offering, if one was recorded. It
    // becomes "ส่วนที่ 3 — ติดตามผลการปรับปรุง" in the final verification report.
    let followUp: FollowUpForReport | null = null;
    const reviewSnap = await offeringRef
      .collection('followUpReview')
      .doc('review')
      .get();
    if (reviewSnap.exists && offering.previousOfferingId) {
      const review = reviewSnap.data()!;
      const prevOfferingSnap = await db
        .collection('offerings')
        .doc(offering.previousOfferingId)
        .get();
      const prevOffering = prevOfferingSnap.data() as
        | {
            academicYear: number;
            semester: string;
            section: string;
            assessmentId: string | null;
          }
        | undefined;

      let previousScores: Record<string, RubricScore> = {};
      let previousComments: Record<
        string,
        { strengths?: string; improvements?: string }
      > = {};
      let previousAssessorName = '';
      const prevAssessmentId =
        (review.previousAssessmentId as string | undefined) ||
        prevOffering?.assessmentId ||
        undefined;
      if (prevAssessmentId && prevOfferingSnap.exists) {
        const prevAssessmentSnap = await prevOfferingSnap.ref
          .collection('assessments')
          .doc(prevAssessmentId)
          .get();
        const prevAssessment = prevAssessmentSnap.data();
        if (prevAssessment) {
          previousScores = prevAssessment.scores ?? {};
          previousComments = prevAssessment.comments ?? {};
          previousAssessorName = prevAssessment.assessorName ?? '';
        }
      }

      const previousTermText = prevOffering
        ? `${prevOffering.academicYear} ${
            SEMESTER_LABEL[prevOffering.semester] ?? prevOffering.semester
          } · ตอนเรียน ${prevOffering.section}`
        : '';

      followUp = {
        previousTermText,
        previousAssessorName,
        reviewerName: (review.reviewerName as string) ?? '',
        itemDecisions: (review.itemDecisions as Record<string, string>) ?? {},
        itemComments: (review.itemComments as Record<string, string>) ?? {},
        previousScores,
        previousComments,
        notes: (review.notes as string | null) ?? null,
      };
    }

    // Lecturer self-assessment, if recorded — shown before the assessor's
    // official result in the final verification report.
    let selfAssessment: SelfAssessmentForReport | null = null;
    const selfSnap = await offeringRef.collection('selfAssessment').doc('self').get();
    if (selfSnap.exists) {
      const s = selfSnap.data()!;
      selfAssessment = {
        lecturerName: (s.lecturerName as string) || lecturerName,
        scores: (s.scores as Record<string, RubricScore>) ?? {},
        comments:
          (s.comments as Record<string, { strengths?: string; improvements?: string }>) ?? {},
        generalNotes: (s.generalNotes as string | null) ?? null,
      };
    }

    const html = buildFinalVerificationHtml({
      signOffKind,
      aiResult,
      followUp,
      selfAssessment,
      committee: signOffKind === 'committee' ? assessment.committeeSnapshot ?? null : null,
      assessment: {
        assessorName: assessment.assessorName ?? '',
        signedAtText: thaiDateTime(assessment.signedAt),
        scores: assessment.scores ?? {},
        comments: assessment.comments ?? {},
        totalScore: assessment.totalScore ?? 0,
        maxScore: assessment.maxScore ?? 21,
        percentScore: assessment.percentScore ?? 0,
        band: assessment.band ?? 'improve',
        generalNotes: assessment.generalNotes ?? null,
      },
      verification: {
        decision: verification.decision,
        verifierName: verification.verifierName ?? '',
        signedAtText: thaiDateTime(verification.signedAt),
        committeeNotes: verification.committeeNotes ?? null,
        requiredActions: verification.requiredActions ?? null,
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
      `${dir}/final-verification-${verificationId}.pdf`,
      offeringReportFileName('final-verification', pathParts, verificationId),
    );

    await verificationRef.update({
      finalPdfStoragePath: filePath,
      finalPdfUrl: downloadUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('auditLog').add({
      occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      actorId: uid,
      actorEmail: request.auth.token.email ?? null,
      action: 'final_verification_report_generated',
      entityType: 'verifications',
      entityId: verificationId,
      before: null,
      after: null,
    });

    return { url: downloadUrl };
  },
);

function inferSignOffKind(value: unknown, status: unknown): SignOffKind {
  if (value) return normalizeSignOffKind(value);
  if (status === 'assessed_self_only') return 'self_only';
  if (status === 'closed_documents_only') return 'documents_only';
  return 'committee';
}
