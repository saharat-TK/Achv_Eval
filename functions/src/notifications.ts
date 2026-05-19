import * as admin from 'firebase-admin';

/**
 * Creates one in-app notification document. The web app's notification bell
 * reads these live. Callers should wrap this so a failure stays non-fatal.
 */
export async function createNotification(input: {
  recipientId: string;
  type: string;
  title: string;
  body?: string | null;
  relatedOfferingId?: string | null;
}): Promise<void> {
  await admin
    .firestore()
    .collection('notifications')
    .add({
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      relatedOfferingId: input.relatedOfferingId ?? null,
      emailSentAt: null,
      readAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

/** Creates the same notification for several recipients (deduplicated). */
export async function createNotifications(
  recipientIds: string[],
  input: {
    type: string;
    title: string;
    body?: string | null;
    relatedOfferingId?: string | null;
  },
): Promise<void> {
  const unique = [...new Set(recipientIds.filter(Boolean))];
  await Promise.all(
    unique.map((recipientId) => createNotification({ recipientId, ...input })),
  );
}

/** Active users who are assessors of the given program. */
export async function getProgramAssessorIds(
  programId: string,
): Promise<string[]> {
  const snap = await admin
    .firestore()
    .collection('users')
    .where('roles.assessorOf', 'array-contains', programId)
    .get();
  return snap.docs
    .filter((doc) => doc.data().isActive !== false)
    .map((doc) => doc.id);
}
