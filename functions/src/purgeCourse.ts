import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

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

    const bucket = admin.storage().bucket();

    // 1. List offerings of this course.
    const offeringsSnap = await db
      .collection('offerings')
      .where('courseId', '==', courseId)
      .get();
    offeringsCount = offeringsSnap.size;

    for (const offeringDoc of offeringsSnap.docs) {
      const offeringId = offeringDoc.id;
      const offeringRef = db.collection('offerings').doc(offeringId);

      // A. aiReports + Storage
      const aiReportsSnap = await offeringRef.collection('aiReports').get();
      aiReportsCount += aiReportsSnap.size;
      for (const reportDoc of aiReportsSnap.docs) {
        const data = reportDoc.data();
        if (data.reportStoragePath) {
          try {
            await bucket.file(data.reportStoragePath as string).delete();
            filesDeletedCount += 1;
          } catch (e) {
            console.error(
              `Failed to delete AI report file ${data.reportStoragePath}:`,
              e,
            );
          }
        }
        await reportDoc.ref.delete();
      }

      // B. assessments + Storage
      const assessmentsSnap = await offeringRef.collection('assessments').get();
      assessmentsCount += assessmentsSnap.size;
      for (const assessmentDoc of assessmentsSnap.docs) {
        const data = assessmentDoc.data();
        if (data.signedPdfStoragePath) {
          try {
            await bucket.file(data.signedPdfStoragePath as string).delete();
            filesDeletedCount += 1;
          } catch (e) {
            console.error(
              `Failed to delete assessment file ${data.signedPdfStoragePath}:`,
              e,
            );
          }
        }
        await assessmentDoc.ref.delete();
      }

      // C. verifications + Storage
      const verificationsSnap = await offeringRef
        .collection('verifications')
        .get();
      verificationsCount += verificationsSnap.size;
      for (const verificationDoc of verificationsSnap.docs) {
        const data = verificationDoc.data();
        if (data.finalPdfStoragePath) {
          try {
            await bucket.file(data.finalPdfStoragePath as string).delete();
            filesDeletedCount += 1;
          } catch (e) {
            console.error(
              `Failed to delete verification file ${data.finalPdfStoragePath}:`,
              e,
            );
          }
        }
        await verificationDoc.ref.delete();
      }

      // D. notifications linked to this offering
      const notificationsSnap = await db
        .collection('notifications')
        .where('relatedOfferingId', '==', offeringId)
        .get();
      notificationsCount += notificationsSnap.size;
      for (const notifDoc of notificationsSnap.docs) {
        await notifDoc.ref.delete();
      }

      // E. implementationReviews referencing this offering (either side).
      const prevSnap = await db
        .collection('implementationReviews')
        .where('previousOfferingId', '==', offeringId)
        .get();
      const newSnap = await db
        .collection('implementationReviews')
        .where('newOfferingId', '==', offeringId)
        .get();
      const seenReviewIds = new Set<string>();
      for (const reviewDoc of [...prevSnap.docs, ...newSnap.docs]) {
        if (seenReviewIds.has(reviewDoc.id)) continue;
        seenReviewIds.add(reviewDoc.id);
        await reviewDoc.ref.delete();
        reviewsCount += 1;
      }

      // F. Delete the offering doc.
      await offeringRef.delete();
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
