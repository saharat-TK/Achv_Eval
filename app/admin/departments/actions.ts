'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';

export interface DepartmentFormData {
  nameTh: string;
  nameEn: string;
  isActive: boolean;
}

export type DepartmentActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface DepartmentBlockerDetails {
  programsCount: number;
}

export type DepartmentDeleteResult =
  | { ok: true; id: string }
  | { ok: false; error: string; blockers?: DepartmentBlockerDetails };

async function authorizeAdmin() {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  return user && profile?.roles.isAdmin ? user : null;
}

async function audit(
  action: string,
  deptId: string,
  uid: string,
  email: string | null,
  after: Record<string, unknown> | null = null,
) {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: uid,
    actorEmail: email,
    action,
    entityType: 'departments',
    entityId: deptId,
    before: null,
    after,
  });
}

function validate(data: DepartmentFormData): string | null {
  if (!data.nameTh?.trim()) return 'กรุณาระบุชื่อสาขาวิชา (ไทย)';
  if (!data.nameEn?.trim()) return 'กรุณาระบุชื่อสาขาวิชา (อังกฤษ)';
  return null;
}

function normalize(data: DepartmentFormData) {
  return {
    nameTh: data.nameTh.trim(),
    nameEn: data.nameEn.trim(),
    // isActive is owned by the lifecycle panel; only create sets it.
  };
}

/** Create a new department. Admin only. */
export async function createDepartment(
  data: DepartmentFormData,
): Promise<DepartmentActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มสาขาวิชาได้' };
  }
  const err = validate(data);
  if (err) return { ok: false, error: err };

  const now = FieldValue.serverTimestamp();
  const ref = await getAdminDb()
    .collection('departments')
    .add({ ...normalize(data), isActive: true, createdAt: now, updatedAt: now });

  await audit('department_created', ref.id, user.uid, user.email ?? null);
  revalidatePath('/admin/departments');
  return { ok: true, id: ref.id };
}

/** Update a department. Admin only. */
export async function updateDepartment(
  deptId: string,
  data: DepartmentFormData,
): Promise<DepartmentActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขสาขาวิชาได้' };
  }
  const err = validate(data);
  if (err) return { ok: false, error: err };

  await getAdminDb()
    .collection('departments')
    .doc(deptId)
    .update({ ...normalize(data), updatedAt: FieldValue.serverTimestamp() });

  await audit('department_updated', deptId, user.uid, user.email ?? null);
  revalidatePath('/admin/departments');
  revalidatePath(`/admin/departments/${deptId}`);
  return { ok: true, id: deptId };
}

// ----- Lifecycle ---------------------------------------------------------

/**
 * Soft-delete a department. Marks it inactive and cascades the flag
 * to every program with `departmentId == deptId` (which in turn
 * cascades to their courses and offerings via the existing helpers).
 */
export async function softDeleteDepartment(
  deptId: string,
): Promise<DepartmentActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  await db
    .collection('departments')
    .doc(deptId)
    .update({ isActive: false, updatedAt: now });

  // Cascade: programs → (via their own soft-delete chain) courses + offerings.
  const programsSnap = await db
    .collection('programs')
    .where('departmentId', '==', deptId)
    .get();

  if (programsSnap.size > 0) {
    const programIds = programsSnap.docs.map((d) => d.id);

    // Programs
    const progBatch = db.batch();
    programsSnap.docs.forEach((doc) =>
      progBatch.update(doc.ref, { isActive: false, updatedAt: now }),
    );
    await progBatch.commit();

    // Courses
    const coursesSnap = await db
      .collection('courses')
      .where('programId', 'in', programIds.slice(0, 30))
      .get();
    if (coursesSnap.size > 0) {
      const batch = db.batch();
      coursesSnap.docs.forEach((doc) =>
        batch.update(doc.ref, { isActive: false, updatedAt: now }),
      );
      await batch.commit();
    }

    // Offerings
    const offeringsSnap = await db
      .collection('offerings')
      .where('programId', 'in', programIds.slice(0, 30))
      .get();
    if (offeringsSnap.size > 0) {
      const batch = db.batch();
      offeringsSnap.docs.forEach((doc) =>
        batch.update(doc.ref, { isActive: false, updatedAt: now }),
      );
      await batch.commit();
    }
  }

  await audit('department_soft_deleted', deptId, user.uid, user.email ?? null);
  revalidatePath('/admin/departments');
  revalidatePath(`/admin/departments/${deptId}`);
  revalidatePath('/admin');
  return { ok: true, id: deptId };
}

/** Restore a soft-deleted department. Cascades isActive=true to programs,
 *  courses, and offerings under it. */
export async function restoreDepartment(
  deptId: string,
): Promise<DepartmentActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  await db
    .collection('departments')
    .doc(deptId)
    .update({ isActive: true, updatedAt: now });

  const programsSnap = await db
    .collection('programs')
    .where('departmentId', '==', deptId)
    .get();

  if (programsSnap.size > 0) {
    const programIds = programsSnap.docs.map((d) => d.id);

    const progBatch = db.batch();
    programsSnap.docs.forEach((doc) =>
      progBatch.update(doc.ref, { isActive: true, updatedAt: now }),
    );
    await progBatch.commit();

    const coursesSnap = await db
      .collection('courses')
      .where('programId', 'in', programIds.slice(0, 30))
      .get();
    if (coursesSnap.size > 0) {
      const batch = db.batch();
      coursesSnap.docs.forEach((doc) =>
        batch.update(doc.ref, { isActive: true, updatedAt: now }),
      );
      await batch.commit();
    }

    const offeringsSnap = await db
      .collection('offerings')
      .where('programId', 'in', programIds.slice(0, 30))
      .get();
    if (offeringsSnap.size > 0) {
      const batch = db.batch();
      offeringsSnap.docs.forEach((doc) =>
        batch.update(doc.ref, { isActive: true, updatedAt: now }),
      );
      await batch.commit();
    }
  }

  await audit('department_restored', deptId, user.uid, user.email ?? null);
  revalidatePath('/admin/departments');
  revalidatePath(`/admin/departments/${deptId}`);
  revalidatePath('/admin');
  return { ok: true, id: deptId };
}

/**
 * Hard-delete a department. Refuses if any program references it.
 * Use the purgeDepartment callable for the destructive cascade.
 */
export async function deleteDepartment(
  deptId: string,
): Promise<DepartmentDeleteResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  const db = getAdminDb();
  const programsSnap = await db
    .collection('programs')
    .where('departmentId', '==', deptId)
    .get();
  if (programsSnap.size > 0) {
    return {
      ok: false,
      error: 'blockers_exist',
      blockers: { programsCount: programsSnap.size },
    };
  }
  await db.collection('departments').doc(deptId).delete();
  await audit('department_hard_deleted', deptId, user.uid, user.email ?? null);
  revalidatePath('/admin/departments');
  return { ok: true, id: deptId };
}

/** Pre-check for the UI: how many programs would block a hard-delete. */
export async function checkDepartmentBlockers(
  deptId: string,
): Promise<
  | { ok: true; blockers: DepartmentBlockerDetails }
  | { ok: false; error: string }
> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตรวจสอบสิทธิ์นี้ได้' };
  }
  const db = getAdminDb();
  const programsSnap = await db
    .collection('programs')
    .where('departmentId', '==', deptId)
    .get();
  return { ok: true, blockers: { programsCount: programsSnap.size } };
}
