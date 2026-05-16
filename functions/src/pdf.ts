import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/** Renders an HTML document to an A4 PDF using headless Chromium. */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
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
 * Stores a PDF in Firebase Storage with a download token and returns a
 * token URL that works without authentication (unguessable, internal use).
 */
export async function storePdf(
  pdf: Buffer,
  filePath: string,
): Promise<{ filePath: string; downloadUrl: string }> {
  const bucket = admin.storage().bucket();
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
  return { filePath, downloadUrl };
}
