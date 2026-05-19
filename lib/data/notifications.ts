import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import type { NotificationType } from '@/lib/constants';

interface NewNotification {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  relatedOfferingId?: string | null;
}

/** Creates one in-app notification document. */
export async function createNotification(input: NewNotification): Promise<void> {
  await getAdminDb()
    .collection('notifications')
    .add({
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      relatedOfferingId: input.relatedOfferingId ?? null,
      emailSentAt: null,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
}

/** Creates the same notification for several recipients (deduplicated). */
export async function createNotifications(
  recipientIds: string[],
  input: Omit<NewNotification, 'recipientId'>,
): Promise<void> {
  const unique = [...new Set(recipientIds.filter(Boolean))];
  await Promise.all(
    unique.map((recipientId) => createNotification({ recipientId, ...input })),
  );
}

async function getProgramRoleUserIds(
  programId: string,
  roleField: 'assessorOf' | 'verifierOf',
): Promise<string[]> {
  const snap = await getAdminDb()
    .collection('users')
    .where(`roles.${roleField}`, 'array-contains', programId)
    .get();
  return snap.docs
    .filter((doc) => doc.data().isActive !== false)
    .map((doc) => doc.id);
}

/** Active users who are assessors of the given program. */
export function getProgramAssessorIds(programId: string): Promise<string[]> {
  return getProgramRoleUserIds(programId, 'assessorOf');
}

/** Active users who are verification-committee members of the given program. */
export function getProgramVerifierIds(programId: string): Promise<string[]> {
  return getProgramRoleUserIds(programId, 'verifierOf');
}

/**
 * Runs a notification side-effect without ever throwing — a failed
 * notification must not fail the operation that triggered it.
 */
export async function notifySafely(task: Promise<unknown>): Promise<void> {
  try {
    await task;
  } catch (error) {
    console.error('notification side-effect failed (non-fatal)', error);
  }
}
