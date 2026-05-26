import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { renderHtmlToPdf, storePdf } from './pdf';
import { buildReportHtml, type ReportMeta } from './reportHtml';
import {
  getProgramCode,
  offeringInputsDir,
  offeringReportDir,
  offeringReportFileName,
} from './storagePaths';
import type { AnalysisResult } from './gemini';

/** Minimal shape of an uploaded input file (base64 payload from the caller). */
export interface InputFilePayload {
  type: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
}

const SEMESTER_LABEL: Record<string, string> = {
  '1': 'ภาคต้น',
  '2': 'ภาคปลาย',
  '3': 'ภาคฤดูร้อน',
};

/**
 * Renders an analysis result to a PDF, stores it in Firebase Storage, appends
 * a row to the lecturer-action log Sheet, and writes the download URL back
 * onto the report document.
 *
 * Called inline by analyzeCourse after the analysis succeeds. (A Firestore
 * trigger would be cleaner separation, but the project's Firestore database
 * is in asia-southeast3, where Eventarc/Firestore triggers are unavailable.)
 *
 * The caller wraps this in try/catch — a PDF failure must not fail the
 * analysis, since the report is already marked 'succeeded'.
 */
export async function generateAndStoreReport(args: {
  offeringId: string;
  reportId: string;
  reportRef: admin.firestore.DocumentReference;
  result: AnalysisResult;
  logSheetId: string;
  /** Original uploaded files, persisted so the on-demand TQF3 draft can
   *  re-feed the real มคอ.3 to Gemini. */
  inputFiles?: InputFilePayload[];
}): Promise<void> {
  const { offeringId, reportId, reportRef, result, logSheetId, inputFiles = [] } = args;
  const db = admin.firestore();

  // ----- Metadata ----------------------------------------------------
  const offeringSnap = await db.collection('offerings').doc(offeringId).get();
  const offering = offeringSnap.data() as
    | {
        programId: string;
        courseCode: string;
        courseNameTh: string;
        courseNameEn: string;
        academicYear: number;
        semester: string;
        section: string;
        lecturerId: string | null;
        lecturerEmail: string | null;
      }
    | undefined;
  if (!offering) throw new Error(`offering ${offeringId} not found`);

  let lecturerName = offering.lecturerEmail ?? '';
  if (offering.lecturerId) {
    const u = await db.collection('users').doc(offering.lecturerId).get();
    lecturerName = (u.data()?.nameTh as string) || lecturerName;
  }

  const generatedAt = new Date().toLocaleString('th-TH', {
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
    generatedAt,
  };

  const programCode = await getProgramCode(db, offering.programId);
  const pathParts = {
    programCode,
    courseCode: offering.courseCode,
    academicYear: offering.academicYear,
    semester: offering.semester,
    section: offering.section,
  };
  const dir = offeringReportDir(pathParts);

  // ----- Persist original input files -------------------------------
  // Done before PDF rendering so the originals survive even if Chromium
  // fails. They power the on-demand revised-มคอ.3 draft.
  if (inputFiles.length > 0) {
    try {
      const bucket = admin.storage().bucket();
      const inputsDir = offeringInputsDir(pathParts, reportId);
      const inputFileRefs = await Promise.all(
        inputFiles.map(async (f, i) => {
          const safeName = f.filename.replace(/[^A-Za-z0-9._-]+/g, '_') || 'file';
          const storagePath = `${inputsDir}/${i}-${safeName}`;
          await bucket.file(storagePath).save(Buffer.from(f.dataBase64, 'base64'), {
            metadata: { contentType: f.mimeType },
          });
          return {
            storagePath,
            filename: f.filename,
            mimeType: f.mimeType,
            type: f.type,
          };
        }),
      );
      await reportRef.update({ inputFileRefs });
    } catch (e) {
      // Non-fatal: only the TQF3-draft feature is affected.
      console.error('failed to persist input files (non-fatal)', e);
    }
  }

  // ----- Render HTML → PDF → Storage --------------------------------
  const html = buildReportHtml(result, meta);
  const pdf = await renderHtmlToPdf(html);
  const { filePath, downloadUrl } = await storePdf(
    pdf,
    `${dir}/ai-report-${reportId}.pdf`,
    offeringReportFileName('ai-report', pathParts, reportId),
  );

  // ----- Append to the lecturer-action log Sheet --------------------
  let logSheetRowId: string | null = null;
  if (logSheetId) {
    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const res = await sheets.spreadsheets.values.append({
        spreadsheetId: logSheetId,
        range: 'A:H',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              generatedAt,
              offering.courseCode,
              offering.courseNameTh,
              offering.academicYear,
              meta.semesterLabel,
              downloadUrl,
              lecturerName,
              offering.lecturerEmail ?? '',
            ],
          ],
        },
      });
      logSheetRowId = res.data.updates?.updatedRange ?? null;
    } catch (e) {
      // Non-fatal: the PDF still exists; only the log row is missing.
      console.error('log sheet append failed', e);
    }
  }

  // ----- Write results back onto the report doc ---------------------
  await reportRef.update({ reportStoragePath: filePath, reportDownloadUrl: downloadUrl, logSheetRowId });

  await db.collection('auditLog').add({
    occurredAt: admin.firestore.FieldValue.serverTimestamp(),
    actorId: null,
    actorEmail: 'system:generateReportPdf',
    action: 'report_pdf_generated',
    entityType: 'aiReports',
    entityId: reportId,
    before: null,
    after: null,
  });
}
