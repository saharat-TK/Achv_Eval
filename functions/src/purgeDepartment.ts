import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { purgeProgramCore, type PurgeProgramCounts } from './purgeProgram';

const REGION = 'asia-southeast1';

/**
 * Cloud Function (Callable): Permanently purges a department and every
 * program/course/offering/PDF beneath it.
 *
 * Highly destructive and completely irreversible. Admin only.
 */
export const purgeDepartment = onCall(
  { region: REGION, timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
    }
    const uid = request.auth.uid;
    const departmentId = request.data?.departmentId as string | undefined;
    if (!departmentId) {
      throw new HttpsError('invalid-argument', 'ต้องระบุรหัสสาขาวิชา');
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

    const deptRef = db.collection('departments').doc(departmentId);
    const deptSnap = await deptRef.get();
    if (!deptSnap.exists) {
      throw new HttpsError('not-found', 'ไม่พบสาขาวิชา');
    }
    const deptData = deptSnap.data()!;

    // Find every program under the department, purge each, then drop the
    // department doc.
    const programsSnap = await db
      .collection('programs')
      .where('departmentId', '==', departmentId)
      .get();

    const totals: PurgeProgramCounts = {
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
    const programsPurged: string[] = [];

    for (const programDoc of programsSnap.docs) {
      const counts = await purgeProgramCore(programDoc.id);
      programsPurged.push(programDoc.id);
      totals.offerings += counts.offerings;
      totals.aiReports += counts.aiReports;
      totals.assessments += counts.assessments;
      totals.verifications += counts.verifications;
      totals.notifications += counts.notifications;
      totals.courses += counts.courses;
      totals.reviews += counts.reviews;
      totals.usersUpdated += counts.usersUpdated;
      totals.filesDeleted += counts.filesDeleted;
    }

    await deptRef.delete();

    await db.collection('auditLog').add({
      occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      actorId: uid,
      actorEmail: request.auth.token.email ?? null,
      action: 'department_purged',
      entityType: 'departments',
      entityId: departmentId,
      before: {
        nameTh: deptData.nameTh || '',
        nameEn: deptData.nameEn || '',
      },
      after: {
        programsPurged: programsPurged.length,
        programIds: programsPurged,
        deleted: totals,
      },
    });

    return {
      ok: true,
      programsPurged: programsPurged.length,
      deleted: totals,
    };
  },
);
