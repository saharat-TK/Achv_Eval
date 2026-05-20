import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const REGION = 'asia-southeast1';

/**
 * Cloud Function (Callable): Permanently purges a program and all related records.
 *
 * Highly destructive and completely irreversible. Only callable by global admins.
 * Wipes out all offerings, courses, AI reports, assessments, verifications, notifications,
 * and associated PDF files in Cloud Storage. Also prunes the program from all user role arrays.
 */
export const purgeProgram = onCall(
  { region: REGION, timeoutSeconds: 300 },
  async (request) => {
    // 1. Authenticate and authorize
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    }
    const uid = request.auth.uid;
    const programId = request.data?.programId as string | undefined;
    if (!programId) {
      throw new HttpsError('invalid-argument', 'ต้องระบุรหัสหลักสูตร');
    }

    const db = admin.firestore();

    // Verify user role
    const userSnap = await db.collection('users').doc(uid).get();
    const roles = (userSnap.data()?.roles ?? {}) as { isAdmin?: boolean };
    if (roles.isAdmin !== true) {
      throw new HttpsError('permission-denied', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้');
    }

    const programRef = db.collection('programs').doc(programId);
    const programSnap = await programRef.get();
    if (!programSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบหลักสูตร');
    }
    const programData = programSnap.data()!;
    const programCode = programData.code || programId;

    // Track execution counts for audit logging
    let offeringsCount = 0;
    let aiReportsCount = 0;
    let assessmentsCount = 0;
    let verificationsCount = 0;
    let notificationsCount = 0;
    let coursesCount = 0;
    let reviewsCount = 0;
    let usersUpdatedCount = 0;
    let filesDeletedCount = 0;

    const bucket = admin.storage().bucket();

    // 2. Query and delete all offerings and their subcollections + Storage assets
    const offeringsSnap = await db
      .collection('offerings')
      .where('programId', '==', programId)
      .get();

    offeringsCount = offeringsSnap.size;

    for (const offeringDoc of offeringsSnap.docs) {
      const offeringId = offeringDoc.id;
      const offeringRef = db.collection('offerings').doc(offeringId);

      // A. aiReports & report files in Storage
      const aiReportsSnap = await offeringRef.collection('aiReports').get();
      aiReportsCount += aiReportsSnap.size;
      for (const reportDoc of aiReportsSnap.docs) {
        const data = reportDoc.data();
        if (data.reportStoragePath) {
          try {
            await bucket.file(data.reportStoragePath).delete();
            filesDeletedCount++;
          } catch (e) {
            console.error(`Failed to delete AI report file ${data.reportStoragePath}:`, e);
          }
        }
        await reportDoc.ref.delete();
      }

      // B. assessments & signed report files in Storage
      const assessmentsSnap = await offeringRef.collection('assessments').get();
      assessmentsCount += assessmentsSnap.size;
      for (const assessmentDoc of assessmentsSnap.docs) {
        const data = assessmentDoc.data();
        if (data.signedPdfStoragePath) {
          try {
            await bucket.file(data.signedPdfStoragePath).delete();
            filesDeletedCount++;
          } catch (e) {
            console.error(`Failed to delete assessment file ${data.signedPdfStoragePath}:`, e);
          }
        }
        await assessmentDoc.ref.delete();
      }

      // C. verifications & final verification files in Storage
      const verificationsSnap = await offeringRef.collection('verifications').get();
      verificationsCount += verificationsSnap.size;
      for (const verificationDoc of verificationsSnap.docs) {
        const data = verificationDoc.data();
        if (data.finalPdfStoragePath) {
          try {
            await bucket.file(data.finalPdfStoragePath).delete();
            filesDeletedCount++;
          } catch (e) {
            console.error(`Failed to delete verification file ${data.finalPdfStoragePath}:`, e);
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

      // E. Delete the offering document
      await offeringRef.delete();
    }

    // 3. Delete all courses under the program
    const coursesSnap = await db
      .collection('courses')
      .where('programId', '==', programId)
      .get();
    coursesCount = coursesSnap.size;
    for (const courseDoc of coursesSnap.docs) {
      await courseDoc.ref.delete();
    }

    // 4. Delete all implementationReviews under the program
    const reviewsSnap = await db
      .collection('implementationReviews')
      .where('programId', '==', programId)
      .get();
    reviewsCount = reviewsSnap.size;
    for (const reviewDoc of reviewsSnap.docs) {
      await reviewDoc.ref.delete();
    }

    // 5. Prune program assignment from user role arrays
    const usersSnap = await db.collection('users').get();
    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      const rolesData = userData.roles || {};
      let changed = false;

      const directorOf = rolesData.directorOf || [];
      const assessorOf = rolesData.assessorOf || [];
      const verifierOf = rolesData.verifierOf || [];

      if (directorOf.includes(programId)) {
        rolesData.directorOf = directorOf.filter((id: string) => id !== programId);
        changed = true;
      }
      if (assessorOf.includes(programId)) {
        rolesData.assessorOf = assessorOf.filter((id: string) => id !== programId);
        changed = true;
      }
      if (verifierOf.includes(programId)) {
        rolesData.verifierOf = verifierOf.filter((id: string) => id !== programId);
        changed = true;
      }

      if (changed) {
        await userDoc.ref.update({ roles: rolesData });
        usersUpdatedCount++;
      }
    }

    // 6. Delete the program document itself
    await programRef.delete();

    // 7. Log a single detailed audit trail entry
    await db.collection('auditLog').add({
      occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      actorId: uid,
      actorEmail: request.auth.token.email ?? null,
      action: 'program_purged',
      entityType: 'programs',
      entityId: programId,
      before: {
        code: programCode,
        nameTh: programData.nameTh || '',
      },
      after: {
        deleted: {
          offerings: offeringsCount,
          aiReports: aiReportsCount,
          assessments: assessmentsCount,
          verifications: verificationsCount,
          notifications: notificationsCount,
          courses: coursesCount,
          reviews: reviewsCount,
          usersUpdated: usersUpdatedCount,
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
        courses: coursesCount,
        reviews: reviewsCount,
        usersUpdated: usersUpdatedCount,
        filesDeleted: filesDeletedCount,
      },
    };
  }
);
