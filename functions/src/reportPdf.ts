import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { google } from 'googleapis';
import { buildReportHtml, type ReportMeta } from './reportHtml';
import type { AnalysisResult } from './gemini';

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
}): Promise<void> {
  const { offeringId, reportId, reportRef, result, logSheetId } = args;
  const db = admin.firestore();

  // ----- Metadata ----------------------------------------------------
  const offeringSnap = await db.collection('offerings').doc(offeringId).get();
  const offering = offeringSnap.data() as
    | {
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

  // ----- Render HTML → PDF ------------------------------------------
  const html = buildReportHtml(result, meta);

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  let pdf: Buffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    pdf = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
  } finally {
    await browser.close();
  }

  // ----- Upload to Firebase Storage ---------------------------------
  const bucket = admin.storage().bucket();
  const filePath = `reports/${offeringId}/${reportId}.pdf`;
  const token = randomUUID();
  await bucket.file(filePath).save(pdf, {
    metadata: {
      contentType: 'application/pdf',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const downloadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(filePath)}?alt=media&token=${token}`;

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
