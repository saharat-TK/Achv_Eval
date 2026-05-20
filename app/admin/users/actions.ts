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
 * Counts other admins (excluding the given uid) who would still be admins
 * and active after a hypothetical change. Used to guard against the system
 * being left with zero active admins.
 */
async function countOtherActiveAdmins(excludeUid: string): Promise<number> {
  const db = getAdminDb();
  const snap = await db
    .collection('users')
    .where('roles.isAdmin', '==', true)
    .get();
  return snap.docs.filter(
    (doc) => doc.id !== excludeUid && doc.data().isActive !== false,
  ).length;
}

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
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return { ok: false, error: 'ไม่พบผู้ใช้' };
  }

  // Last-admin safeguard: refuse if this change would demote the only
  // remaining active admin in the system.
  const targetWasAdmin = userSnap.data()?.roles?.isAdmin === true;
  if (targetWasAdmin && !roles.isAdmin) {
    const others = await countOtherActiveAdmins(userId);
    if (others === 0) {
      return {
        ok: false,
        error:
          'ไม่สามารถถอนสิทธิ์ได้ — บัญชีนี้เป็นผู้ดูแลระบบที่ยังใช้งานอยู่คนเดียว',
      };
    }
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
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return { ok: false, error: 'ไม่พบผู้ใช้' };
  }

  // Last-admin safeguard: refuse if deactivating the only remaining active
  // admin in the system.
  if (!isActive && userSnap.data()?.roles?.isAdmin === true) {
    const others = await countOtherActiveAdmins(userId);
    if (others === 0) {
      return {
        ok: false,
        error:
          'ไม่สามารถปิดใช้งานได้ — บัญชีนี้เป็นผู้ดูแลระบบที่ยังใช้งานอยู่คนเดียว',
      };
    }
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
