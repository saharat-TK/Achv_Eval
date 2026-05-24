import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runAnalysis, type InputFile } from './gemini';
import { generateAndStoreReport } from './reportPdf';
import { createNotification } from './notifications';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const LOG_SHEET_ID = defineString('GOOGLE_LOG_SHEET_ID', { default: '' });
const REGION = 'asia-southeast1';
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB across all files
const ANALYSIS_ATTEMPT_LIMIT = 4;
const ANALYSIS_ALLOWED_STATUSES = new Set([
  'documents_pending',
  'ready_for_ai',
  'ai_complete',
]);

interface CallFile {
  type: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
}

/**
 * Callable: analyze one course offering.
 *
 * The lecturer's browser sends the TQF/grade files in the call payload.
 * Files are streamed to Gemini and never persisted. The function writes an
 * aiReports document the client subscribes to for status.
 */
export const analyzeCourse = onCall(
  {
    region: REGION,
    secrets: [GEMINI_API_KEY],
    // Four section-by-section Gemini calls (~60-120s) plus headless-Chromium
    // PDF rendering. 2 GiB is required for Chromium.
    timeoutSeconds: 540,
    memory: '2GiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    }
    const uid = request.auth.uid;
    const actorEmail = request.auth.token.email ?? null;

    const offeringId = request.data?.offeringId as string | undefined;
    const files = (request.data?.files as CallFile[] | undefined) ?? [];

    if (!offeringId || files.length === 0) {
      throw new HttpsError('invalid-argument', 'ต้องระบุรายวิชาและแนบไฟล์อย่างน้อย 1 ไฟล์');
    }
    const totalBytes = files.reduce(
      (sum, f) => sum + Math.floor((f.dataBase64?.length ?? 0) * 0.75),
      0,
    );
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new HttpsError('invalid-argument', 'ขนาดไฟล์รวมเกิน 25 MB');
    }

    const db = admin.firestore();

    // ----- Authorize: caller must be the assigned lecturer ------------
    const offeringRef = db.collection('offerings').doc(offeringId);
    const reportsRef = offeringRef.collection('aiReports');
    const offeringSnap = await offeringRef.get();
    if (!offeringSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบรายวิชา');
    }
    const offering = offeringSnap.data() as {
      programId: string;
      lecturerId: string | null;
      courseCode?: string;
      academicYear: number;
      semester: string;
      status?: string;
      analysisAttemptLimit?: number;
      analysisAttemptCount?: number;
    };
    if (offering.lecturerId !== uid) {
      throw new HttpsError('permission-denied', 'ท่านไม่ใช่ผู้รับผิดชอบรายวิชานี้');
    }

    // The guideline + promptTemplate are resolved inside the transaction
    // below (per the accepted attempt) and read after it.
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    // Existing offerings may predate attempt counters. Count current reports
    // once and use that as the transactional fallback for those records.
    const existingReportCountSnap = await reportsRef.count().get();
    const existingReportCount = existingReportCountSnap.data().count;
    const reportRef = reportsRef.doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const accepted = await db.runTransaction(async (tx) => {
      const currentOfferingSnap = await tx.get(offeringRef);
      if (!currentOfferingSnap.exists) {
        throw new HttpsError('not-found', 'ไม่พบรายวิชา');
      }
      const currentOffering = currentOfferingSnap.data() as {
        programId: string;
        lecturerId: string | null;
        academicYear: number;
        semester: string;
        status?: string;
        latestAiReportId?: string | null;
        analysisAttemptLimit?: number;
        analysisAttemptCount?: number;
      };
      if (currentOffering.lecturerId !== uid) {
        throw new HttpsError('permission-denied', 'ท่านไม่ใช่ผู้รับผิดชอบรายวิชานี้');
      }
      if (!ANALYSIS_ALLOWED_STATUSES.has(currentOffering.status ?? 'documents_pending')) {
        throw new HttpsError(
          'failed-precondition',
          'รายวิชานี้เข้าสู่ขั้นตอนทวนสอบแล้ว ไม่สามารถวิเคราะห์ใหม่ได้',
        );
      }

      const attemptLimit = currentOffering.analysisAttemptLimit ?? ANALYSIS_ATTEMPT_LIMIT;
      const usedAttempts =
        typeof currentOffering.analysisAttemptCount === 'number'
          ? currentOffering.analysisAttemptCount
          : Math.min(existingReportCount, attemptLimit);
      if (usedAttempts >= attemptLimit) {
        throw new HttpsError(
          'failed-precondition',
          `ใช้สิทธิ์วิเคราะห์ครบ ${attemptLimit} ครั้งแล้ว`,
        );
      }

      const programRef = db.collection('programs').doc(currentOffering.programId);
      const programSnap = await tx.get(programRef);
      const program = programSnap.data() as { level?: string } | undefined;
      const promptTemplate =
        program?.level === 'undergraduate' ? 'CLAUDE.undergrad.md' : 'CLAUDE.master.md';
      const version = usedAttempts + 1;

      tx.set(reportRef, {
        offeringId,
        version,
        academicYear: currentOffering.academicYear,
        semester: currentOffering.semester,
        status: 'running',
        promptTemplate,
        geminiModel: model,
        geminiRequestId: null,
        inputTokenCount: null,
        outputTokenCount: null,
        inputFiles: files.map((f) => ({
          type: f.type,
          filename: f.filename,
          sizeBytes: Math.floor((f.dataBase64?.length ?? 0) * 0.75),
        })),
        reportStoragePath: null,
        reportDownloadUrl: null,
        logSheetRowId: null,
        structuredOutput: null,
        gradeStats: null,
        errorMessage: null,
        startedAt: now,
        completedAt: null,
        createdAt: now,
        createdBy: uid,
      });
      tx.update(offeringRef, {
        status: 'ai_in_progress',
        analysisAttemptLimit: attemptLimit,
        analysisAttemptCount: version,
        updatedAt: now,
        updatedBy: uid,
      });

      return {
        version,
        promptTemplate,
        previousLatestAiReportId: currentOffering.latestAiReportId ?? null,
      };
    });

    const guideline = readFileSync(
      join(__dirname, '..', 'prompts', accepted.promptTemplate),
      'utf-8',
    );
    // ----- Run the analysis -------------------------------------------
    try {
      const geminiFiles: InputFile[] = files.map((f) => ({
        type: f.type,
        filename: f.filename,
        mimeType: f.mimeType,
        dataBase64: f.dataBase64,
      }));

      const { result, usage } = await runAnalysis({
        apiKey: GEMINI_API_KEY.value(),
        model,
        guideline,
        files: geminiFiles,
      });

      await reportRef.update({
        status: 'succeeded',
        structuredOutput: result,
        inputTokenCount: usage.input,
        outputTokenCount: usage.output,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await offeringRef.update({
        status: 'ai_complete',
        latestAiReportId: reportRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: uid,
      });
      await writeAudit(db, uid, actorEmail, 'ai_analysis_succeeded', reportRef.id);
      await deleteOlderReports(reportsRef, reportRef.id);

      // Notify the lecturer. Assessors are notified only after the lecturer
      // explicitly sends the completed AI report for assessment.
      try {
        if (offering.lecturerId) {
          await createNotification({
            recipientId: offering.lecturerId,
            type: 'ai_analysis_ready',
            title: 'ผลวิเคราะห์ AI พร้อมแล้ว',
            body: `รายวิชา ${offering.courseCode ?? ''} ได้รับการวิเคราะห์เรียบร้อยแล้ว`.trim(),
            relatedOfferingId: offeringId,
          });
        }
      } catch (notifyErr) {
        console.error('notification failed (non-fatal)', notifyErr);
      }

      // Generate the PDF report inline. Non-fatal: the analysis is already
      // marked 'succeeded' and visible to the lecturer; a PDF failure only
      // means the download link is missing and can be retried.
      try {
        await generateAndStoreReport({
          offeringId,
          reportId: reportRef.id,
          reportRef,
          result,
          logSheetId: LOG_SHEET_ID.value(),
        });
      } catch (pdfErr) {
        console.error('generateAndStoreReport failed (non-fatal)', pdfErr);
      }

      return { reportId: reportRef.id, version: accepted.version, status: 'succeeded' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const existingLatest = accepted.previousLatestAiReportId
        ? await reportsRef.doc(accepted.previousLatestAiReportId).get()
        : null;
      if (existingLatest?.exists) {
        await reportRef.delete();
      } else {
        await reportRef.update({
          status: 'failed',
          errorMessage: message,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      // Revert offering so the lecturer can retry.
      await offeringRef.update({
        status: 'ready_for_ai',
        latestAiReportId: accepted.previousLatestAiReportId,
        lastAnalysisError: message,
        lastAnalysisFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: uid,
      });
      await writeAudit(db, uid, actorEmail, 'ai_analysis_failed', reportRef.id);
      throw new HttpsError('internal', `การวิเคราะห์ล้มเหลว: ${message}`);
    }
  },
);

async function deleteOlderReports(
  reportsRef: admin.firestore.CollectionReference,
  keepReportId: string,
): Promise<void> {
  const snap = await reportsRef.get();
  const oldReports = snap.docs.filter((doc) => doc.id !== keepReportId);
  if (oldReports.length === 0) return;

  const bucket = admin.storage().bucket();
  await Promise.all(
    oldReports.map(async (doc) => {
      const path = doc.data()?.reportStoragePath;
      if (typeof path === 'string' && path) {
        try {
          await bucket.file(path).delete({ ignoreNotFound: true });
        } catch (err) {
          console.error(`failed to delete old AI report PDF ${path}`, err);
        }
      }
    }),
  );

  for (let i = 0; i < oldReports.length; i += 450) {
    const batch = admin.firestore().batch();
    for (const doc of oldReports.slice(i, i + 450)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function writeAudit(
  db: admin.firestore.Firestore,
  actorId: string,
  actorEmail: string | null,
  action: string,
  reportId: string,
): Promise<void> {
  await db.collection('auditLog').add({
    occurredAt: admin.firestore.FieldValue.serverTimestamp(),
    actorId,
    actorEmail,
    action,
    entityType: 'aiReports',
    entityId: reportId,
    before: null,
    after: null,
  });
}
