import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { purgeOfferingCore } from './purgeOfferingCore';

const REGION = 'asia-southeast1';

/**
 * Cloud Function (callable): permanently purges a course and every record
 * tied to its offerings. Mirrors `purgeProgram` one level down — wipes
 * offerings, their subcollections (aiReports, assessments, verifications)
 * with associated Storage PDFs, related notifications, and any
 * implementationReviews referencing those offerings. Highly destructive
 * and irreversible. Admin only.
 */
export const purgeCourse = onCall(
  { region: REGION, timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    }
    const uid = request.auth.uid;
    const courseId = request.data?.courseId as string | undefined;
    if (!courseId) {
      throw new HttpsError('invalid-argument', 'ต้องระบุรหัสรายวิชา');
    }

    const db = admin.firestore();

    const userSnap = await db.collection('users').doc(uid).get();
    const roles = (userSnap.data()?.roles ?? {}) as { isAdmin?: boolean };
    if (roles.isAdmin !== true) {
      throw new HttpsError(
        'permission-denied',
        'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้',
      );
    }

    const courseRef = db.collection('courses').doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบรายวิชา');
    }
    const courseData = courseSnap.data()!;
    const courseCode = (courseData.code as string | undefined) ?? courseId;

    // Counts for the audit receipt.
    let offeringsCount = 0;
    let aiReportsCount = 0;
    let assessmentsCount = 0;
    let verificationsCount = 0;
    let notificationsCount = 0;
    let reviewsCount = 0;
    let filesDeletedCount = 0;

    // 1. Purge each offering of this course via the shared core.
    const offeringsSnap = await db
      .collection('offerings')
      .where('courseId', '==', courseId)
      .get();
    offeringsCount = offeringsSnap.size;

    for (const offeringDoc of offeringsSnap.docs) {
      const c = await purgeOfferingCore(db, offeringDoc.id);
      aiReportsCount += c.aiReports;
      assessmentsCount += c.assessments;
      verificationsCount += c.verifications;
      notificationsCount += c.notifications;
      reviewsCount += c.reviews;
      filesDeletedCount += c.filesDeleted;
    }

    // 2. Delete the course doc.
    await courseRef.delete();

    // 3. Single detailed audit receipt.
    await db.collection('auditLog').add({
      occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      actorId: uid,
      actorEmail: request.auth.token.email ?? null,
      action: 'course_purged',
      entityType: 'courses',
      entityId: courseId,
      before: {
        code: courseCode,
        nameTh: courseData.nameTh ?? '',
        programId: courseData.programId ?? null,
      },
      after: {
        deleted: {
          offerings: offeringsCount,
          aiReports: aiReportsCount,
          assessments: assessmentsCount,
          verifications: verificationsCount,
          notifications: notificationsCount,
          reviews: reviewsCount,
          filesDeleted: filesDeletedCount,
        },
      },
    });

    return {
      ok: true,
      deleted: {
        offerings: offeringsCount,
        aiReports: aiReportsCount,
        assessments: assessmentsCount,
        verifications: verificationsCount,
        notifications: notificationsCount,
        reviews: reviewsCount,
        filesDeleted: filesDeletedCount,
      },
    };
  },
);
