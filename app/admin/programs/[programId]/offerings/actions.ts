'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import type { Semester, OfferingStatus, OfferingDoc } from '@/lib/types/models';

const ANALYSIS_ATTEMPT_LIMIT = 4;

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

/**
 * One-way: marks a user as a lecturer so the lecturer workspace shows up
 * in their workspace switcher. Never auto-revokes (they may teach other
 * offerings). No-op when no lecturer is assigned.
 */
async function grantLecturerRole(lecturerId: string | null | undefined) {
  if (!lecturerId) return;
  try {
    await getAdminDb()
      .collection('users')
      .doc(lecturerId)
      .update({ 'roles.isLecturer': true });
  } catch {
    // Non-fatal: a missing user doc shouldn't block the offering write.
  }
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
    analysisAttemptLimit: ANALYSIS_ATTEMPT_LIMIT,
    analysisAttemptCount: 0,
    assessmentId: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
    updatedBy: user.uid,
  });

  await grantLecturerRole(data.lecturerId);
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

  await grantLecturerRole(data.lecturerId);
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
      analysisAttemptLimit: ANALYSIS_ATTEMPT_LIMIT,
      analysisAttemptCount: 0,
      assessmentId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
    });
    await grantLecturerRole(src.lecturerId);
    created++;
  }

  if (created > 0) {
    await audit('offerings_cloned', programId, user.uid, user.email ?? null);
    revalidatePath(`/admin/programs/${programId}/offerings`);
  }
  return { ok: true, created, skipped };
}

// ----- Bulk create from selected courses ---------------------------------

export interface BulkCreateOfferingsInput {
  academicYear: number;
  semester: Semester;
  section: string;
  hasExamAssessment: boolean;
}

export interface BulkOfferingFailure {
  courseId: string;
  code: string;
  reason: string;
}

export type BulkCreateOfferingsResult =
  | {
      ok: true;
      created: number;
      failed: BulkOfferingFailure[];
    }
  | { ok: false; error: string };

/**
 * Create one offering per selected course at the same (year, semester,
 * section). Skips any course that already has an offering for that
 * triple, or that is inactive. Lecturer + PLOs are left unassigned —
 * the offering opens in `draft` status and an admin picks those up
 * from the offerings page.
 */
export async function bulkCreateOfferingsFromCourses(
  programId: string,
  courseIds: string[],
  input: BulkCreateOfferingsInput,
): Promise<BulkCreateOfferingsResult> {
  const user = await authorize(programId);
  if (!user) {
    return { ok: false, error: 'ท่านไม่มีสิทธิ์จัดการรายวิชาที่เปิดสอนของหลักสูตรนี้' };
  }

  if (courseIds.length === 0) {
    return { ok: true, created: 0, failed: [] };
  }
  if (!input.academicYear || input.academicYear < 2500) {
    return { ok: false, error: 'ปีการศึกษาไม่ถูกต้อง (พ.ศ.)' };
  }
  if (!['1', '2', '3'].includes(input.semester)) {
    return { ok: false, error: 'ภาคการศึกษาไม่ถูกต้อง' };
  }
  const section = input.section.trim();
  if (!section) {
    return { ok: false, error: 'กรุณาระบุตอนเรียน' };
  }

  const db = getAdminDb();
  const failed: BulkOfferingFailure[] = [];

  // Resolve each course doc.
  const courseSnaps = await Promise.all(
    courseIds.map((id) => db.collection('courses').doc(id).get()),
  );
  const validCourses: Array<{
    id: string;
    code: string;
    nameTh: string;
    nameEn: string;
  }> = [];

  courseSnaps.forEach((snap, i) => {
    const id = courseIds[i];
    if (!snap.exists) {
      failed.push({ courseId: id, code: id, reason: 'ไม่พบรายวิชา' });
      return;
    }
    const data = snap.data() as {
      programId?: string;
      code?: string;
      nameTh?: string;
      nameEn?: string;
      isActive?: boolean;
    };
    const code = data.code ?? id;
    if (data.programId !== programId) {
      failed.push({
        courseId: id,
        code,
        reason: 'รายวิชาไม่ได้อยู่ในหลักสูตรนี้',
      });
      return;
    }
    if (data.isActive === false) {
      failed.push({
        courseId: id,
        code,
        reason: 'รายวิชาปิดใช้งานอยู่ — เปิดใช้งานก่อน',
      });
      return;
    }
    validCourses.push({
      id,
      code,
      nameTh: data.nameTh ?? '',
      nameEn: data.nameEn ?? '',
    });
  });

  // Dedupe against existing offerings at the same (year, semester, section).
  const dedupeChecks = await Promise.all(
    validCourses.map((c) =>
      db
        .collection('offerings')
        .where('courseId', '==', c.id)
        .where('academicYear', '==', input.academicYear)
        .where('semester', '==', input.semester)
        .where('section', '==', section)
        .limit(1)
        .get(),
    ),
  );

  const status: OfferingStatus = 'draft';
  const now = FieldValue.serverTimestamp();
  const createdIds: string[] = [];

  for (let i = 0; i < validCourses.length; i++) {
    const c = validCourses[i];
    if (!dedupeChecks[i].empty) {
      failed.push({
        courseId: c.id,
        code: c.code,
        reason: 'ซ้ำกับการเปิดสอนเดิม',
      });
      continue;
    }
    const ref = await db.collection('offerings').add({
      courseId: c.id,
      programId,
      courseCode: c.code,
      courseNameTh: c.nameTh,
      courseNameEn: c.nameEn,
      academicYear: input.academicYear,
      semester: input.semester,
      section,
      lecturerId: null,
      lecturerEmail: null,
      hasExamAssessment: input.hasExamAssessment,
      assignedPloNumbers: [],
      status,
      previousOfferingId: null,
      latestAiReportId: null,
      analysisAttemptLimit: ANALYSIS_ATTEMPT_LIMIT,
      analysisAttemptCount: 0,
      assessmentId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
    });
    createdIds.push(ref.id);
  }

  if (createdIds.length > 0) {
    await getAdminDb().collection('auditLog').add({
      occurredAt: FieldValue.serverTimestamp(),
      actorId: user.uid,
      actorEmail: user.email ?? null,
      action: 'offerings_bulk_created',
      entityType: 'offerings',
      entityId: programId,
      after: {
        offeringIds: createdIds,
        academicYear: input.academicYear,
        semester: input.semester,
        section,
      },
    });
    revalidatePath(`/admin/programs/${programId}/offerings`);
  }

  return { ok: true, created: createdIds.length, failed };
}
