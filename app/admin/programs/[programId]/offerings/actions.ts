'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import type { Semester, OfferingStatus, OfferingDoc } from '@/lib/types/models';

export interface OfferingFormData {
  courseId: string;
  academicYear: number;
  semester: Semester;
  section: string;
  lecturerId: string | null;
  hasExamAssessment: boolean;
  assignedPloNumbers: number[];
}

export type OfferingActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

async function authorize(programId: string) {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  const allowed =
    profile?.roles.isAdmin || profile?.roles.directorOf?.includes(programId);
  return user && allowed ? user : null;
}

async function audit(action: string, offeringId: string, uid: string, email: string | null) {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: uid,
    actorEmail: email,
    action,
    entityType: 'offerings',
    entityId: offeringId,
    before: null,
    after: null,
  });
}

interface ResolvedRefs {
  courseCode: string;
  courseNameTh: string;
  courseNameEn: string;
  lecturerEmail: string | null;
}

/** Resolves a course and a lecturer into the denormalized fields an
 *  offering carries. Validates the course belongs to the program. */
async function resolveRefs(
  programId: string,
  data: OfferingFormData,
): Promise<{ error: string } | ResolvedRefs> {
  const db = getAdminDb();
  const courseSnap = await db.collection('courses').doc(data.courseId).get();
  if (!courseSnap.exists) return { error: 'ไม่พบรายวิชา' };
  const course = courseSnap.data()!;
  if (course.programId !== programId) {
    return { error: 'รายวิชาไม่ได้อยู่ในหลักสูตรนี้' };
  }

  let lecturerEmail: string | null = null;
  if (data.lecturerId) {
    const u = await db.collection('users').doc(data.lecturerId).get();
    if (!u.exists) return { error: 'ไม่พบอาจารย์ผู้รับผิดชอบ' };
    lecturerEmail = (u.data()?.email as string) ?? null;
  }

  return {
    courseCode: course.code as string,
    courseNameTh: course.nameTh as string,
    courseNameEn: course.nameEn as string,
    lecturerEmail,
  };
}

function validate(data: OfferingFormData): string | null {
  if (!data.courseId) return 'กรุณาเลือกรายวิชา';
  if (!data.academicYear || data.academicYear < 2500) return 'ปีการศึกษาไม่ถูกต้อง (พ.ศ.)';
  if (!['1', '2', '3'].includes(data.semester)) return 'ภาคการศึกษาไม่ถูกต้อง';
  if (!data.section?.trim()) return 'กรุณาระบุตอนเรียน';
  return null;
}

export async function createOffering(
  programId: string,
  data: OfferingFormData,
): Promise<OfferingActionResult> {
  const user = await authorize(programId);
  if (!user) return { ok: false, error: 'ท่านไม่มีสิทธิ์จัดการรายวิชาที่เปิดสอนของหลักสูตรนี้' };

  const err = validate(data);
  if (err) return { ok: false, error: err };

  const refs = await resolveRefs(programId, data);
  if ('error' in refs) return { ok: false, error: refs.error };

  const now = FieldValue.serverTimestamp();
  const status: OfferingStatus = data.lecturerId ? 'documents_pending' : 'draft';

  const ref = await getAdminDb().collection('offerings').add({
    courseId: data.courseId,
    programId,
    courseCode: refs.courseCode,
    courseNameTh: refs.courseNameTh,
    courseNameEn: refs.courseNameEn,
    academicYear: data.academicYear,
    semester: data.semester,
    section: data.section.trim(),
    lecturerId: data.lecturerId ?? null,
    lecturerEmail: refs.lecturerEmail,
    hasExamAssessment: data.hasExamAssessment,
    assignedPloNumbers: data.assignedPloNumbers ?? [],
    status,
    previousOfferingId: null,
    latestAiReportId: null,
    assessmentId: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
    updatedBy: user.uid,
  });

  await audit('offering_created', ref.id, user.uid, user.email ?? null);
  revalidatePath(`/admin/programs/${programId}/offerings`);
  return { ok: true, id: ref.id };
}

export async function updateOffering(
  programId: string,
  offeringId: string,
  data: OfferingFormData,
): Promise<OfferingActionResult> {
  const user = await authorize(programId);
  if (!user) return { ok: false, error: 'ท่านไม่มีสิทธิ์จัดการรายวิชาที่เปิดสอนของหลักสูตรนี้' };

  const err = validate(data);
  if (err) return { ok: false, error: err };

  const refs = await resolveRefs(programId, data);
  if ('error' in refs) return { ok: false, error: refs.error };

  const db = getAdminDb();
  const offeringRef = db.collection('offerings').doc(offeringId);
  const current = (await offeringRef.get()).data();

  // A draft gains a lecturer → it is now awaiting documents.
  let status = current?.status as OfferingStatus | undefined;
  if (status === 'draft' && data.lecturerId) status = 'documents_pending';

  await offeringRef.update({
    courseId: data.courseId,
    courseCode: refs.courseCode,
    courseNameTh: refs.courseNameTh,
    courseNameEn: refs.courseNameEn,
    academicYear: data.academicYear,
    semester: data.semester,
    section: data.section.trim(),
    lecturerId: data.lecturerId ?? null,
    lecturerEmail: refs.lecturerEmail,
    hasExamAssessment: data.hasExamAssessment,
    assignedPloNumbers: data.assignedPloNumbers ?? [],
    ...(status ? { status } : {}),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  });

  await audit('offering_updated', offeringId, user.uid, user.email ?? null);
  revalidatePath(`/admin/programs/${programId}/offerings`);
  revalidatePath(`/admin/programs/${programId}/offerings/${offeringId}`);
  return { ok: true, id: offeringId };
}

/**
 * Clones every offering of a program from one academic year/semester into
 * another — carrying course, lecturer, PLO assignment and exam flag, but
 * resetting status and linking previousOfferingId. Skips a course that
 * already has an offering in the target term.
 */
export async function cloneOfferings(
  programId: string,
  args: { fromYear: number; fromSemester: Semester; toYear: number; toSemester: Semester },
): Promise<{ ok: boolean; created: number; skipped: number; error?: string }> {
  const user = await authorize(programId);
  if (!user) return { ok: false, created: 0, skipped: 0, error: 'ท่านไม่มีสิทธิ์' };

  const { fromYear, fromSemester, toYear, toSemester } = args;
  if (fromYear === toYear && fromSemester === toSemester) {
    return { ok: false, created: 0, skipped: 0, error: 'ภาคต้นทางและปลายทางต้องต่างกัน' };
  }

  const db = getAdminDb();
  const all = await db.collection('offerings').where('programId', '==', programId).get();
  const offerings = all.docs.map((d) => ({ id: d.id, ...(d.data() as OfferingDoc) }));

  const source = offerings.filter(
    (o) => o.academicYear === fromYear && o.semester === fromSemester,
  );
  const targetKeys = new Set(
    offerings
      .filter((o) => o.academicYear === toYear && o.semester === toSemester)
      .map((o) => `${o.courseId}__${o.section}`),
  );

  let created = 0;
  let skipped = 0;
  const now = FieldValue.serverTimestamp();

  for (const src of source) {
    if (targetKeys.has(`${src.courseId}__${src.section}`)) {
      skipped++;
      continue;
    }
    await db.collection('offerings').add({
      courseId: src.courseId,
      programId,
      courseCode: src.courseCode,
      courseNameTh: src.courseNameTh,
      courseNameEn: src.courseNameEn,
      academicYear: toYear,
      semester: toSemester,
      section: src.section,
      lecturerId: src.lecturerId ?? null,
      lecturerEmail: src.lecturerEmail ?? null,
      hasExamAssessment: src.hasExamAssessment ?? true,
      assignedPloNumbers: src.assignedPloNumbers ?? [],
      status: src.lecturerId ? 'documents_pending' : 'draft',
      previousOfferingId: src.id,
      latestAiReportId: null,
      assessmentId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
    });
    created++;
  }

  if (created > 0) {
    await audit('offerings_cloned', programId, user.uid, user.email ?? null);
    revalidatePath(`/admin/programs/${programId}/offerings`);
  }
  return { ok: true, created, skipped };
}
