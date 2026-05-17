import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { UserDoc } from '@/lib/types/models';

export type UserWithId = UserDoc & { id: string };

/** All users, ordered by email. Used for role/lecturer pickers. */
export async function getAllUsers(): Promise<UserWithId[]> {
  const snap = await getAdminDb().collection('users').orderBy('email').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as UserDoc) }));
}

export async function getUser(userId: string): Promise<UserWithId | null> {
  const snap = await getAdminDb().collection('users').doc(userId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as UserDoc) };
}
