import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const REGION = 'asia-southeast1';

export interface PurgeProgramCounts {
  offerings: number;
  aiReports: number;
  assessments: number;
  verifications: number;
  notifications: number;
  courses: number;
  reviews: number;
  usersUpdated: number;
  filesDeleted: number;
}

/**
 * Internal: destroys one program plus every dependent record + Storage
 * asset. Does NOT enforce auth or write an audit entry — callers do
 * that. Exported so `purgeDepartment` can loop it per program in the
 * department's set.
 */
export async function purgeProgramCore(
  programId: string,
): Promise<PurgeProgramCounts> {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  const programRef = db.collection('programs').doc(programId);
  const programSnap = await programRef.get();
  if (!programSnap.exists) {
    throw new HttpsError('not-found', `program not found: ${programId}`);
  }

  const counts: PurgeProgramCounts = {
    offerings: 0,
    aiReports: 0,
    assessments: 0,
    verifications: 0,
    notifications: 0,
    courses: 0,
    reviews: 0,
    usersUpdated: 0,
    filesDeleted: 0,
  };

  // 1. Offerings + subcollections + Storage assets + linked notifications.
  const offeringsSnap = await db
    .collection('offerings')
    .where('programId', '==', programId)
    .get();
  counts.offerings = offeringsSnap.size;

  for (const offeringDoc of offeringsSnap.docs) {
    const offeringId = offeringDoc.id;
    const offeringRef = db.collection('offerings').doc(offeringId);

    const aiReportsSnap = await offeringRef.collection('aiReports').get();
    counts.aiReports += aiReportsSnap.size;
    for (const reportDoc of aiReportsSnap.docs) {
      const data = reportDoc.data();
      if (data.reportStoragePath) {
        try {
          await bucket.file(data.reportStoragePath).delete();
          counts.filesDeleted++;
        } catch (e) {
          console.error(
            `Failed to delete AI report file ${data.reportStoragePath}:`,
            e,
          );
        }
      }
      await reportDoc.ref.delete();
    }

    const assessmentsSnap = await offeringRef.collection('assessments').get();
    counts.assessments += assessmentsSnap.size;
    for (const assessmentDoc of assessmentsSnap.docs) {
      const data = assessmentDoc.data();
      if (data.signedPdfStoragePath) {
        try {
          await bucket.file(data.signedPdfStoragePath).delete();
          counts.filesDeleted++;
        } catch (e) {
          console.error(
            `Failed to delete assessment file ${data.signedPdfStoragePath}:`,
            e,
          );
        }
      }
      await assessmentDoc.ref.delete();
    }

    const verificationsSnap = await offeringRef
      .collection('verifications')
      .get();
    counts.verifications += verificationsSnap.size;
    for (const verificationDoc of verificationsSnap.docs) {
      const data = verificationDoc.data();
      if (data.finalPdfStoragePath) {
        try {
          await bucket.file(data.finalPdfStoragePath).delete();
          counts.filesDeleted++;
        } catch (e) {
          console.error(
            `Failed to delete verification file ${data.finalPdfStoragePath}:`,
            e,
          );
        }
      }
      await verificationDoc.ref.delete();
    }

    const notificationsSnap = await db
      .collection('notifications')
      .where('relatedOfferingId', '==', offeringId)
      .get();
    counts.notifications += notificationsSnap.size;
    for (const notifDoc of notificationsSnap.docs) {
      await notifDoc.ref.delete();
    }

    await offeringRef.delete();
  }

  // 2. Courses.
  const coursesSnap = await db
    .collection('courses')
    .where('programId', '==', programId)
    .get();
  counts.courses = coursesSnap.size;
  for (const courseDoc of coursesSnap.docs) {
    await courseDoc.ref.delete();
  }

  // 3. Implementation reviews.
  const reviewsSnap = await db
    .collection('implementationReviews')
    .where('programId', '==', programId)
    .get();
  counts.reviews = reviewsSnap.size;
  for (const reviewDoc of reviewsSnap.docs) {
    await reviewDoc.ref.delete();
  }

  // 4. Prune program from user role arrays.
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
      counts.usersUpdated++;
    }
  }

  // 5. Delete the program doc itself.
  await programRef.delete();

  return counts;
}

/**
 * Cloud Function (Callable): Permanently purges a program and all related records.
 *
 * Highly destructive and completely irreversible. Only callable by global admins.
 */
export const purgeProgram = onCall(
  { region: REGION, timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    }
    const uid = request.auth.uid;
    const programId = request.data?.programId as string | undefined;
    if (!programId) {
      throw new HttpsError('invalid-argument', 'ต้องระบุรหัสหลักสูตร');
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

    const programSnap = await db.collection('programs').doc(programId).get();
    if (!programSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบหลักสูตร');
    }
    const programData = programSnap.data()!;
    const programCode = programData.code || programId;

    const counts = await purgeProgramCore(programId);

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
      after: { deleted: counts },
    });

    return { ok: true, deleted: counts };
  },
);
