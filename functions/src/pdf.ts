import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { PDFDocument } from 'pdf-lib';

/** Concatenates several PDFs into one, in order. Invalid parts are skipped. */
export async function mergePdfs(parts: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const part of parts) {
    try {
      const doc = await PDFDocument.load(part, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    } catch (err) {
      console.warn('mergePdfs: skipping an unreadable PDF part', err);
    }
  }
  return Buffer.from(await merged.save());
}

/** Downloads a stored object's bytes, or null if missing/unreadable. */
export async function downloadStored(filePath: string): Promise<Buffer | null> {
  try {
    const [buf] = await admin.storage().bucket().file(filePath).download();
    return buf;
  } catch (err) {
    console.warn('downloadStored: could not read', filePath, err);
    return null;
  }
}

/** Renders an HTML document to an A4 PDF using headless Chromium. */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  // Disable WebGL/graphics — we only render static HTML, and the graphics
  // stack is a common cause of "Failed to launch the browser process" OOM
  // crashes on memory-constrained serverless cold starts.
  chromium.setGraphicsMode = false;
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
  } finally {
    await browser.close();
  }
}

/**
 * Stores a file in Firebase Storage with a download token and returns a
 * token URL that works without authentication (unguessable, internal use).
 */
export async function storeFile(
  data: Buffer,
  filePath: string,
  contentType: string,
  downloadName?: string,
): Promise<{ filePath: string; downloadUrl: string }> {
  const bucket = admin.storage().bucket();
  const token = randomUUID();
  await bucket.file(filePath).save(data, {
    metadata: {
      contentType,
      ...(downloadName
        ? { contentDisposition: `attachment; filename="${downloadName}"` }
        : {}),
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const downloadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(filePath)}?alt=media&token=${token}`;
  return { filePath, downloadUrl };
}

/**
 * Stores a PDF in Firebase Storage with a download token and returns a
 * token URL that works without authentication (unguessable, internal use).
 */
export async function storePdf(
  pdf: Buffer,
  filePath: string,
  downloadName?: string,
): Promise<{ filePath: string; downloadUrl: string }> {
  return storeFile(pdf, filePath, 'application/pdf', downloadName);
}
