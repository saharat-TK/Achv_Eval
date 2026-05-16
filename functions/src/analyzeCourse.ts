import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runAnalysis, type InputFile } from './gemini';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const REGION = 'asia-southeast1';
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB across all files

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
    timeoutSeconds: 300,
    memory: '1GiB',
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
    const offeringSnap = await offeringRef.get();
    if (!offeringSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบรายวิชา');
    }
    const offering = offeringSnap.data() as {
      programId: string;
      lecturerId: string | null;
    };
    if (offering.lecturerId !== uid) {
      throw new HttpsError('permission-denied', 'ท่านไม่ใช่ผู้รับผิดชอบรายวิชานี้');
    }

    // ----- Pick the guideline by program level ------------------------
    const programSnap = await db.collection('programs').doc(offering.programId).get();
    const program = programSnap.data() as { level?: string } | undefined;
    const promptTemplate =
      program?.level === 'undergraduate' ? 'CLAUDE.undergrad.md' : 'CLAUDE.master.md';
    const guideline = readFileSync(
      join(__dirname, '..', 'prompts', promptTemplate),
      'utf-8',
    );

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro';

    // ----- Create the aiReports doc (running) -------------------------
    const reportsRef = offeringRef.collection('aiReports');
    const existing = await reportsRef.count().get();
    const version = existing.data().count + 1;

    const reportRef = reportsRef.doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await reportRef.set({
      offeringId,
      version,
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
    await offeringRef.update({
      status: 'ai_in_progress',
      updatedAt: now,
      updatedBy: uid,
    });

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

      return { reportId: reportRef.id, version, status: 'succeeded' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await reportRef.update({
        status: 'failed',
        errorMessage: message,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Revert offering so the lecturer can retry.
      await offeringRef.update({
        status: 'ready_for_ai',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: uid,
      });
      await writeAudit(db, uid, actorEmail, 'ai_analysis_failed', reportRef.id);
      throw new HttpsError('internal', `การวิเคราะห์ล้มเหลว: ${message}`);
    }
  },
);

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
