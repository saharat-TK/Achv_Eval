'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import type { ProgramLevel, PloSchema, ProgramPlo } from '@/lib/types/models';

export interface ProgramFormData {
  code: string;
  nameTh: string;
  nameEn: string;
  school: string;
  level: ProgramLevel;
  ploDomainSchema: PloSchema;
  isActive: boolean;
  /** Optional. `null` = "ไม่ระบุ" / unassigned. */
  departmentId: string | null;
  plos: ProgramPlo[];
}

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function validate(data: ProgramFormData): string | null {
  if (!data.code?.trim()) return 'กรุณาระบุรหัสหลักสูตร';
  if (!data.nameTh?.trim()) return 'กรุณาระบุชื่อหลักสูตร (ไทย)';
  if (!data.nameEn?.trim()) return 'กรุณาระบุชื่อหลักสูตร (อังกฤษ)';
  for (const plo of data.plos) {
    if (!plo.descriptionTh?.trim()) {
      return `PLO ${plo.ploNumber}: กรุณาระบุคำอธิบาย`;
    }
  }
  return null;
}

function normalize(data: ProgramFormData) {
  return {
    code: data.code.trim(),
    nameTh: data.nameTh.trim(),
    nameEn: data.nameEn.trim(),
    school: data.school?.trim() || 'Health Science',
    level: data.level,
    ploDomainSchema: data.ploDomainSchema,
    isActive: data.isActive,
    departmentId: data.departmentId ?? null,
    plos: data.plos.map((p) => ({
      ploNumber: p.ploNumber,
      domain: p.domain,
      descriptionTh: p.descriptionTh.trim(),
      descriptionEn: p.descriptionEn?.trim() || '',
      bloomLevel: p.bloomLevel ?? null,
    })),
  };
}

/** If the form provided a departmentId, verify the doc exists.
 *  Returns an error string when the reference is dangling. */
async function validateDepartment(
  data: ProgramFormData,
): Promise<string | null> {
  if (!data.departmentId) return null;
  const snap = await getAdminDb()
    .collection('departments')
    .doc(data.departmentId)
    .get();
  if (!snap.exists) return 'สาขาวิชาที่เลือกไม่มีอยู่ในระบบ';
  return null;
}

async function writeAudit(
  action: string,
  programId: string,
  actorId: string,
  actorEmail: string | null,
): Promise<void> {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId,
    actorEmail,
    action,
    entityType: 'programs',
    entityId: programId,
    before: null,
    after: null,
  });
}

/** Create a new program. Admin only. */
export async function createProgram(data: ProgramFormData): Promise<ActionResult> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!user || !profile?.roles.isAdmin) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มหลักสูตรได้' };
  }

  const err = validate(data);
  if (err) return { ok: false, error: err };
  const deptErr = await validateDepartment(data);
  if (deptErr) return { ok: false, error: deptErr };

  const now = FieldValue.serverTimestamp();
  const ref = await getAdminDb()
    .collection('programs')
    .add({ ...normalize(data), createdAt: now, updatedAt: now });

  await writeAudit('program_created', ref.id, user.uid, user.email ?? null);
  revalidatePath('/admin');
  return { ok: true, id: ref.id };
}

/** Update a program. Admin, or the director of that program. */
export async function updateProgram(
  programId: string,
  data: ProgramFormData,
): Promise<ActionResult> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  const allowed =
    profile?.roles.isAdmin ||
    profile?.roles.directorOf?.includes(programId);
  if (!user || !allowed) {
    return { ok: false, error: 'ท่านไม่มีสิทธิ์แก้ไขหลักสูตรนี้' };
  }

  const err = validate(data);
  if (err) return { ok: false, error: err };
  const deptErr = await validateDepartment(data);
  if (deptErr) return { ok: false, error: deptErr };

  await getAdminDb()
    .collection('programs')
    .doc(programId)
    .update({ ...normalize(data), updatedAt: FieldValue.serverTimestamp() });

  await writeAudit('program_updated', programId, user.uid, user.email ?? null);
  revalidatePath('/admin');
  revalidatePath(`/admin/programs/${programId}`);
  return { ok: true, id: programId };
}

/** Soft-delete a program. Marks the program and its courses as inactive. Admin only. */
export async function softDeleteProgram(programId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!user || !profile?.roles.isAdmin) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }

  const db = getAdminDb();
  
  // Update program doc
  await db.collection('programs').doc(programId).update({
    isActive: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Cascade to courses
  const coursesSnap = await db
    .collection('courses')
    .where('programId', '==', programId)
    .get();

  if (coursesSnap.size > 0) {
    const batch = db.batch();
    coursesSnap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  // Cascade to offerings — hides them from lecturer + assessor workspaces.
  const offeringsSnap = await db
    .collection('offerings')
    .where('programId', '==', programId)
    .get();

  if (offeringsSnap.size > 0) {
    const batch = db.batch();
    offeringsSnap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  await writeAudit('program_soft_deleted', programId, user.uid, user.email ?? null);
  
  revalidatePath('/admin');
  revalidatePath(`/admin/programs/${programId}`);
  return { ok: true, id: programId };
}

/** Restore a soft-deleted program. Marks the program and its courses as active. Admin only. */
export async function restoreProgram(programId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!user || !profile?.roles.isAdmin) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }

  const db = getAdminDb();
  
  // Update program doc
  await db.collection('programs').doc(programId).update({
    isActive: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Cascade to courses
  const coursesSnap = await db
    .collection('courses')
    .where('programId', '==', programId)
    .get();

  if (coursesSnap.size > 0) {
    const batch = db.batch();
    coursesSnap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isActive: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  // Cascade to offerings — re-exposes them in lecturer + assessor workspaces.
  const offeringsSnap = await db
    .collection('offerings')
    .where('programId', '==', programId)
    .get();

  if (offeringsSnap.size > 0) {
    const batch = db.batch();
    offeringsSnap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isActive: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  await writeAudit('program_restored', programId, user.uid, user.email ?? null);
  
  revalidatePath('/admin');
  revalidatePath(`/admin/programs/${programId}`);
  return { ok: true, id: programId };
}

export interface BlockerDetails {
  coursesCount: number;
  offeringsCount: number;
  reviewsCount: number;
  assignedUsers: string[];
}

export type DeleteResult =
  | { ok: true; id: string }
  | { ok: false; error: string; blockers?: BlockerDetails };

/** Hard-delete a program. Must pass safety guards. Admin only. */
export async function deleteProgram(programId: string): Promise<DeleteResult> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!user || !profile?.roles.isAdmin) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }

  const db = getAdminDb();

  // 1. Guard checks
  const coursesSnap = await db
    .collection('courses')
    .where('programId', '==', programId)
    .get();

  const offeringsSnap = await db
    .collection('offerings')
    .where('programId', '==', programId)
    .get();

  const reviewsSnap = await db
    .collection('implementationReviews')
    .where('programId', '==', programId)
    .get();

  const usersSnap = await db.collection('users').get();
  const assignedUsers: string[] = [];
  usersSnap.docs.forEach((doc) => {
    const data = doc.data();
    const roles = data.roles || {};
    const d = roles.directorOf || [];
    const a = roles.assessorOf || [];
    const v = roles.verifierOf || [];
    if (d.includes(programId) || a.includes(programId) || v.includes(programId)) {
      assignedUsers.push(data.email || data.nameTh || doc.id);
    }
  });

  const coursesCount = coursesSnap.size;
  const offeringsCount = offeringsSnap.size;
  const reviewsCount = reviewsSnap.size;

  if (coursesCount > 0 || offeringsCount > 0 || reviewsCount > 0 || assignedUsers.length > 0) {
    return {
      ok: false,
      error: 'blockers_exist',
      blockers: {
        coursesCount,
        offeringsCount,
        reviewsCount,
        assignedUsers,
      },
    };
  }

  // 2. No blockers: proceed with simple delete of the program doc
  await db.collection('programs').doc(programId).delete();

  await writeAudit('program_hard_deleted', programId, user.uid, user.email ?? null);

  revalidatePath('/admin');
  return { ok: true, id: programId };
}

/** Pre-check if a program has any blocker relations preventing hard-delete. Admin only. */
export async function checkProgramBlockers(
  programId: string
): Promise<{ ok: true; blockers: BlockerDetails } | { ok: false; error: string }> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!user || !profile?.roles.isAdmin) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตรวจสอบสิทธิ์นี้ได้' };
  }

  const db = getAdminDb();

  const coursesSnap = await db
    .collection('courses')
    .where('programId', '==', programId)
    .get();

  const offeringsSnap = await db
    .collection('offerings')
    .where('programId', '==', programId)
    .get();

  const reviewsSnap = await db
    .collection('implementationReviews')
    .where('programId', '==', programId)
    .get();

  const usersSnap = await db.collection('users').get();
  const assignedUsers: string[] = [];
  usersSnap.docs.forEach((doc) => {
    const data = doc.data();
    const roles = data.roles || {};
    const d = roles.directorOf || [];
    const a = roles.assessorOf || [];
    const v = roles.verifierOf || [];
    if (d.includes(programId) || a.includes(programId) || v.includes(programId)) {
      assignedUsers.push(data.email || data.nameTh || doc.id);
    }
  });

  return {
    ok: true,
    blockers: {
      coursesCount: coursesSnap.size,
      offeringsCount: offeringsSnap.size,
      reviewsCount: reviewsSnap.size,
      assignedUsers,
    },
  };
}

