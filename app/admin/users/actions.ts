'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';

export interface UserRolesData {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isLecturer: boolean;
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

/** Counts other active super admins (excluding the given uid). Guards
 *  against the system being left with zero active super admins. */
async function countOtherActiveSuperAdmins(excludeUid: string): Promise<number> {
  const db = getAdminDb();
  const snap = await db
    .collection('users')
    .where('roles.isSuperAdmin', '==', true)
    .get();
  return snap.docs.filter(
    (doc) => doc.id !== excludeUid && doc.data().isActive !== false,
  ).length;
}

/**
 * Updates a user's account-level roles (admin / super-admin / lecturer). Admin only.
 * Program-scoped roles (director / assessor / verifier) are managed on their own
 * tabs and are intentionally left untouched here.
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
  const actorIsSuper = profile.roles.isSuperAdmin === true;

  // Super admin is a strict superset of admin — keep isAdmin true whenever
  // super admin is granted, so all existing isAdmin checks still pass.
  const nextSuper = roles.isSuperAdmin === true;
  const nextAdmin = nextSuper ? true : roles.isAdmin;

  const db = getAdminDb();
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return { ok: false, error: 'ไม่พบผู้ใช้' };
  }
  const targetRoles = (userSnap.data()?.roles ?? {}) as {
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
  };
  const targetWasAdmin = targetRoles.isAdmin === true;
  const targetWasSuper = targetRoles.isSuperAdmin === true;

  // Super-admin gate: only a super admin may touch admin-level accounts or
  // grant/revoke admin / super-admin status.
  const targetIsAdminNow = targetWasAdmin || targetWasSuper;
  const changeTouchesAdmin =
    nextAdmin !== targetWasAdmin || nextSuper !== targetWasSuper;
  if ((targetIsAdminNow || changeTouchesAdmin) && !actorIsSuper) {
    return {
      ok: false,
      error: 'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่จัดการสิทธิ์ผู้ดูแลระบบได้',
    };
  }

  if (userId === actor.uid && !nextAdmin) {
    return { ok: false, error: 'ไม่สามารถถอนสิทธิ์ผู้ดูแลระบบของบัญชีตนเองได้' };
  }

  // Last-admin safeguard: refuse if this change would demote the only
  // remaining active admin in the system.
  if (targetWasAdmin && !nextAdmin) {
    const others = await countOtherActiveAdmins(userId);
    if (others === 0) {
      return {
        ok: false,
        error:
          'ไม่สามารถถอนสิทธิ์ได้ — บัญชีนี้เป็นผู้ดูแลระบบที่ยังใช้งานอยู่คนเดียว',
      };
    }
  }

  // Last-super-admin safeguard.
  if (targetWasSuper && !nextSuper) {
    const others = await countOtherActiveSuperAdmins(userId);
    if (others === 0) {
      return {
        ok: false,
        error:
          'ไม่สามารถถอนสิทธิ์ได้ — บัญชีนี้เป็นผู้ดูแลระบบสูงสุดที่ยังใช้งานอยู่คนเดียว',
      };
    }
  }

  await userRef.update({
    'roles.isSuperAdmin': nextSuper,
    'roles.isAdmin': nextAdmin,
    'roles.isLecturer': roles.isLecturer === true,
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
      isSuperAdmin: nextSuper,
      isAdmin: nextAdmin,
      isLecturer: roles.isLecturer === true,
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
  const actorIsSuper = profile.roles.isSuperAdmin === true;
  if (userId === actor.uid && !isActive) {
    return { ok: false, error: 'ไม่สามารถปิดใช้งานบัญชีของตนเองได้' };
  }

  const db = getAdminDb();
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return { ok: false, error: 'ไม่พบผู้ใช้' };
  }
  const targetRoles = (userSnap.data()?.roles ?? {}) as {
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
  };
  const targetIsAdmin = targetRoles.isAdmin === true || targetRoles.isSuperAdmin === true;

  // Super-admin gate: only a super admin may activate/deactivate an admin.
  if (targetIsAdmin && !actorIsSuper) {
    return {
      ok: false,
      error: 'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่จัดการบัญชีผู้ดูแลระบบได้',
    };
  }

  // Last-admin safeguard: refuse if deactivating the only remaining active
  // admin in the system.
  if (!isActive && targetRoles.isAdmin === true) {
    const others = await countOtherActiveAdmins(userId);
    if (others === 0) {
      return {
        ok: false,
        error:
          'ไม่สามารถปิดใช้งานได้ — บัญชีนี้เป็นผู้ดูแลระบบที่ยังใช้งานอยู่คนเดียว',
      };
    }
  }

  // Last-super-admin safeguard.
  if (!isActive && targetRoles.isSuperAdmin === true) {
    const others = await countOtherActiveSuperAdmins(userId);
    if (others === 0) {
      return {
        ok: false,
        error:
          'ไม่สามารถปิดใช้งานได้ — บัญชีนี้เป็นผู้ดูแลระบบสูงสุดที่ยังใช้งานอยู่คนเดียว',
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
