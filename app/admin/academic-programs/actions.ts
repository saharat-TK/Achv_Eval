'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import type { ProgramLevel } from '@/lib/types/models';

export interface AcademicProgramFormData {
  code: string;
  nameTh: string;
  nameEn: string;
  level: ProgramLevel;
  departmentId: string | null;
  isActive: boolean;
}

export type AcademicProgramActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface AcademicProgramBlockerDetails {
  curriculumsCount: number;
}

export type AcademicProgramDeleteResult =
  | { ok: true; id: string }
  | { ok: false; error: string; blockers?: AcademicProgramBlockerDetails };

async function authorizeAdmin() {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  return user && profile?.roles.isAdmin ? user : null;
}

async function audit(
  action: string,
  id: string,
  uid: string,
  email: string | null,
  after: Record<string, unknown> | null = null,
) {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: uid,
    actorEmail: email,
    action,
    entityType: 'academicPrograms',
    entityId: id,
    before: null,
    after,
  });
}

function validate(data: AcademicProgramFormData): string | null {
  if (!data.code?.trim()) return 'กรุณาระบุรหัสหลักสูตร';
  if (!data.nameTh?.trim()) return 'กรุณาระบุชื่อหลักสูตร (ไทย)';
  if (!data.nameEn?.trim()) return 'กรุณาระบุชื่อหลักสูตร (อังกฤษ)';
  return null;
}

async function validateDepartment(departmentId: string | null): Promise<string | null> {
  if (!departmentId) return null;
  const snap = await getAdminDb().collection('departments').doc(departmentId).get();
  if (!snap.exists) return 'สาขาวิชาที่เลือกไม่มีอยู่ในระบบ';
  return null;
}

function normalize(data: AcademicProgramFormData) {
  return {
    code: data.code.trim(),
    nameTh: data.nameTh.trim(),
    nameEn: data.nameEn.trim(),
    level: data.level,
    departmentId: data.departmentId ?? null,
    isActive: data.isActive,
  };
}

/** Create a new academic program. Admin only. */
export async function createAcademicProgram(
  data: AcademicProgramFormData,
): Promise<AcademicProgramActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มหลักสูตรได้' };
  }
  const err = validate(data);
  if (err) return { ok: false, error: err };
  const deptErr = await validateDepartment(data.departmentId);
  if (deptErr) return { ok: false, error: deptErr };

  const now = FieldValue.serverTimestamp();
  const ref = await getAdminDb()
    .collection('academicPrograms')
    .add({ ...normalize(data), createdAt: now, updatedAt: now });

  await audit('academic_program_created', ref.id, user.uid, user.email ?? null);
  revalidatePath('/admin/academic-programs');
  return { ok: true, id: ref.id };
}

/** Update an academic program. Admin only. */
export async function updateAcademicProgram(
  id: string,
  data: AcademicProgramFormData,
): Promise<AcademicProgramActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขหลักสูตรได้' };
  }
  const err = validate(data);
  if (err) return { ok: false, error: err };
  const deptErr = await validateDepartment(data.departmentId);
  if (deptErr) return { ok: false, error: deptErr };

  await getAdminDb()
    .collection('academicPrograms')
    .doc(id)
    .update({ ...normalize(data), updatedAt: FieldValue.serverTimestamp() });

  await audit('academic_program_updated', id, user.uid, user.email ?? null);
  revalidatePath('/admin/academic-programs');
  revalidatePath(`/admin/academic-programs/${id}`);
  return { ok: true, id };
}

/** Soft-delete (deactivate) an academic program. Admin only. */
export async function softDeleteAcademicProgram(
  id: string,
): Promise<AcademicProgramActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  await getAdminDb()
    .collection('academicPrograms')
    .doc(id)
    .update({ isActive: false, updatedAt: FieldValue.serverTimestamp() });
  await audit('academic_program_soft_deleted', id, user.uid, user.email ?? null);
  revalidatePath('/admin/academic-programs');
  revalidatePath(`/admin/academic-programs/${id}`);
  return { ok: true, id };
}

/** Restore a soft-deleted academic program. Admin only. */
export async function restoreAcademicProgram(
  id: string,
): Promise<AcademicProgramActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  await getAdminDb()
    .collection('academicPrograms')
    .doc(id)
    .update({ isActive: true, updatedAt: FieldValue.serverTimestamp() });
  await audit('academic_program_restored', id, user.uid, user.email ?? null);
  revalidatePath('/admin/academic-programs');
  revalidatePath(`/admin/academic-programs/${id}`);
  return { ok: true, id };
}

/**
 * Hard-delete an academic program. Refuses if any curriculum revision
 * references it. Reassign or remove the curriculums first.
 */
export async function deleteAcademicProgram(
  id: string,
): Promise<AcademicProgramDeleteResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  const db = getAdminDb();
  const curriculumsSnap = await db
    .collection('programs')
    .where('parentProgramId', '==', id)
    .get();
  if (curriculumsSnap.size > 0) {
    return {
      ok: false,
      error: 'blockers_exist',
      blockers: { curriculumsCount: curriculumsSnap.size },
    };
  }
  await db.collection('academicPrograms').doc(id).delete();
  await audit('academic_program_hard_deleted', id, user.uid, user.email ?? null);
  revalidatePath('/admin/academic-programs');
  return { ok: true, id };
}

/** Pre-check for the UI: how many curriculums would block a hard-delete. */
export async function checkAcademicProgramBlockers(
  id: string,
): Promise<
  | { ok: true; blockers: AcademicProgramBlockerDetails }
  | { ok: false; error: string }
> {
  const user = await authorizeAdmin();
  if (!user) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const db = getAdminDb();
  const snap = await db
    .collection('programs')
    .where('parentProgramId', '==', id)
    .get();
  return { ok: true, blockers: { curriculumsCount: snap.size } };
}

/** Assign / unassign a curriculum revision to a parent academic program. */
export async function assignCurriculumToProgram(
  curriculumId: string,
  parentProgramId: string | null,
): Promise<AcademicProgramActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  const db = getAdminDb();
  if (parentProgramId) {
    const prog = await db.collection('academicPrograms').doc(parentProgramId).get();
    if (!prog.exists) return { ok: false, error: 'ไม่พบหลักสูตรที่เลือก' };
  }
  await db
    .collection('programs')
    .doc(curriculumId)
    .update({
      parentProgramId: parentProgramId ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  await audit(
    'curriculum_assigned_to_program',
    curriculumId,
    user.uid,
    user.email ?? null,
    { parentProgramId: parentProgramId ?? null },
  );
  revalidatePath('/admin/academic-programs');
  if (parentProgramId) revalidatePath(`/admin/academic-programs/${parentProgramId}`);
  return { ok: true, id: curriculumId };
}
