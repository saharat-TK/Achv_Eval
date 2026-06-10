import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// Thai-capable TTF for pdf-lib footer stamping — pdf-lib's built-in fonts are
// Latin-only. Bundled under functions/assets and read once, lazily.
let thaiFontBytes: Buffer | null = null;
function loadThaiFont(): Buffer {
  if (!thaiFontBytes) {
    thaiFontBytes = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'Sarabun-Regular.ttf'),
    );
  }
  return thaiFontBytes;
}

/**
 * Stamps a footer onto every page of a PDF: `${prefix} | หน้าที่ {n}/{total}`,
 * centered in the bottom margin. Used after the summary + appendix merge so the
 * page count is continuous across the whole document. Best-effort: on any
 * failure the original PDF is returned unstamped.
 */
export async function stampFooter(pdf: Buffer, prefix: string): Promise<Buffer> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  } catch (err) {
    console.warn('stampFooter: could not load PDF; returning unstamped', err);
    return pdf;
  }
  try {
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(loadThaiFont(), { subset: true });
    const pages = doc.getPages();
    const total = pages.length;
    const sideMargin = 45; // ~16mm
    const baseSize = 8;
    const color = rgb(0.4, 0.4, 0.4);
    pages.forEach((page, i) => {
      const { width } = page.getSize();
      const text = `${prefix} | หน้าที่ ${i + 1}/${total}`;
      const maxWidth = width - sideMargin * 2;
      let size = baseSize;
      let textWidth = font.widthOfTextAtSize(text, size);
      if (textWidth > maxWidth) {
        // Shrink to fit rather than overflow the page edges (floor at 6pt).
        size = Math.max(6, (baseSize * maxWidth) / textWidth);
        textWidth = font.widthOfTextAtSize(text, size);
      }
      page.drawText(text, { x: (width - textWidth) / 2, y: 24, size, font, color });
    });
    return Buffer.from(await doc.save());
  } catch (err) {
    console.warn('stampFooter: stamping failed; returning unstamped', err);
    return pdf;
  }
}

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
