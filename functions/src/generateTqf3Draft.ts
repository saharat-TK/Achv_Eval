import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runTqf3Draft, type InputFile, type Tqf3Findings } from './gemini';
import { renderHtmlToPdf, storePdf } from './pdf';
import { buildTqf3Html, type Tqf3Meta } from './tqf3Html';
import {
  getProgramCode,
  offeringReportDir,
  offeringReportFileName,
} from './storagePaths';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const REGION = 'asia-southeast1';

const SEMESTER_LABEL: Record<string, string> = {
  '1': 'ภาคต้น',
  '2': 'ภาคปลาย',
  '3': 'ภาคฤดูร้อน',
};

interface InputFileRef {
  storagePath: string;
  filename: string;
  mimeType: string;
  type: string;
}

/**
 * Callable: generate a revised มคอ.3 draft for one completed analysis report.
 *
 * Re-feeds the original uploaded files (persisted at analysis time) plus the
 * stored analysis findings to Gemini, renders the result to a PDF, and stores
 * it alongside the course report as `ai-tqf3-<offeringId>.pdf`.
 *
 * One successful draft per report: a transaction blocks re-entry while a draft
 * is generating or already succeeded. Failed attempts can be retried.
 */
export const generateTqf3Draft = onCall(
  {
    region: REGION,
    secrets: [GEMINI_API_KEY],
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
    const reportId = request.data?.reportId as string | undefined;
    if (!offeringId || !reportId) {
      throw new HttpsError('invalid-argument', 'ต้องระบุรายวิชาและรายงาน');
    }

    const db = admin.firestore();
    const offeringRef = db.collection('offerings').doc(offeringId);
    const reportRef = offeringRef.collection('aiReports').doc(reportId);

    // ----- Authorize + one-time guard (transaction) ------------------
    const accepted = await db.runTransaction(async (tx) => {
      const [offeringSnap, reportSnap] = await Promise.all([
        tx.get(offeringRef),
        tx.get(reportRef),
      ]);
      if (!offeringSnap.exists) throw new HttpsError('not-found', 'ไม่พบรายวิชา');
      if (!reportSnap.exists) throw new HttpsError('not-found', 'ไม่พบรายงาน');

      const offering = offeringSnap.data() as { lecturerId?: string | null };
      if (offering.lecturerId !== uid) {
        throw new HttpsError('permission-denied', 'ท่านไม่ใช่ผู้รับผิดชอบรายวิชานี้');
      }

      const report = reportSnap.data() as {
        status?: string;
        reportStoragePath?: string | null;
        tqf3Status?: string | null;
        inputFileRefs?: InputFileRef[];
        structuredOutput?: Tqf3Findings | null;
      };
      if (report.status !== 'succeeded' || !report.reportStoragePath) {
        throw new HttpsError(
          'failed-precondition',
          'ต้องวิเคราะห์และสร้างรายงาน PDF ให้สำเร็จก่อน',
        );
      }
      if (report.tqf3Status === 'generating' || report.tqf3Status === 'succeeded') {
        throw new HttpsError(
          'failed-precondition',
          'มีการสร้างร่าง มคอ.3 สำหรับรายงานนี้แล้ว',
        );
      }
      if (!report.inputFileRefs || report.inputFileRefs.length === 0) {
        throw new HttpsError(
          'failed-precondition',
          'ไม่พบไฟล์ต้นฉบับสำหรับรายงานนี้ (รายงานเก่าอาจไม่ได้จัดเก็บไฟล์ต้นฉบับ)',
        );
      }

      tx.update(reportRef, {
        tqf3Status: 'generating',
        tqf3ErrorMessage: null,
        tqf3StartedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        inputFileRefs: report.inputFileRefs,
        findings: report.structuredOutput ?? {},
      };
    });

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    try {
      // ----- Load original files from Storage ------------------------
      const bucket = admin.storage().bucket();
      const files: InputFile[] = await Promise.all(
        accepted.inputFileRefs.map(async (ref) => {
          const [buf] = await bucket.file(ref.storagePath).download();
          return {
            type: ref.type,
            filename: ref.filename,
            mimeType: ref.mimeType,
            dataBase64: buf.toString('base64'),
          };
        }),
      );

      // ----- Resolve prompt template + metadata ----------------------
      const offeringSnap = await offeringRef.get();
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
      };

      const programRef = db.collection('programs').doc(offering.programId);
      const programSnap = await programRef.get();
      const program = programSnap.data() as { level?: string } | undefined;
      const promptTemplate =
        program?.level === 'undergraduate' ? 'CLAUDE.undergrad.md' : 'CLAUDE.master.md';
      const guideline = readFileSync(
        join(__dirname, '..', 'prompts', promptTemplate),
        'utf-8',
      );

      // ----- Generate the draft --------------------------------------
      const { content } = await runTqf3Draft({
        apiKey: GEMINI_API_KEY.value(),
        model,
        guideline,
        files,
        findings: accepted.findings,
      });
      if (!content.trim()) {
        throw new Error('Gemini returned an empty TQF3 draft');
      }

      // TEMP DEBUG (Step 0): inspect how the model formatted the weekly table.
      // Remove once §4 table rendering is confirmed.
      const planIdx = content.search(/แผนการสอน|หมวดที่\s*4/);
      console.log('TQF3 draft raw markdown', {
        length: content.length,
        section4Preview:
          planIdx >= 0
            ? content.slice(planIdx, planIdx + 1500)
            : content.slice(0, 1500),
      });

      // ----- Render → PDF → Storage ----------------------------------
      let lecturerName = offering.lecturerEmail ?? '';
      if (offering.lecturerId) {
        const u = await db.collection('users').doc(offering.lecturerId).get();
        lecturerName = (u.data()?.nameTh as string) || lecturerName;
      }
      const meta: Tqf3Meta = {
        courseCode: offering.courseCode,
        courseNameTh: offering.courseNameTh,
        courseNameEn: offering.courseNameEn,
        academicYear: offering.academicYear,
        semesterLabel: SEMESTER_LABEL[offering.semester] ?? offering.semester,
        section: offering.section,
        lecturerName,
        generatedAt: new Date().toLocaleString('th-TH', {
          timeZone: 'Asia/Bangkok',
          dateStyle: 'long',
          timeStyle: 'short',
        }),
      };

      const programCode = await getProgramCode(db, offering.programId);
      const pathParts = {
        programCode,
        courseCode: offering.courseCode,
        academicYear: offering.academicYear,
        semester: offering.semester,
        section: offering.section,
      };
      const html = buildTqf3Html(content, meta);
      const pdf = await renderHtmlToPdf(html);
      const { filePath, downloadUrl } = await storePdf(
        pdf,
        `${offeringReportDir(pathParts)}/ai-tqf3-${offeringId}.pdf`,
        offeringReportFileName('ai-tqf3', pathParts, offeringId),
      );

      await reportRef.update({
        tqf3Status: 'succeeded',
        tqf3StoragePath: filePath,
        tqf3DownloadUrl: downloadUrl,
        tqf3GeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        tqf3ErrorMessage: null,
      });

      await db.collection('auditLog').add({
        occurredAt: admin.firestore.FieldValue.serverTimestamp(),
        actorId: uid,
        actorEmail,
        action: 'ai_tqf3_draft_generated',
        entityType: 'aiReports',
        entityId: reportId,
        before: null,
        after: null,
      });

      return { ok: true, downloadUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      // Reset to a retryable state.
      await reportRef.update({
        tqf3Status: 'failed',
        tqf3ErrorMessage: message,
      });
      throw new HttpsError('internal', `การสร้างร่าง มคอ.3 ล้มเหลว: ${message}`);
    }
  },
);
