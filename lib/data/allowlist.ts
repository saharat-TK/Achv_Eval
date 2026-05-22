import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { AllowlistDoc } from '@/lib/types/models';

export type AllowlistWithId = AllowlistDoc & { id: string };

/** Normalize an email to the canonical allowlist doc ID. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** All allowlist entries, newest first by `addedAt`. */
export async function getAllAllowlistEntries(): Promise<AllowlistWithId[]> {
  const snap = await getAdminDb()
    .collection('allowlist')
    .orderBy('addedAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AllowlistDoc) }));
}

/** Look up an allowlist entry by raw email (handles normalization). */
export async function getAllowlistByEmail(
  email: string,
): Promise<AllowlistWithId | null> {
  const id = normalizeEmail(email);
  const snap = await getAdminDb().collection('allowlist').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as AllowlistDoc) };
}
