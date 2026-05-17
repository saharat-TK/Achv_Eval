import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs'; // firebase-admin needs the Node runtime

const SESSION_COOKIE = 'session';
const EXPIRES_IN_MS = 60 * 60 * 24 * 5 * 1000; // 5 days

/**
 * POST /api/auth/session
 * Exchanges a Firebase ID token for an httpOnly session cookie.
 * Enforces the @mfu.ac.th domain restriction server-side — the
 * authoritative check (the client-side check in the login page is only
 * for fast UX feedback).
 */
export async function POST(request: NextRequest) {
  let idToken: string | undefined;
  try {
    ({ idToken } = await request.json());
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!idToken) {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  }

  const adminAuth = getAdminAuth();

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS ?? 'mfu.ac.th')
    .split(',')
    .map((d) => d.trim().toLowerCase());
  const domain = decoded.email?.split('@')[1]?.toLowerCase();

  if (!domain || !allowed.includes(domain)) {
    return NextResponse.json({ error: 'domain_not_allowed' }, { status: 403 });
  }

  // Auto-create the application profile on first sign-in so Firestore
  // security rules (which require users/{uid} to exist) work immediately.
  // Never overwrite an existing profile's roles. A deactivated account is
  // refused here — it never receives a session cookie.
  try {
    const userRef = getAdminDb().collection('users').doc(decoded.uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      const displayName = (decoded.name as string | undefined) ?? decoded.email!;
      await userRef.set({
        email: decoded.email,
        nameTh: displayName,
        nameEn: displayName,
        isActive: true,
        roles: { isAdmin: false, directorOf: [], assessorOf: [] },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (snap.data()?.isActive === false) {
      return NextResponse.json({ error: 'account_deactivated' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'profile_failed' }, { status: 500 });
  }

  let sessionCookie: string;
  try {
    sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: EXPIRES_IN_MS,
    });
  } catch {
    return NextResponse.json({ error: 'session_failed' }, { status: 500 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionCookie, {
    maxAge: EXPIRES_IN_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/auth/session — clears the session cookie (sign-out).
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
