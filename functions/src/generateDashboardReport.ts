import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { renderHtmlToPdf } from './pdf';
import {
  buildDashboardReportHtml,
  type DashboardReportInput,
} from './dashboardReportHtml';

const REGION = 'asia-southeast1';

/**
 * Callable: render the executive-dashboard QA report to a PDF.
 *
 * The dashboard aggregation lives in the Next.js server (lib/data/dashboard),
 * so the browser passes the already-computed report data in. The PDF is a
 * convenience export, not an authoritative signed document, so trusting the
 * client-supplied figures is acceptable — the caller only renders their own
 * view. The PDF bytes are returned base64-encoded; nothing is persisted.
 */
export const generateDashboardReport = onCall(
  { region: REGION, memory: '2GiB', timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    }

    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const roles = (userSnap.data()?.roles ?? {}) as {
      isAdmin?: boolean;
      directorOf?: string[];
    };
    const allowed =
      roles.isAdmin === true || (roles.directorOf ?? []).length > 0;
    if (!allowed) {
      throw new HttpsError('permission-denied', 'ท่านไม่มีสิทธิ์ใช้งานแดชบอร์ด');
    }

    const report = request.data?.report as DashboardReportInput | undefined;
    if (!report || !report.context || !report.summary) {
      throw new HttpsError('invalid-argument', 'ข้อมูลรายงานไม่ครบถ้วน');
    }

    const generatedAt = new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'long',
      timeStyle: 'short',
    });

    const html = buildDashboardReportHtml(report, generatedAt);
    const pdf = await renderHtmlToPdf(html);

    return { pdfBase64: pdf.toString('base64') };
  },
);
