import * as admin from 'firebase-admin';

export interface OfferingPurgeCounts {
  aiReports: number;
  assessments: number;
  verifications: number;
  notifications: number;
  reviews: number;
  filesDeleted: number;
}

function emptyCounts(): OfferingPurgeCounts {
  return {
    aiReports: 0,
    assessments: 0,
    verifications: 0,
    notifications: 0,
    reviews: 0,
    filesDeleted: 0,
  };
}

/**
 * Permanently delete one offering and every record tied to it:
 * subcollections (aiReports, assessments, verifications) and their Storage
 * PDFs, related notifications, and implementationReviews referencing it
 * (either side). Also nulls `previousOfferingId` on any successor offering
 * so the carry-forward chain doesn't dangle. Returns deletion counts.
 *
 * Shared by `purgeCourse` (per-offering loop) and `purgeOffering`.
 * Caller is responsible for authorization and audit logging.
 */
export async function purgeOfferingCore(
  db: admin.firestore.Firestore,
  offeringId: string,
): Promise<OfferingPurgeCounts> {
  const counts = emptyCounts();
  const bucket = admin.storage().bucket();
  const offeringRef = db.collection('offerings').doc(offeringId);

  // A. aiReports + Storage
  const aiReportsSnap = await offeringRef.collection('aiReports').get();
  counts.aiReports += aiReportsSnap.size;
  for (const reportDoc of aiReportsSnap.docs) {
    const data = reportDoc.data();
    const paths: string[] = [];
    if (data.reportStoragePath) paths.push(data.reportStoragePath as string);
    if (data.tqf3StoragePath) paths.push(data.tqf3StoragePath as string);
    if (Array.isArray(data.inputFileRefs)) {
      for (const ref of data.inputFileRefs) {
        if (ref && typeof ref.storagePath === 'string' && ref.storagePath) {
          paths.push(ref.storagePath);
        }
      }
    }
    for (const path of paths) {
      try {
        await bucket.file(path).delete();
        counts.filesDeleted += 1;
      } catch (e) {
        console.error(`Failed to delete AI report file ${path}:`, e);
      }
    }
    await reportDoc.ref.delete();
  }

  // B. assessments + Storage
  const assessmentsSnap = await offeringRef.collection('assessments').get();
  counts.assessments += assessmentsSnap.size;
  for (const assessmentDoc of assessmentsSnap.docs) {
    const data = assessmentDoc.data();
    if (data.signedPdfStoragePath) {
      try {
        await bucket.file(data.signedPdfStoragePath as string).delete();
        counts.filesDeleted += 1;
      } catch (e) {
        console.error(`Failed to delete assessment file ${data.signedPdfStoragePath}:`, e);
      }
    }
    await assessmentDoc.ref.delete();
  }

  // C. verifications + Storage
  const verificationsSnap = await offeringRef.collection('verifications').get();
  counts.verifications += verificationsSnap.size;
  for (const verificationDoc of verificationsSnap.docs) {
    const data = verificationDoc.data();
    if (data.finalPdfStoragePath) {
      try {
        await bucket.file(data.finalPdfStoragePath as string).delete();
        counts.filesDeleted += 1;
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
  counts.notifications += notificationsSnap.size;
  for (const notifDoc of notificationsSnap.docs) {
    await notifDoc.ref.delete();
  }

  // E. implementationReviews referencing this offering (either side)
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
    counts.reviews += 1;
  }

  // F. Null out the carry-forward link on any successor offering.
  const successorsSnap = await db
    .collection('offerings')
    .where('previousOfferingId', '==', offeringId)
    .get();
  for (const successorDoc of successorsSnap.docs) {
    await successorDoc.ref.update({
      previousOfferingId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // G. Delete the offering doc itself.
  await offeringRef.delete();

  return counts;
}
