'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import { normalizeEmail } from '@/lib/data/allowlist';
import type { AllowlistDoc, UserDoc } from '@/lib/types/models';

export type ProgramAssignmentActionResult =
  | { ok: true }
  | { ok: false; error: string };

interface PersonRef {
  kind: 'user' | 'allowlist';
  id: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parsePersonKey(key: string): PersonRef | null {
  if (key.startsWith('user:')) return { kind: 'user', id: key.slice(5) };
  if (key.startsWith('allowlist:')) {
    return { kind: 'allowlist', id: normalizeEmail(key.slice(10)) };
  }
  return null;
}

async function authorizeAdmin() {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  return user && profile?.roles.isAdmin ? user : null;
}

async function getCurriculumIdsForAcademicPrograms(
  academicProgramIds: string[],
): Promise<string[]> {
  const ids = unique(academicProgramIds);
  if (ids.length === 0) return [];
  const db = getAdminDb();
  const snaps = await Promise.all(
    ids.map((id) => db.collection('programs').where('parentProgramId', '==', id).get()),
  );
  return unique(snaps.flatMap((snap) => snap.docs.map((doc) => doc.id)));
}

async function getCurriculumToAcademicProgram(): Promise<Map<string, string>> {
  const snap = await getAdminDb().collection('programs').get();
  const map = new Map<string, string>();
  snap.docs.forEach((doc) => {
    const parentProgramId = doc.data().parentProgramId;
    if (typeof parentProgramId === 'string' && parentProgramId) {
      map.set(doc.id, parentProgramId);
    }
  });
  return map;
}

function academicIdsFromRoles(
  roles: UserDoc['roles'],
  curriculumToAcademicProgram: Map<string, string>,
): string[] {
  if (roles.directorOfAcademicPrograms?.length) {
    return unique(roles.directorOfAcademicPrograms);
  }
  return unique(
    (roles.directorOf ?? [])
      .map((id) => curriculumToAcademicProgram.get(id))
      .filter((id): id is string => Boolean(id)),
  );
}

function removeAll(values: string[] | undefined, remove: Set<string>): string[] {
  return unique((values ?? []).filter((value) => !remove.has(value)));
}

async function assertProgramExists(programId: string): Promise<boolean> {
  const snap = await getAdminDb().collection('academicPrograms').doc(programId).get();
  return snap.exists;
}

async function audit(
  action: string,
  actorId: string,
  actorEmail: string | null,
  after: Record<string, unknown>,
) {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId,
    actorEmail,
    action,
    entityType: 'users',
    entityId: 'program-assignments',
    before: null,
    after,
  });
}

export async function saveProgramAssignments(input: {
  academicProgramId: string;
  directorKey: string | null;
  lecturerKeys: string[];
}): Promise<ProgramAssignmentActionResult> {
  const actor = await authorizeAdmin();
  if (!actor) return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการได้' };
  if (!(await assertProgramExists(input.academicProgramId))) {
    return { ok: false, error: 'ไม่พบหลักสูตร' };
  }

  const directorRef = input.directorKey ? parsePersonKey(input.directorKey) : null;
  if (input.directorKey && !directorRef) return { ok: false, error: 'ข้อมูลประธานไม่ถูกต้อง' };

  const lecturerRefs = input.lecturerKeys.map(parsePersonKey);
  if (lecturerRefs.some((ref) => !ref)) {
    return { ok: false, error: 'ข้อมูลอาจารย์ไม่ถูกต้อง' };
  }

  const db = getAdminDb();
  const [usersSnap, allowSnap, curriculumToAcademicProgram, curriculumIds] =
    await Promise.all([
      db.collection('users').get(),
      db.collection('allowlist').get(),
      getCurriculumToAcademicProgram(),
      getCurriculumIdsForAcademicPrograms([input.academicProgramId]),
    ]);

  const userIds = new Set(usersSnap.docs.map((doc) => doc.id));
  const pendingAllowlistIds = new Set(
    allowSnap.docs.filter((doc) => !doc.data().consumedAt).map((doc) => doc.id),
  );

  const allRefs = [directorRef, ...(lecturerRefs as PersonRef[])].filter(
    (ref): ref is PersonRef => Boolean(ref),
  );
  for (const ref of allRefs) {
    if (ref.kind === 'user' && !userIds.has(ref.id)) {
      return { ok: false, error: 'ไม่พบผู้ใช้ที่เลือก' };
    }
    if (ref.kind === 'allowlist' && !pendingAllowlistIds.has(ref.id)) {
      return { ok: false, error: 'ไม่พบรายชื่อรอลงทะเบียนที่เลือก' };
    }
  }

  const lecturerUserIds = new Set(
    (lecturerRefs as PersonRef[])
      .filter((ref) => ref.kind === 'user')
      .map((ref) => ref.id),
  );
  const lecturerAllowlistIds = new Set(
    (lecturerRefs as PersonRef[])
      .filter((ref) => ref.kind === 'allowlist')
      .map((ref) => ref.id),
  );
  const directorUserId = directorRef?.kind === 'user' ? directorRef.id : null;
  const directorAllowlistId = directorRef?.kind === 'allowlist' ? directorRef.id : null;
  const curriculumRemove = new Set(curriculumIds);

  const directorMirrorByUser = await Promise.all(
    usersSnap.docs.map(async (doc) => {
      const data = doc.data() as UserDoc;
      const roles = data.roles ?? {
        isAdmin: false,
        directorOf: [],
        assessorOf: [],
        verifierOf: [],
      };
      let nextDirectorAcademic = removeAll(
        academicIdsFromRoles(roles, curriculumToAcademicProgram),
        new Set([input.academicProgramId]),
      );
      if (doc.id === directorUserId) {
        nextDirectorAcademic = unique([...nextDirectorAcademic, input.academicProgramId]);
      }
      return [doc.id, await getCurriculumIdsForAcademicPrograms(nextDirectorAcademic)] as const;
    }),
  );
  const directorMirrorMap = new Map(directorMirrorByUser);

  const batch = db.batch();
  usersSnap.docs.forEach((doc) => {
    const data = doc.data() as UserDoc;
    const roles = data.roles ?? {
      isAdmin: false,
      directorOf: [],
      assessorOf: [],
      verifierOf: [],
    };
    let nextDirectorAcademic = removeAll(
      academicIdsFromRoles(roles, curriculumToAcademicProgram),
      new Set([input.academicProgramId]),
    );
    if (doc.id === directorUserId) {
      nextDirectorAcademic = unique([...nextDirectorAcademic, input.academicProgramId]);
    }

    const currentLecturerOf = roles.lecturerOf ?? [];
    let nextLecturerOf = removeAll(currentLecturerOf, curriculumRemove);
    if (lecturerUserIds.has(doc.id)) {
      nextLecturerOf = unique([...nextLecturerOf, ...curriculumIds]);
    }

    batch.update(doc.ref, {
      'roles.directorOfAcademicPrograms': nextDirectorAcademic,
      'roles.directorOf': directorMirrorMap.get(doc.id) ?? [],
      'roles.lecturerOf': nextLecturerOf,
      ...(lecturerUserIds.has(doc.id) ? { 'roles.isLecturer': true } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  allowSnap.docs.forEach((doc) => {
    const data = doc.data() as AllowlistDoc;
    if (data.consumedAt) return;
    let directorAcademicIds = removeAll(
      [
        ...(data.presetDirectorAcademicProgramIds ?? []),
        ...(data.presetIsDirector && data.presetDirectorProgramId
          ? [
              curriculumToAcademicProgram.get(data.presetDirectorProgramId) ??
                data.presetDirectorProgramId,
            ]
          : []),
      ],
      new Set([input.academicProgramId]),
    );
    if (doc.id === directorAllowlistId) {
      directorAcademicIds = unique([...directorAcademicIds, input.academicProgramId]);
    }

    let lecturerAcademicIds = removeAll(
      data.presetLecturerAcademicProgramIds,
      new Set([input.academicProgramId]),
    );
    if (lecturerAllowlistIds.has(doc.id)) {
      lecturerAcademicIds = unique([...lecturerAcademicIds, input.academicProgramId]);
    }

    batch.update(doc.ref, {
      presetDirectorAcademicProgramIds: directorAcademicIds,
      presetIsDirector: directorAcademicIds.length > 0,
      presetDirectorProgramId: directorAcademicIds[0] ?? null,
      presetLecturerAcademicProgramIds: lecturerAcademicIds,
      ...(lecturerAllowlistIds.has(doc.id) ? { presetIsLecturer: true } : {}),
    });
  });

  await batch.commit();
  await audit('program_assignments_updated', actor.uid, actor.email ?? null, {
    academicProgramId: input.academicProgramId,
    directorKey: input.directorKey,
    lecturerKeys: input.lecturerKeys,
  });

  revalidatePath('/admin/users');
  revalidatePath('/admin/users/allowlist');
  revalidatePath('/admin/users/program-assignments');
  revalidatePath('/admin/offering-manager');
  return { ok: true };
}

export async function clearProgramAssignments(
  academicProgramId: string,
): Promise<ProgramAssignmentActionResult> {
  return saveProgramAssignments({
    academicProgramId,
    directorKey: null,
    lecturerKeys: [],
  });
}
