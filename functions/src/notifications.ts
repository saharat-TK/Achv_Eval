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
