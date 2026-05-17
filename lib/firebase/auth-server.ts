import 'server-only';
import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from './admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { UserDoc } from '@/lib/types/models';

const SESSION_COOKIE = 'session';

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
export async function getCurrentProfile(): Promise<(UserDoc & { uid: string }) | null> {
  const decoded = await getSessionUser();
  if (!decoded) return null;

  const snap = await getAdminDb().collection('users').doc(decoded.uid).get();
  if (!snap.exists) return null;

  const data = snap.data() as UserDoc;
  if (data.isActive === false) return null;

  return { uid: decoded.uid, ...data };
}
