import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { purgeOfferingCore } from './purgeOfferingCore';

const REGION = 'asia-southeast1';

/**
 * Cloud Function (callable): permanently purge one or more offerings and all
 * data tied to them (aiReports, assessments, verifications + Storage PDFs,
 * notifications, implementationReviews). Works regardless of status.
 *
 * Admin / super-admin only — destructive removal of offerings that may hold
 * AI/assessment data. Program directors use the safe (no-data) delete server
 * action instead.
 */
export const purgeOffering = onCall(
  { region: REGION, timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    }
    const uid = request.auth.uid;
    const offeringIds = request.data?.offeringIds as string[] | undefined;
    if (!Array.isArray(offeringIds) || offeringIds.length === 0) {
      throw new HttpsError('invalid-argument', 'ต้องระบุรายวิชาที่เปิดสอนอย่างน้อย 1 รายการ');
    }

    const db = admin.firestore();

    // Admin-only (super admin implies admin).
    const userSnap = await db.collection('users').doc(uid).get();
    const roles = (userSnap.data()?.roles ?? {}) as { isAdmin?: boolean };
    if (roles.isAdmin !== true) {
      throw new HttpsError(
        'permission-denied',
        'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบถาวรได้',
      );
    }

    let purged = 0;
    const totals = {
      aiReports: 0,
      assessments: 0,
      verifications: 0,
      notifications: 0,
      reviews: 0,
      filesDeleted: 0,
    };
    const purgedIds: string[] = [];

    for (const offeringId of offeringIds) {
      const snap = await db.collection('offerings').doc(offeringId).get();
      if (!snap.exists) continue;
      const c = await purgeOfferingCore(db, offeringId);
      purged += 1;
      purgedIds.push(offeringId);
      totals.aiReports += c.aiReports;
      totals.assessments += c.assessments;
      totals.verifications += c.verifications;
      totals.notifications += c.notifications;
      totals.reviews += c.reviews;
      totals.filesDeleted += c.filesDeleted;
    }

    await db.collection('auditLog').add({
      occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      actorId: uid,
      actorEmail: request.auth.token.email ?? null,
      action: 'offerings_purged',
      entityType: 'offerings',
      entityId: purgedIds[0] ?? 'bulk',
      before: null,
      after: { offeringIds: purgedIds, deleted: totals },
    });

    return { ok: true, purged, deleted: totals };
  },
);
