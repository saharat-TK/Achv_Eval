'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';

export interface UserRolesData {
  isAdmin: boolean;
  directorOf: string[]; // programIds
  assessorOf: string[]; // programIds
  verifierOf: string[]; // programIds
}

export type RolesActionResult = { ok: true } | { ok: false; error: string };

/**
 * Updates a user's role assignments. Admin only.
 *
 * Guards against an admin removing their own admin rights (which would
 * lock them out of this page).
 */
export async function updateUserRoles(
  userId: string,
  roles: UserRolesData,
): Promise<RolesActionResult> {
  const actor = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!actor || !profile?.roles.isAdmin) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการสิทธิ์ผู้ใช้ได้' };
  }
  if (userId === actor.uid && !roles.isAdmin) {
    return { ok: false, error: 'ไม่สามารถถอนสิทธิ์ผู้ดูแลระบบของบัญชีตนเองได้' };
  }

  const db = getAdminDb();
  const userRef = db.collection('users').doc(userId);
  if (!(await userRef.get()).exists) {
    return { ok: false, error: 'ไม่พบผู้ใช้' };
  }

  await userRef.update({
    'roles.isAdmin': roles.isAdmin,
    'roles.directorOf': [...new Set(roles.directorOf)],
    'roles.assessorOf': [...new Set(roles.assessorOf)],
    'roles.verifierOf': [...new Set(roles.verifierOf)],
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: actor.uid,
    actorEmail: actor.email ?? null,
    action: 'user_roles_updated',
    entityType: 'users',
    entityId: userId,
    before: null,
    after: {
      isAdmin: roles.isAdmin,
      directorOf: roles.directorOf,
      assessorOf: roles.assessorOf,
      verifierOf: roles.verifierOf,
    },
  });

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

/**
 * Activates or deactivates a user account. Admin only. A deactivated user
 * is blocked at sign-in and loses access mid-session, but their records
 * (assessments, offerings, audit trail) are preserved.
 *
 * Guards against an admin deactivating their own account.
 */
export async function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<RolesActionResult> {
  const actor = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!actor || !profile?.roles.isAdmin) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการบัญชีผู้ใช้ได้' };
  }
  if (userId === actor.uid && !isActive) {
    return { ok: false, error: 'ไม่สามารถปิดใช้งานบัญชีของตนเองได้' };
  }

  const db = getAdminDb();
  const userRef = db.collection('users').doc(userId);
  if (!(await userRef.get()).exists) {
    return { ok: false, error: 'ไม่พบผู้ใช้' };
  }

  await userRef.update({ isActive, updatedAt: FieldValue.serverTimestamp() });

  await db.collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: actor.uid,
    actorEmail: actor.email ?? null,
    action: isActive ? 'user_reactivated' : 'user_deactivated',
    entityType: 'users',
    entityId: userId,
    before: null,
    after: { isActive },
  });

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
