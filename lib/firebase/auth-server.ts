import 'server-only';
import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from './admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { UserDoc } from '@/lib/types/models';

const SESSION_COOKIE = 'session';
/** Set by a super-admin's "view as user" action; honored only for super-admins. */
export const IMPERSONATE_COOKIE = 'impersonate_uid';

/**
 * Verifies the session cookie and returns the decoded Firebase token,
 * or null if there is no valid session. Use in server components and
 * route handlers to authorize requests.
 *
 * `checkRevoked = true` makes this hit Firebase on every call; acceptable
 * for page loads. For hot paths, cache per request.
 */
export async function getSessionUser(): Promise<DecodedIdToken | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (!session) return null;

  try {
    return await getAdminAuth().verifySessionCookie(session, true);
  } catch {
    return null;
  }
}

/**
 * Returns the application profile (users/{uid}) for the current session,
 * including role assignments. Null if not signed in, no profile yet, or the
 * account has been deactivated — so a deactivated user loses access on the
 * next navigation even if their session cookie is still valid.
 */
export async function getCurrentProfile(): Promise<
  (UserDoc & { uid: string; impersonating?: boolean }) | null
> {
  // Super-admin "view as user": when impersonating, resolve to the target's
  // profile so all role-based rendering + read authorization reflect that user.
  // Writes are blocked separately (see assertNotImpersonating).
  const imp = await getImpersonation();
  if (imp) {
    const snap = await getAdminDb().collection('users').doc(imp.target.uid).get();
    if (snap.exists) {
      return { uid: imp.target.uid, ...(snap.data() as UserDoc), impersonating: true };
    }
  }
  return getRealProfile();
}

/** The actually-signed-in user's profile, ignoring any active impersonation.
 *  Use for audit, the impersonation banner, and the "view as" launcher gate. */
export async function getRealProfile(): Promise<(UserDoc & { uid: string }) | null> {
  const decoded = await getSessionUser();
  if (!decoded) return null;

  const snap = await getAdminDb().collection('users').doc(decoded.uid).get();
  if (!snap.exists) return null;

  const data = snap.data() as UserDoc;
  if (data.isActive === false) return null;

  return { uid: decoded.uid, ...data };
}

/**
 * Resolves a valid impersonation, or null. Only a super-admin may impersonate,
 * and only an active non-admin target — so "view as" can never escalate. Reads
 * the cookie first and short-circuits, so non-impersonated requests pay nothing.
 */
export async function getImpersonation(): Promise<{
  real: { uid: string; nameTh: string };
  target: { uid: string; nameTh: string };
} | null> {
  const cookieStore = await cookies();
  const targetUid = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  if (!targetUid) return null;

  const real = await getRealProfile();
  if (!real || real.roles?.isSuperAdmin !== true || targetUid === real.uid) return null;

  const snap = await getAdminDb().collection('users').doc(targetUid).get();
  if (!snap.exists) return null;
  const t = snap.data() as UserDoc;
  if (t.isActive === false || t.roles?.isAdmin === true || t.roles?.isSuperAdmin === true) {
    return null;
  }
  return {
    real: { uid: real.uid, nameTh: real.nameTh },
    target: { uid: targetUid, nameTh: t.nameTh },
  };
}

/** True when the current request is a super-admin viewing as another user.
 *  Write entrypoints use this to stay read-only during impersonation. */
export async function isImpersonating(): Promise<boolean> {
  return (await getImpersonation()) !== null;
}
