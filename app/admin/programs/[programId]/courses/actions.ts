'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import type { CourseType, Semester } from '@/lib/types/models';

export interface CourseFormData {
  code: string;
  nameTh: string;
  nameEn: string;
  creditStructure: string; // e.g. "2(2-0-4)"
  type: CourseType;
  yearOfStudy: number | null;
  semester: Semester | null;
  isActive: boolean;
}

export type CourseActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const COURSE_TYPES: CourseType[] = [
  'theory',
  'theory_practice',
  'practice',
  'field',
  's_u',
];

/** Parses the leading number of a credit structure ("2(2-0-4)" → 2). */
function parseCredits(structure: string): number {
  const m = structure.trim().match(/^(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

async function authorize(programId: string) {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  const allowed =
    profile?.roles.isAdmin || profile?.roles.directorOf?.includes(programId);
  return user && allowed ? user : null;
}

async function authorizeAdmin() {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  return user && profile?.roles.isAdmin ? user : null;
}

async function audit(
  action: string,
  courseId: string,
  uid: string,
  email: string | null,
  after: Record<string, unknown> | null = null,
) {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: uid,
    actorEmail: email,
    action,
    entityType: 'courses',
    entityId: courseId,
    before: null,
    after,
  });
}

function validate(data: CourseFormData): string | null {
  if (!data.code?.trim()) return 'กรุณาระบุรหัสวิชา';
  if (!data.nameTh?.trim()) return 'กรุณาระบุชื่อวิชา (ไทย)';
  if (!data.nameEn?.trim()) return 'กรุณาระบุชื่อวิชา (อังกฤษ)';
  if (!data.creditStructure?.trim()) return 'กรุณาระบุโครงสร้างหน่วยกิต';
  if (parseCredits(data.creditStructure) <= 0)
    return 'โครงสร้างหน่วยกิตไม่ถูกต้อง (เช่น 2(2-0-4))';
  return null;
}

/**
 * Returns the set of course codes already used in a program (lowercased).
 * One query per call; used to enforce code uniqueness within a program
 * (audit finding C4).
 */
async function existingCodesForProgram(
  programId: string,
  excludeCourseId?: string,
): Promise<Set<string>> {
  const snap = await getAdminDb()
    .collection('courses')
    .where('programId', '==', programId)
    .get();
  const codes = new Set<string>();
  for (const doc of snap.docs) {
    if (doc.id === excludeCourseId) continue;
    const code = (doc.data().code as string | undefined)?.trim().toLowerCase();
    if (code) codes.add(code);
  }
  return codes;
}

function toDoc(programId: string, data: CourseFormData) {
  return {
    programId,
    code: data.code.trim(),
    nameTh: data.nameTh.trim(),
    nameEn: data.nameEn.trim(),
    creditStructure: data.creditStructure.trim(),
    credits: parseCredits(data.creditStructure),
    type: data.type,
    yearOfStudy: data.yearOfStudy ?? null,
    semester: data.semester ?? null,
    isActive: data.isActive,
  };
}

export async function createCourse(
  programId: string,
  data: CourseFormData,
): Promise<CourseActionResult> {
  const user = await authorize(programId);
  if (!user) return { ok: false, error: 'ท่านไม่มีสิทธิ์จัดการรายวิชาของหลักสูตรนี้' };

  const err = validate(data);
  if (err) return { ok: false, error: err };

  // C4: uniqueness check
  const existing = await existingCodesForProgram(programId);
  if (existing.has(data.code.trim().toLowerCase())) {
    return { ok: false, error: `รหัสวิชา ${data.code.trim()} มีอยู่ในหลักสูตรนี้แล้ว` };
  }

  const now = FieldValue.serverTimestamp();
  const ref = await getAdminDb()
    .collection('courses')
    .add({ ...toDoc(programId, data), createdAt: now, updatedAt: now });

  await audit('course_created', ref.id, user.uid, user.email ?? null);
  revalidatePath(`/admin/programs/${programId}/courses`);
  return { ok: true, id: ref.id };
}

export async function updateCourse(
  programId: string,
  courseId: string,
  data: CourseFormData,
): Promise<CourseActionResult> {
  const user = await authorize(programId);
  if (!user) return { ok: false, error: 'ท่านไม่มีสิทธิ์จัดการรายวิชาของหลักสูตรนี้' };

  const err = validate(data);
  if (err) return { ok: false, error: err };

  // C4: uniqueness check (excluding the course being edited)
  const existing = await existingCodesForProgram(programId, courseId);
  if (existing.has(data.code.trim().toLowerCase())) {
    return { ok: false, error: `รหัสวิชา ${data.code.trim()} มีอยู่ในหลักสูตรนี้แล้ว` };
  }

  await getAdminDb()
    .collection('courses')
    .doc(courseId)
    .update({ ...toDoc(programId, data), updatedAt: FieldValue.serverTimestamp() });

  await audit('course_updated', courseId, user.uid, user.email ?? null);
  revalidatePath(`/admin/programs/${programId}/courses`);
  return { ok: true, id: courseId };
}

/**
 * Batch-creates courses from parsed CSV rows. Findings C3–C6:
 * - per-row `course_created` audit entries
 * - code-uniqueness check (existing + within-batch)
 * - optional `isActive` column (default true)
 * - chunked batched writes
 */
export async function batchUploadCourses(
  programId: string,
  rows: Record<string, string>[],
): Promise<{ created: number; errors: string[] }> {
  const user = await authorize(programId);
  if (!user) return { created: 0, errors: ['ท่านไม่มีสิทธิ์'] };

  const db = getAdminDb();
  const errors: string[] = [];
  const existing = await existingCodesForProgram(programId);
  const seenInBatch = new Set<string>();
  const toCreate: { tempId: string; doc: Record<string, unknown>; lineRow: number }[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const line = i + 2; // +1 header, +1 for 1-based
    const typeRaw = (r.type ?? '').trim() as CourseType;
    const semRaw = (r.semester ?? '').trim();
    const isActiveRaw = (r.isActive ?? '').trim().toLowerCase();
    const isActive = !['false', '0', 'no', 'n'].includes(isActiveRaw);
    const data: CourseFormData = {
      code: r.code ?? '',
      nameTh: r.nameTh ?? '',
      nameEn: r.nameEn ?? '',
      creditStructure: r.creditStructure ?? '',
      type: COURSE_TYPES.includes(typeRaw) ? typeRaw : 'theory',
      yearOfStudy: r.yearOfStudy ? Number(r.yearOfStudy) || null : null,
      semester: (['1', '2', '3'] as string[]).includes(semRaw)
        ? (semRaw as Semester)
        : null,
      isActive,
    };

    const err = validate(data);
    if (err) {
      errors.push(`แถว ${line}: ${err}`);
      continue;
    }
    const normalizedCode = data.code.trim().toLowerCase();
    if (existing.has(normalizedCode)) {
      errors.push(
        `แถว ${line}: รหัสวิชา ${data.code.trim()} มีอยู่ในหลักสูตรนี้แล้ว`,
      );
      continue;
    }
    if (seenInBatch.has(normalizedCode)) {
      errors.push(`แถว ${line}: รหัสวิชา ${data.code.trim()} ซ้ำในไฟล์`);
      continue;
    }
    if ((r.type ?? '').trim() && !COURSE_TYPES.includes(typeRaw)) {
      errors.push(
        `แถว ${line}: ประเภทวิชา "${r.type}" ไม่ถูกต้อง — ใช้ค่าเริ่มต้น theory`,
      );
    }
    seenInBatch.add(normalizedCode);
    const ref = db.collection('courses').doc();
    toCreate.push({
      tempId: ref.id,
      doc: {
        ...toDoc(programId, data),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      lineRow: line,
    });
  }

  // C6: chunked Firestore batch writes (≤ 200 courses per batch → 400 ops
  // total with audit, well under the 500-op limit). C3: per-row audit
  // entry inside the same batch keeps the writes atomic per chunk.
  let created = 0;
  for (let start = 0; start < toCreate.length; start += 200) {
    const chunk = toCreate.slice(start, start + 200);
    const batch = db.batch();
    for (const item of chunk) {
      batch.set(db.collection('courses').doc(item.tempId), item.doc);
      batch.set(db.collection('auditLog').doc(), {
        occurredAt: FieldValue.serverTimestamp(),
        actorId: user.uid,
        actorEmail: user.email ?? null,
        action: 'course_created',
        entityType: 'courses',
        entityId: item.tempId,
        before: null,
        after: { via: 'csv_batch', programId, line: item.lineRow },
      });
    }
    await batch.commit();
    created += chunk.length;
  }

  if (created > 0) {
    await audit(
      'courses_batch_uploaded',
      programId,
      user.uid,
      user.email ?? null,
      { created, errors: errors.length },
    );
    revalidatePath(`/admin/programs/${programId}/courses`);
  }
  return { created, errors };
}

/**
 * Mirror a course's isActive flag onto all of its offerings so the lecturer
 * and assessor workspaces (which read offerings, not courses) hide them.
 */
async function cascadeOfferingsActive(
  db: FirebaseFirestore.Firestore,
  courseId: string,
  isActive: boolean,
): Promise<void> {
  const offeringsSnap = await db
    .collection('offerings')
    .where('courseId', '==', courseId)
    .get();
  if (offeringsSnap.size === 0) return;
  const batch = db.batch();
  offeringsSnap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

// ----- Course lifecycle ---------------------------------------------------

/** Soft-delete a course. Flips isActive=false. Reversible via restoreCourse. */
export async function softDeleteCourse(
  courseId: string,
): Promise<CourseActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  const db = getAdminDb();
  const ref = db.collection('courses').doc(courseId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'ไม่พบรายวิชา' };
  const programId = (snap.data()?.programId as string | undefined) ?? '';

  await ref.update({ isActive: false, updatedAt: FieldValue.serverTimestamp() });
  await cascadeOfferingsActive(db, courseId, false);
  await audit('course_soft_deleted', courseId, user.uid, user.email ?? null);
  revalidatePath(`/admin/programs/${programId}/courses`);
  revalidatePath(`/admin/programs/${programId}/courses/${courseId}`);
  return { ok: true, id: courseId };
}

/** Restore a soft-deleted course. */
export async function restoreCourse(
  courseId: string,
): Promise<CourseActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  const db = getAdminDb();
  const ref = db.collection('courses').doc(courseId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'ไม่พบรายวิชา' };
  const programId = (snap.data()?.programId as string | undefined) ?? '';

  await ref.update({ isActive: true, updatedAt: FieldValue.serverTimestamp() });
  await cascadeOfferingsActive(db, courseId, true);
  await audit('course_restored', courseId, user.uid, user.email ?? null);
  revalidatePath(`/admin/programs/${programId}/courses`);
  revalidatePath(`/admin/programs/${programId}/courses/${courseId}`);
  return { ok: true, id: courseId };
}

export interface CourseBlockerDetails {
  offeringsCount: number;
}

export type CourseDeleteResult =
  | { ok: true; id: string }
  | { ok: false; error: string; blockers?: CourseBlockerDetails };

/**
 * Hard-delete a course. Refuses if any offering references it.
 * Use purgeCourse (Cloud Function) for the destructive cascade.
 */
export async function deleteCourse(
  courseId: string,
): Promise<CourseDeleteResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  const db = getAdminDb();
  const ref = db.collection('courses').doc(courseId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'ไม่พบรายวิชา' };
  const programId = (snap.data()?.programId as string | undefined) ?? '';

  const offeringsSnap = await db
    .collection('offerings')
    .where('courseId', '==', courseId)
    .get();
  if (offeringsSnap.size > 0) {
    return {
      ok: false,
      error: 'blockers_exist',
      blockers: { offeringsCount: offeringsSnap.size },
    };
  }

  await ref.delete();
  await audit('course_hard_deleted', courseId, user.uid, user.email ?? null);
  revalidatePath(`/admin/programs/${programId}/courses`);
  return { ok: true, id: courseId };
}

/** Pre-check for the UI: how many offerings would block a hard-delete. */
export async function checkCourseBlockers(
  courseId: string,
): Promise<
  | { ok: true; blockers: CourseBlockerDetails }
  | { ok: false; error: string }
> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตรวจสอบสิทธิ์นี้ได้' };
  }
  const db = getAdminDb();
  const offeringsSnap = await db
    .collection('offerings')
    .where('courseId', '==', courseId)
    .get();
  return { ok: true, blockers: { offeringsCount: offeringsSnap.size } };
}
