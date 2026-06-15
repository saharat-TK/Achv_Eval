'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';

export type VerificationActionResult = { ok: true } | { ok: false; error: string };

async function authorizeAdmin() {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  return user && profile?.roles.isAdmin ? user : null;
}

/** Curriculum-revision ids (`programs/{id}`) belonging to an academic program.
 *  The verification workspace authorizes by curriculum id (`offerings.programId`),
 *  so the `verifierOf` mirror must be kept in sync with these. */
async function curriculumIdsForProgram(academicProgramId: string): Promise<string[]> {
  const snap = await getAdminDb()
    .collection('programs')
    .where('parentProgramId', '==', academicProgramId)
    .get();
  return snap.docs.map((d) => d.id);
}

/** Splits picked keys (`user:<uid>` / `allowlist:<id>`) into the two id sets. */
function splitKeys(keys: string[]): { uids: Set<string>; allow: Set<string> } {
  const uids = new Set<string>();
  const allow = new Set<string>();
  for (const key of keys) {
    if (key.startsWith('user:')) uids.add(key.slice(5));
    else if (key.startsWith('allowlist:')) allow.add(key.slice(10));
  }
  return { uids, allow };
}

/** Current verifier membership for one program, read back from the source of
 *  truth (user roles + pending allowlist presets). */
async function currentMembership(
  academicProgramId: string,
  curriculumIds: string[],
): Promise<{ uids: Set<string>; allow: Set<string> }> {
  const db = getAdminDb();
  const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [
    db
      .collection('users')
      .where('roles.verifierOfAcademicPrograms', 'array-contains', academicProgramId)
      .get(),
    db
      .collection('allowlist')
      .where('presetVerifierAcademicProgramIds', 'array-contains', academicProgramId)
      .get(),
  ];
  // Legacy users may carry only the curriculum mirror, not the academic-program id.
  if (curriculumIds.length > 0) {
    queries.push(
      db
        .collection('users')
        .where('roles.verifierOf', 'array-contains-any', curriculumIds.slice(0, 30))
        .get(),
    );
  }
  const [userByAcademic, allowByPreset, userByCurriculum] = await Promise.all(queries);

  const uids = new Set<string>();
  userByAcademic.docs.forEach((d) => uids.add(d.id));
  userByCurriculum?.docs.forEach((d) => uids.add(d.id));
  const allow = new Set<string>();
  allowByPreset.docs.forEach((d) => allow.add(d.id));
  return { uids, allow };
}

/**
 * Replaces a program's verification-committee membership with the picked set.
 * Admin only. Grants `verifierOfAcademicPrograms` + the `verifierOf` curriculum
 * mirror to added users (and `presetVerifierAcademicProgramIds` to pending
 * allowlist members), and revokes them from anyone dropped since the last save.
 */
export async function saveVerificationCommittee(
  academicProgramId: string,
  memberKeys: string[],
): Promise<VerificationActionResult> {
  const actor = await authorizeAdmin();
  if (!actor) return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการได้' };

  const db = getAdminDb();
  const ref = db.collection('academicPrograms').doc(academicProgramId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'ไม่พบหลักสูตร' };

  const curriculumIds = await curriculumIdsForProgram(academicProgramId);
  const next = splitKeys(memberKeys);
  const before = await currentMembership(academicProgramId, curriculumIds);

  const batch = db.batch();
  // Grant to the new set.
  for (const uid of next.uids)
    batch.update(db.collection('users').doc(uid), {
      'roles.verifierOfAcademicPrograms': FieldValue.arrayUnion(academicProgramId),
      ...(curriculumIds.length
        ? { 'roles.verifierOf': FieldValue.arrayUnion(...curriculumIds) }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  for (const id of next.allow)
    batch.update(db.collection('allowlist').doc(id), {
      presetVerifierAcademicProgramIds: FieldValue.arrayUnion(academicProgramId),
    });
  // Revoke from anyone dropped.
  for (const uid of before.uids)
    if (!next.uids.has(uid))
      batch.update(db.collection('users').doc(uid), {
        'roles.verifierOfAcademicPrograms': FieldValue.arrayRemove(academicProgramId),
        ...(curriculumIds.length
          ? { 'roles.verifierOf': FieldValue.arrayRemove(...curriculumIds) }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
  for (const id of before.allow)
    if (!next.allow.has(id))
      batch.update(db.collection('allowlist').doc(id), {
        presetVerifierAcademicProgramIds: FieldValue.arrayRemove(academicProgramId),
      });

  try {
    await batch.commit();
  } catch (err) {
    console.error('saveVerificationCommittee failed', err);
    return { ok: false, error: 'บันทึกไม่สำเร็จ — กรุณาลองใหม่' };
  }

  await db.collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: actor.uid,
    actorEmail: actor.email ?? null,
    action: 'verification_committee_saved',
    entityType: 'academicPrograms',
    entityId: academicProgramId,
    before: null,
    after: { users: [...next.uids], allowlist: [...next.allow] },
  });

  revalidatePath('/admin/users/verification-committee');
  revalidatePath('/admin/users');
  return { ok: true };
}

/** Removes every verifier from a program's verification committee. Admin only. */
export async function clearVerificationCommittee(
  academicProgramId: string,
): Promise<VerificationActionResult> {
  return saveVerificationCommittee(academicProgramId, []);
}
