import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs'; // firebase-admin needs the Node runtime

const SESSION_COOKIE = 'session';
const EXPIRES_IN_MS = 60 * 60 * 24 * 5 * 1000; // 5 days

async function materializePendingLecturerAssignments(
  db: FirebaseFirestore.Firestore,
  uid: string,
  email: string,
  allowlistId: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const emailValues = [...new Set([email, normalizedEmail])];
  const [byAllowlist, byEmail] = await Promise.all([
    db.collection('offerings').where('pendingLecturerAllowlistId', '==', allowlistId).get(),
    db.collection('offerings').where('pendingLecturerEmail', 'in', emailValues).get(),
  ]);

  const docs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  byAllowlist.docs.forEach((doc) => docs.set(doc.id, doc));
  byEmail.docs.forEach((doc) => docs.set(doc.id, doc));
  if (docs.size === 0) return;

  const batch = db.batch();
  docs.forEach((doc) => {
    const status = doc.data().status;
    batch.update(doc.ref, {
      lecturerId: uid,
      lecturerEmail: email,
      pendingLecturerEmail: null,
      pendingLecturerAllowlistId: null,
      status: status === 'draft' ? 'documents_pending' : status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
  });
  await batch.commit();

  await db.collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: uid,
    actorEmail: email,
    action: 'pending_offering_lecturers_materialized',
    entityType: 'offerings',
    entityId: 'bulk',
    before: null,
    after: {
      offeringIds: [...docs.keys()],
      pendingLecturerAllowlistId: allowlistId,
      pendingLecturerEmail: normalizedEmail,
    },
  });
}

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
    const emailId = decoded.email!.trim().toLowerCase();
    const userRef = db.collection('users').doc(decoded.uid);
    const snap = await userRef.get();
    if (snap.exists) {
      if (snap.data()?.isActive === false) {
        return NextResponse.json({ error: 'account_deactivated' }, { status: 403 });
      }
    } else {
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
        presetDirectorAcademicProgramIds?: string[];
        presetLecturerAcademicProgramIds?: string[];
        presetAssessorAcademicProgramIds?: string[];
      };
      const fallback = decoded.email!.split('@')[0] ?? decoded.email!;
      // Apply preset roles. Lecturer defaults true. Older allowlist rows may
      // still store a curriculum id, so we also derive the academic-program id
      // and keep curriculum arrays as compatibility mirrors.
      const directorAcademicSet = new Set(
        (allow.presetDirectorAcademicProgramIds ?? []).filter(Boolean),
      );
      const lecturerAcademicSet = new Set(
        (allow.presetLecturerAcademicProgramIds ?? []).filter(Boolean),
      );
      let directorOf: string[] = [];
      if (allow.presetIsDirector === true && allow.presetDirectorProgramId) {
        const prog = await db
          .collection('programs')
          .doc(allow.presetDirectorProgramId)
          .get();
        if (prog.exists) {
          directorOf = [allow.presetDirectorProgramId];
          const parentProgramId = prog.data()?.parentProgramId;
          if (typeof parentProgramId === 'string' && parentProgramId) {
            directorAcademicSet.add(parentProgramId);
          }
        } else {
          const academicProgram = await db
            .collection('academicPrograms')
            .doc(allow.presetDirectorProgramId)
            .get();
          if (academicProgram.exists) {
            directorAcademicSet.add(allow.presetDirectorProgramId);
          }
        }
      }
      const directorOfAcademicPrograms = [...directorAcademicSet].sort((a, b) =>
        a.localeCompare(b),
      );
      const lecturerOfAcademicPrograms = [...lecturerAcademicSet].sort((a, b) =>
        a.localeCompare(b),
      );
      const expandAcademicPrograms = async (ids: string[]): Promise<string[]> => {
        if (ids.length === 0) return [];
        const snaps = await Promise.all(
          ids.map((id) =>
            db.collection('programs').where('parentProgramId', '==', id).get(),
          ),
        );
        return [
          ...new Set(snaps.flatMap((snap) => snap.docs.map((doc) => doc.id))),
        ].sort((a, b) => a.localeCompare(b));
      };
      directorOf = [
        ...new Set([
          ...directorOf,
          ...(await expandAcademicPrograms(directorOfAcademicPrograms)),
        ]),
      ].sort((a, b) => a.localeCompare(b));
      const lecturerOf = await expandAcademicPrograms(lecturerOfAcademicPrograms);
      const isLecturer = allow.presetIsLecturer !== false || lecturerOf.length > 0;
      // Assessment-committee placements made while this user was still pending.
      const assessorOfAcademicPrograms = [
        ...new Set((allow.presetAssessorAcademicProgramIds ?? []).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b));
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
          lecturerOf,
          directorOfAcademicPrograms,
          assessorOfAcademicPrograms,
          verifierOfAcademicPrograms: [],
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await allowRef.update({
        consumedAt: FieldValue.serverTimestamp(),
        consumedUid: decoded.uid,
      });
    }
    await materializePendingLecturerAssignments(db, decoded.uid, decoded.email!, emailId);
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
