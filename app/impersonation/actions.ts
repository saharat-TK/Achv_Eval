'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getRealProfile, IMPERSONATE_COOKIE } from '@/lib/firebase/auth-server';
import { getAllUsers } from '@/lib/data/users';

const MAX_AGE_SECONDS = 60 * 60; // 1 hour — "view as" auto-expires.

export interface ImpersonationTarget {
  uid: string;
  nameTh: string;
  email: string;
  summary: string;
}

function roleSummary(roles: {
  isLecturer?: boolean;
  directorOf?: string[];
  assessorOf?: string[];
  verifierOf?: string[];
}): string {
  const parts: string[] = [];
  if (roles.directorOf?.length) parts.push('ประธานหลักสูตร');
  if (roles.assessorOf?.length) parts.push('ผู้ทวนสอบ');
  if (roles.verifierOf?.length) parts.push('กรรมการรับรองผล');
  if (roles.isLecturer) parts.push('อาจารย์ผู้รับผิดชอบ');
  return parts.join(' · ') || 'ผู้ใช้งานทั่วไป';
}

/** Active, non-admin users a super-admin may view as. Super-admin only. */
export async function listImpersonationTargets(): Promise<ImpersonationTarget[]> {
  const real = await getRealProfile();
  if (real?.roles?.isSuperAdmin !== true) return [];
  const users = await getAllUsers();
  return users
    .filter(
      (u) =>
        u.isActive !== false &&
        u.roles?.isAdmin !== true &&
        u.roles?.isSuperAdmin !== true,
    )
    .map((u) => ({
      uid: u.id,
      nameTh: u.nameTh || u.email,
      email: u.email,
      summary: roleSummary(u.roles ?? {}),
    }))
    .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'));
}

export async function startImpersonation(
  targetUid: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await getSessionUser();
  if (!user) return { error: 'not_authenticated' };
  const real = await getRealProfile();
  if (real?.roles?.isSuperAdmin !== true) return { error: 'not_authorized' };
  if (!targetUid || targetUid === user.uid) return { error: 'invalid_target' };

  const db = getAdminDb();
  const snap = await db.collection('users').doc(targetUid).get();
  if (!snap.exists) return { error: 'target_not_found' };
  const t = snap.data()!;
  if (t.isActive === false) return { error: 'target_inactive' };
  if (t.roles?.isAdmin === true || t.roles?.isSuperAdmin === true) {
    return { error: 'cannot_impersonate_admin' };
  }

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_COOKIE, targetUid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });

  await db.collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: user.uid,
    actorEmail: user.email ?? null,
    action: 'impersonation_started',
    entityType: 'users',
    entityId: targetUid,
    before: null,
    after: { targetUid },
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function stopImpersonation(): Promise<{ ok: true }> {
  const user = await getSessionUser();
  const cookieStore = await cookies();
  const targetUid = cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null;
  cookieStore.delete(IMPERSONATE_COOKIE);

  if (user && targetUid) {
    await getAdminDb()
      .collection('auditLog')
      .add({
        occurredAt: FieldValue.serverTimestamp(),
        actorId: user.uid,
        actorEmail: user.email ?? null,
        action: 'impersonation_stopped',
        entityType: 'users',
        entityId: targetUid,
        before: null,
        after: null,
      });
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}
