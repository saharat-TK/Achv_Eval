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

async function audit(action: string, courseId: string, uid: string, email: string | null) {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: uid,
    actorEmail: email,
    action,
    entityType: 'courses',
    entityId: courseId,
    before: null,
    after: null,
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

  await getAdminDb()
    .collection('courses')
    .doc(courseId)
    .update({ ...toDoc(programId, data), updatedAt: FieldValue.serverTimestamp() });

  await audit('course_updated', courseId, user.uid, user.email ?? null);
  revalidatePath(`/admin/programs/${programId}/courses`);
  return { ok: true, id: courseId };
}

/**
 * Batch-creates courses from parsed CSV rows. Each row that fails validation
 * is reported but does not stop the others.
 */
export async function batchUploadCourses(
  programId: string,
  rows: Record<string, string>[],
): Promise<{ created: number; errors: string[] }> {
  const user = await authorize(programId);
  if (!user) return { created: 0, errors: ['ท่านไม่มีสิทธิ์'] };

  const db = getAdminDb();
  const errors: string[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2; // +1 header, +1 for 1-based
    const typeRaw = (r.type ?? '').trim() as CourseType;
    const semRaw = (r.semester ?? '').trim();
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
      isActive: true,
    };
    const err = validate(data);
    if (err) {
      errors.push(`แถว ${line}: ${err}`);
      continue;
    }
    if (!COURSE_TYPES.includes(typeRaw)) {
      errors.push(`แถว ${line}: ประเภทวิชา "${r.type}" ไม่ถูกต้อง — ใช้ค่าเริ่มต้น theory`);
    }
    const now = FieldValue.serverTimestamp();
    await db
      .collection('courses')
      .add({ ...toDoc(programId, data), createdAt: now, updatedAt: now });
    created++;
  }

  if (created > 0) {
    await audit('courses_batch_uploaded', programId, user.uid, user.email ?? null);
    revalidatePath(`/admin/programs/${programId}/courses`);
  }
  return { created, errors };
}
