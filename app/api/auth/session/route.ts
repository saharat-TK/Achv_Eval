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

  // Bootstrap the application profile on first sign-in. The flow is:
  //
  //  • Existing user (users/{uid} exists): respect the isActive flag.
  //    Grandfathers everyone already in the system before the allowlist
  //    gate was introduced.
  //  • New user with an allowlist entry: create users/{uid} from the
  //    allowlist fields and stamp the allowlist as consumed.
  //  • New user with no allowlist entry: refuse with `not_authorized`.
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(decoded.uid);
    const snap = await userRef.get();
    if (snap.exists) {
      if (snap.data()?.isActive === false) {
        return NextResponse.json({ error: 'account_deactivated' }, { status: 403 });
      }
    } else {
      const emailId = decoded.email!.trim().toLowerCase();
      const allowRef = db.collection('allowlist').doc(emailId);
      const allowSnap = await allowRef.get();
      if (!allowSnap.exists) {
        return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
      }
      const allow = allowSnap.data() as {
        nameTh?: string;
        nameEn?: string;
        presetIsLecturer?: boolean;
        presetIsDirector?: boolean;
        presetDirectorProgramId?: string | null;
      };
      const fallback = decoded.email!.split('@')[0] ?? decoded.email!;
      // Apply preset roles. Lecturer defaults true; director (per-program)
      // only when the preset program still exists.
      const isLecturer = allow.presetIsLecturer !== false;
      let directorOf: string[] = [];
      if (allow.presetIsDirector === true && allow.presetDirectorProgramId) {
        const prog = await db
          .collection('programs')
          .doc(allow.presetDirectorProgramId)
          .get();
        if (prog.exists) directorOf = [allow.presetDirectorProgramId];
      }
      await userRef.set({
        email: decoded.email,
        nameTh: allow.nameTh?.trim() || fallback,
        nameEn: allow.nameEn?.trim() || fallback,
        isActive: true,
        roles: {
          isAdmin: false,
          isSuperAdmin: false,
          isLecturer,
          directorOf,
          assessorOf: [],
          verifierOf: [],
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await allowRef.update({
        consumedAt: FieldValue.serverTimestamp(),
        consumedUid: decoded.uid,
      });
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
