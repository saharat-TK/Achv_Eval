'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getCurriculumsWithCourses,
  type CurriculumWithCourses,
} from '@/lib/data/offeringManager';
import type { OfferingStatus, Semester } from '@/lib/types/models';

const DEFAULT_SECTION = '01';
const NO_DATA_STATUSES: OfferingStatus[] = ['draft', 'documents_pending'];

export interface BulkCreateInput {
  academicYear: number;
  semester: Semester;
  courseIds: string[];
}

export interface OfferingActionFailure {
  id: string;
  label: string;
  reason: string;
}

export type ManagerActionResult =
  | { ok: true; succeeded: number; failed: OfferingActionFailure[] }
  | { ok: false; error: string };

interface Access {
  uid: string;
  email: string | null;
  isAdmin: boolean;
  allowed: Set<string>; // academic-program ids (empty for admin = all)
}

async function resolveAccess(): Promise<Access | null> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!user || !profile) return null;
  const isAdmin = profile.roles.isAdmin === true;
  const allowed = new Set(profile.roles.directorOfAcademicPrograms ?? []);
  if (!isAdmin && allowed.size === 0) return null;
  return { uid: user.uid, email: user.email ?? null, isAdmin, allowed };
}

/** Resolve a curriculum id → its parent academic-program id (or null). */
async function academicProgramOf(
  db: FirebaseFirestore.Firestore,
  curriculumId: string,
): Promise<string | null> {
  const snap = await db.collection('programs').doc(curriculumId).get();
  if (!snap.exists) return null;
  return (snap.data()?.parentProgramId as string | undefined) ?? null;
}

function canAccess(access: Access, academicProgramId: string | null): boolean {
  if (access.isAdmin) return true;
  return !!academicProgramId && access.allowed.has(academicProgramId);
}

async function audit(
  action: string,
  uid: string,
  email: string | null,
  after: Record<string, unknown>,
) {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: uid,
    actorEmail: email,
    action,
    entityType: 'offerings',
    entityId: 'bulk',
    before: null,
    after,
  });
}

/** Load the curriculums + courses of an academic program for the dual-list,
 *  enforcing the actor's access scope. */
export async function loadCurriculumsWithCourses(
  academicProgramId: string,
): Promise<
  | { ok: true; curriculums: CurriculumWithCourses[] }
  | { ok: false; error: string }
> {
  const access = await resolveAccess();
  if (!access) return { ok: false, error: 'ไม่มีสิทธิ์ดำเนินการ' };
  if (!canAccess(access, academicProgramId)) {
    return { ok: false, error: 'ไม่มีสิทธิ์ในหลักสูตรนี้' };
  }
  const curriculums = await getCurriculumsWithCourses(academicProgramId);
  return { ok: true, curriculums };
}

/**
 * Create one offering per selected course at the given year/semester
 * (section "01", lecturer null). Courses may span multiple curriculums of
 * an academic program. Skips courses the actor can't manage, dangling
 * courses, and duplicates (same course/year/semester/section).
 */
export async function bulkCreateOfferings(
  input: BulkCreateInput,
): Promise<ManagerActionResult> {
  const access = await resolveAccess();
  if (!access) return { ok: false, error: 'ไม่มีสิทธิ์ดำเนินการ' };
  if (!input.academicYear || input.academicYear < 2500) {
    return { ok: false, error: 'ปีการศึกษาไม่ถูกต้อง (พ.ศ.)' };
  }
  if (!['1', '2', '3'].includes(input.semester)) {
    return { ok: false, error: 'ภาคการศึกษาไม่ถูกต้อง' };
  }
  if (input.courseIds.length === 0) {
    return { ok: true, succeeded: 0, failed: [] };
  }

  const db = getAdminDb();
  const failed: OfferingActionFailure[] = [];
  const createdIds: string[] = [];
  const now = FieldValue.serverTimestamp();

  for (const courseId of input.courseIds) {
    const courseSnap = await db.collection('courses').doc(courseId).get();
    if (!courseSnap.exists) {
      failed.push({ id: courseId, label: courseId, reason: 'ไม่พบรายวิชา' });
      continue;
    }
    const course = courseSnap.data() as {
      programId: string;
      code: string;
      nameTh: string;
      nameEn: string;
      isActive?: boolean;
    };
    const curriculumId = course.programId;
    const apId = await academicProgramOf(db, curriculumId);
    if (!canAccess(access, apId)) {
      failed.push({ id: courseId, label: course.code, reason: 'ไม่มีสิทธิ์ในหลักสูตรนี้' });
      continue;
    }
    if (course.isActive === false) {
      failed.push({ id: courseId, label: course.code, reason: 'รายวิชาปิดใช้งาน' });
      continue;
    }

    // Dedupe against an existing offering for this term + section.
    const dup = await db
      .collection('offerings')
      .where('courseId', '==', courseId)
      .where('academicYear', '==', input.academicYear)
      .where('semester', '==', input.semester)
      .where('section', '==', DEFAULT_SECTION)
      .limit(1)
      .get();
    if (!dup.empty) {
      failed.push({ id: courseId, label: course.code, reason: 'ซ้ำกับการเปิดสอนเดิม' });
      continue;
    }

    const ref = await db.collection('offerings').add({
      courseId,
      programId: curriculumId,
      courseCode: course.code,
      courseNameTh: course.nameTh,
      courseNameEn: course.nameEn,
      academicYear: input.academicYear,
      semester: input.semester,
      section: DEFAULT_SECTION,
      lecturerId: null,
      lecturerEmail: null,
      hasExamAssessment: true,
      assignedPloNumbers: [],
      status: 'draft' as OfferingStatus,
      previousOfferingId: null,
      latestAiReportId: null,
      assessmentId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: access.uid,
      updatedBy: access.uid,
    });
    createdIds.push(ref.id);
  }

  if (createdIds.length > 0) {
    await audit('offerings_bulk_created', access.uid, access.email, {
      offeringIds: createdIds,
      academicYear: input.academicYear,
      semester: input.semester,
    });
    revalidatePath('/admin/offering-manager');
  }
  return { ok: true, succeeded: createdIds.length, failed };
}

/**
 * Director-safe delete: removes only offerings with no data (status
 * draft / documents_pending). Offerings that hold AI/assessment data are
 * skipped and reported — they need an admin purge (purgeOffering callable).
 * Admins may use this too for the no-data subset.
 */
export async function deleteEmptyOfferings(
  offeringIds: string[],
): Promise<ManagerActionResult> {
  const access = await resolveAccess();
  if (!access) return { ok: false, error: 'ไม่มีสิทธิ์ดำเนินการ' };
  if (offeringIds.length === 0) return { ok: true, succeeded: 0, failed: [] };

  const db = getAdminDb();
  const failed: OfferingActionFailure[] = [];
  const deletedIds: string[] = [];

  for (const offeringId of offeringIds) {
    const snap = await db.collection('offerings').doc(offeringId).get();
    if (!snap.exists) {
      failed.push({ id: offeringId, label: offeringId, reason: 'ไม่พบรายการ' });
      continue;
    }
    const o = snap.data() as {
      programId: string;
      courseCode: string;
      status: OfferingStatus;
    };
    const apId = await academicProgramOf(db, o.programId);
    if (!canAccess(access, apId)) {
      failed.push({ id: offeringId, label: o.courseCode, reason: 'ไม่มีสิทธิ์' });
      continue;
    }
    if (!NO_DATA_STATUSES.includes(o.status)) {
      failed.push({
        id: offeringId,
        label: o.courseCode,
        reason: 'มีข้อมูลวิเคราะห์/ทวนสอบ — ต้องให้ผู้ดูแลระบบลบถาวร',
      });
      continue;
    }
    await snap.ref.delete();
    deletedIds.push(offeringId);
  }

  if (deletedIds.length > 0) {
    await audit('offerings_deleted_empty', access.uid, access.email, {
      offeringIds: deletedIds,
    });
    revalidatePath('/admin/offering-manager');
  }
  return { ok: true, succeeded: deletedIds.length, failed };
}
