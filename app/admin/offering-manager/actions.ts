'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, getAdminStorage } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import {
  getCurriculumsWithCourses,
  type CurriculumWithCourses,
} from '@/lib/data/offeringManager';
import type { OfferingStatus, Semester } from '@/lib/types/models';

const DEFAULT_SECTION = '01';
const NO_DATA_STATUSES: OfferingStatus[] = ['draft', 'documents_pending'];
const PENDING_REVERSE_TARGETS: OfferingStatus[] = ['ai_complete', 'documents_pending'];
const ASSESSED_REVERSE_TARGETS: OfferingStatus[] = [
  'pending_assessment',
  'ai_complete',
  'documents_pending',
];

export interface BulkCreateInput {
  academicYear: number;
  semester: Semester;
  courseIds: string[];
  linkToPrevious?: boolean;
}

export interface LecturerAssignmentInput {
  offeringId: string;
  lecturerRef: string | null;
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
  isSuperAdmin: boolean;
  allowed: Set<string>; // academic-program ids (empty for admin = all)
}

async function resolveAccess(): Promise<Access | null> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!user || !profile) return null;
  const isAdmin = profile.roles.isAdmin === true;
  const isSuperAdmin = profile.roles.isSuperAdmin === true;
  const allowed = new Set(profile.roles.directorOfAcademicPrograms ?? []);
  if (!isAdmin && allowed.size === 0) return null;
  return { uid: user.uid, email: user.email ?? null, isAdmin, isSuperAdmin, allowed };
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

async function academicProgramsOfCurriculums(
  db: FirebaseFirestore.Firestore,
  curriculumIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(curriculumIds.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const curriculumSnaps = await Promise.all(
    unique.map((id) => db.collection('programs').doc(id).get()),
  );
  const academicProgramIds = new Set(
    curriculumSnaps
      .map((snap) => snap.data()?.parentProgramId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const directAcademicProgramIds = unique.filter((id, index) => !curriculumSnaps[index].exists);
  const directSnaps = await Promise.all(
    directAcademicProgramIds.map((id) => db.collection('academicPrograms').doc(id).get()),
  );
  directSnaps.forEach((snap) => {
    if (snap.exists) academicProgramIds.add(snap.id);
  });

  return academicProgramIds;
}

function canAccess(access: Access, academicProgramId: string | null): boolean {
  if (access.isAdmin) return true;
  return !!academicProgramId && access.allowed.has(academicProgramId);
}

function canReversePending(access: Access, academicProgramId: string | null): boolean {
  return access.isSuperAdmin || (!!academicProgramId && access.allowed.has(academicProgramId));
}

function canReverseAssessed(access: Access): boolean {
  return access.isSuperAdmin;
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

/** Extract the storage bucket name embedded in a Firebase download URL. */
function bucketFromDownloadUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/v0\/b\/([^/]+)\/o\//);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Best-effort deletion of a generated report PDF after a status reversal —
 * the signed document is voided, so the stored object is removed to prevent
 * direct token-URL access to a now-invalid official report. Runs after the
 * Firestore transaction commits (Storage is not transactional) and never
 * throws: the reversal stands even if the file is already gone.
 */
async function deleteStoredPdf(pdf: { path: string; url: string | null }) {
  try {
    const bucketName =
      bucketFromDownloadUrl(pdf.url) ??
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
      undefined;
    if (!bucketName) return;
    await getAdminStorage()
      .bucket(bucketName)
      .file(pdf.path)
      .delete({ ignoreNotFound: true });
  } catch (err) {
    console.error('reverseOfferingStatuses: failed to delete PDF', pdf.path, err);
  }
}

async function grantLecturerRole(lecturerId: string | null | undefined) {
  if (!lecturerId) return;
  try {
    await getAdminDb()
      .collection('users')
      .doc(lecturerId)
      .update({ 'roles.isLecturer': true });
  } catch {
    // Non-fatal: validation already checked the user exists.
  }
}

function parseLecturerRef(ref: string | null): { kind: 'user' | 'allowlist'; id: string } | null {
  if (!ref) return null;
  if (ref.startsWith('user:')) return { kind: 'user', id: ref.slice('user:'.length) };
  if (ref.startsWith('allowlist:')) {
    return { kind: 'allowlist', id: ref.slice('allowlist:'.length) };
  }
  return { kind: 'user', id: ref };
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

    const offeringId = `${courseId}_${input.academicYear}_${input.semester}_${DEFAULT_SECTION}`;

    // Doc-ID check: fast path for readable-ID collision detection.
    const idSnap = await db.collection('offerings').doc(offeringId).get();
    if (idSnap.exists) {
      failed.push({ id: courseId, label: course.code, reason: 'ซ้ำกับการเปิดสอนเดิม' });
      continue;
    }

    // Dedupe where() query: catches legacy offerings that carry random IDs.
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

    // Resolve previousOfferingId: find the most recent offering of this course
    // that predates the target term. Fetches all offerings for the course and
    // sorts in memory — per-course counts are small, no composite index needed.
    let previousOfferingId: string | null = null;
    if (input.linkToPrevious) {
      const prevSnap = await db
        .collection('offerings')
        .where('courseId', '==', courseId)
        .get();
      const candidates = prevSnap.docs
        .map((d) => ({
          id: d.id,
          academicYear: d.data().academicYear as number,
          semester: d.data().semester as Semester,
        }))
        .filter(
          (o) =>
            o.academicYear < input.academicYear ||
            (o.academicYear === input.academicYear && o.semester < input.semester),
        )
        .sort(
          (a, b) =>
            b.academicYear - a.academicYear ||
            b.semester.localeCompare(a.semester),
        );
      previousOfferingId = candidates[0]?.id ?? null;
    }

    await db.collection('offerings').doc(offeringId).set({
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
      pendingLecturerEmail: null,
      pendingLecturerAllowlistId: null,
      hasExamAssessment: true,
      assignedPloNumbers: [],
      status: 'draft' as OfferingStatus,
      previousOfferingId,
      latestAiReportId: null,
      assessmentId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: access.uid,
      updatedBy: access.uid,
    });
    createdIds.push(offeringId);
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

export async function reverseOfferingStatuses(
  offeringIds: string[],
  targetStatus: OfferingStatus,
): Promise<ManagerActionResult> {
  const access = await resolveAccess();
  if (!access) return { ok: false, error: 'ไม่มีสิทธิ์ดำเนินการ' };
  if (![...PENDING_REVERSE_TARGETS, ...ASSESSED_REVERSE_TARGETS].includes(targetStatus)) {
    return { ok: false, error: 'สถานะปลายทางไม่ถูกต้อง' };
  }
  if (offeringIds.length === 0) return { ok: true, succeeded: 0, failed: [] };

  const db = getAdminDb();
  const failed: OfferingActionFailure[] = [];
  const updatedIds: string[] = [];
  const beforeStatusCounts: Partial<Record<OfferingStatus, number>> = {};
  const pdfsToDelete: { path: string; url: string | null }[] = [];
  const now = FieldValue.serverTimestamp();

  for (const offeringId of offeringIds) {
    const offeringRef = db.collection('offerings').doc(offeringId);

    try {
      const { previousStatus, pdfToDelete } = await db.runTransaction(async (tx) => {
        const snap = await tx.get(offeringRef);
        if (!snap.exists) {
          throw new Error('ไม่พบรายการ');
        }

        const offering = snap.data() as {
          programId: string;
          courseCode: string;
          status: OfferingStatus;
          assessmentId?: string | null;
          isActive?: boolean;
        };
        const programSnap = await tx.get(db.collection('programs').doc(offering.programId));
        const apId = (programSnap.data()?.parentProgramId as string | undefined) ?? null;
        if (!canAccess(access, apId)) {
          throw new Error('ไม่มีสิทธิ์ในหลักสูตรนี้');
        }
        if (offering.isActive === false) {
          throw new Error('รายวิชาปิดใช้งาน');
        }

        let pdf: { path: string; url: string | null } | null = null;

        if (offering.status === 'pending_assessment') {
          if (!PENDING_REVERSE_TARGETS.includes(targetStatus)) {
            throw new Error('สถานะปลายทางไม่รองรับรายการรอทวนสอบ');
          }
          if (!canReversePending(access, apId)) {
            throw new Error('เฉพาะผู้อำนวยการหลักสูตรหรือผู้ดูแลระบบสูงสุดเท่านั้น');
          }
        } else if (offering.status === 'assessed') {
          if (!ASSESSED_REVERSE_TARGETS.includes(targetStatus)) {
            throw new Error('สถานะปลายทางไม่รองรับรายการทวนสอบแล้ว');
          }
          if (!canReverseAssessed(access)) {
            throw new Error('เฉพาะผู้ดูแลระบบสูงสุดเท่านั้น');
          }
          if (!offering.assessmentId) {
            throw new Error('ไม่พบผลทวนสอบที่ลงนาม');
          }
          const assessmentRef = offeringRef.collection('assessments').doc(offering.assessmentId);
          const reviewRef = offeringRef.collection('followUpReview').doc('review');

          // All reads must precede writes within the transaction.
          const assessmentSnap = await tx.get(assessmentRef);
          if (!assessmentSnap.exists) {
            throw new Error('ไม่พบผลทวนสอบที่ลงนาม');
          }
          const reviewSnap = await tx.get(reviewRef);
          const assessmentData = assessmentSnap.data() as {
            signedPdfStoragePath?: string | null;
            signedPdfUrl?: string | null;
          };

          // Capture the signed combined report so it can be removed after the
          // transaction commits — the sign-off is being voided.
          if (assessmentData.signedPdfStoragePath) {
            pdf = {
              path: assessmentData.signedPdfStoragePath,
              url: assessmentData.signedPdfUrl ?? null,
            };
          }

          // Void the sign-off: unlock, drop signature, and clear the report
          // link so the page no longer advertises an invalid signed document.
          tx.update(assessmentRef, {
            isLocked: false,
            signedAt: null,
            followUpStatus: null,
            signedPdfStoragePath: null,
            signedPdfUrl: null,
            updatedAt: now,
          });

          // Unlock the follow-up review that was frozen alongside sign-off,
          // so the assessor can edit it again after re-opening the assessment.
          if (reviewSnap.exists) {
            tx.update(reviewRef, { isLocked: false, updatedAt: now });
          }
        } else {
          throw new Error('สถานะปัจจุบันไม่สามารถย้อนกลับได้');
        }

        tx.update(offeringRef, {
          status: targetStatus,
          updatedAt: now,
          updatedBy: access.uid,
        });
        return { previousStatus: offering.status, pdfToDelete: pdf };
      });

      beforeStatusCounts[previousStatus] = (beforeStatusCounts[previousStatus] ?? 0) + 1;
      if (pdfToDelete) pdfsToDelete.push(pdfToDelete);
      updatedIds.push(offeringId);
    } catch (err) {
      const snap = await offeringRef.get();
      const label = snap.exists
        ? ((snap.data()?.courseCode as string | undefined) ?? offeringId)
        : offeringId;
      failed.push({
        id: offeringId,
        label,
        reason: err instanceof Error ? err.message : 'ย้อนสถานะไม่สำเร็จ',
      });
    }
  }

  // Remove voided report PDFs after the transactions commit (best-effort).
  if (pdfsToDelete.length > 0) {
    await Promise.all(pdfsToDelete.map(deleteStoredPdf));
  }

  if (updatedIds.length > 0) {
    await audit('offering_statuses_reversed', access.uid, access.email, {
      offeringIds: updatedIds,
      targetStatus,
      beforeStatusCounts,
      deletedReportPdfs: pdfsToDelete.length,
    });
    revalidatePath('/admin/offering-manager');
    revalidatePath('/admin/dashboard');
    revalidatePath('/assessor');
    // Refresh the per-offering detail pages so their server-rendered state
    // (lock badges, signed-report links) isn't served stale from the cache.
    revalidatePath('/assessor/[offeringId]', 'page');
    revalidatePath('/lecturer/[offeringId]', 'page');
  }
  return { ok: true, succeeded: updatedIds.length, failed };
}

export async function assignOfferingLecturers(
  assignments: LecturerAssignmentInput[],
): Promise<ManagerActionResult> {
  const access = await resolveAccess();
  if (!access) return { ok: false, error: 'ไม่มีสิทธิ์ดำเนินการ' };
  if (assignments.length === 0) return { ok: true, succeeded: 0, failed: [] };

  const db = getAdminDb();
  const failed: OfferingActionFailure[] = [];
  let succeeded = 0;
  const updatedIds: string[] = [];

  for (const assignment of assignments) {
    const snap = await db.collection('offerings').doc(assignment.offeringId).get();
    if (!snap.exists) {
      failed.push({
        id: assignment.offeringId,
        label: assignment.offeringId,
        reason: 'ไม่พบรายการ',
      });
      continue;
    }
    const offering = snap.data() as {
      programId: string;
      courseCode: string;
      status: OfferingStatus;
    };
    const apId = await academicProgramOf(db, offering.programId);
    if (!canAccess(access, apId)) {
      failed.push({
        id: assignment.offeringId,
        label: offering.courseCode,
        reason: 'ไม่มีสิทธิ์ในหลักสูตรนี้',
      });
      continue;
    }

    let lecturerId: string | null = null;
    let lecturerEmail: string | null = null;
    let pendingLecturerEmail: string | null = null;
    let pendingLecturerAllowlistId: string | null = null;
    const lecturerRef = parseLecturerRef(assignment.lecturerRef);
    if (lecturerRef?.kind === 'user') {
      const userSnap = await db.collection('users').doc(lecturerRef.id).get();
      if (!userSnap.exists) {
        failed.push({
          id: assignment.offeringId,
          label: offering.courseCode,
          reason: 'ไม่พบอาจารย์ที่เลือก',
        });
        continue;
      }
      const user = userSnap.data() as {
        email?: string;
        roles?: { lecturerOf?: string[] };
      };
      const lecturerAcademicPrograms = await academicProgramsOfCurriculums(
        db,
        user.roles?.lecturerOf ?? [],
      );
      if (!apId || !lecturerAcademicPrograms.has(apId)) {
        failed.push({
          id: assignment.offeringId,
          label: offering.courseCode,
          reason: 'อาจารย์ไม่ได้อยู่ในหลักสูตรนี้',
        });
        continue;
      }
      lecturerEmail = user.email ?? null;
      lecturerId = lecturerRef.id;
    } else if (lecturerRef?.kind === 'allowlist') {
      const allowSnap = await db.collection('allowlist').doc(lecturerRef.id).get();
      if (!allowSnap.exists) {
        failed.push({
          id: assignment.offeringId,
          label: offering.courseCode,
          reason: 'ไม่พบรายชื่อรอลงทะเบียนที่เลือก',
        });
        continue;
      }
      const allow = allowSnap.data() as {
        email?: string;
        nameTh?: string;
        consumedUid?: string | null;
        presetLecturerAcademicProgramIds?: string[];
      };
      if (allow.consumedUid) {
        const consumedUserSnap = await db.collection('users').doc(allow.consumedUid).get();
        if (!consumedUserSnap.exists) {
          failed.push({
            id: assignment.offeringId,
            label: offering.courseCode,
            reason: 'บัญชีที่ลงทะเบียนแล้วไม่พบในระบบ',
          });
          continue;
        }
        const consumedUser = consumedUserSnap.data() as {
          email?: string;
          roles?: { lecturerOf?: string[] };
        };
        const lecturerAcademicPrograms = await academicProgramsOfCurriculums(
          db,
          consumedUser.roles?.lecturerOf ?? [],
        );
        if (!apId || !lecturerAcademicPrograms.has(apId)) {
          failed.push({
            id: assignment.offeringId,
            label: offering.courseCode,
            reason: 'อาจารย์ไม่ได้อยู่ในหลักสูตรนี้',
          });
          continue;
        }
        lecturerId = allow.consumedUid;
        lecturerEmail = consumedUser.email ?? allow.email ?? lecturerRef.id;
      } else {
        const pendingAcademicIds = new Set(allow.presetLecturerAcademicProgramIds ?? []);
        if (!apId || !pendingAcademicIds.has(apId)) {
          failed.push({
            id: assignment.offeringId,
            label: offering.courseCode,
            reason: 'อาจารย์รอลงทะเบียนไม่ได้อยู่ในหลักสูตรนี้',
          });
          continue;
        }
        lecturerEmail = allow.email ?? lecturerRef.id;
        pendingLecturerEmail = allow.email ?? lecturerRef.id;
        pendingLecturerAllowlistId = lecturerRef.id;
      }
    }

    const nextStatus =
      offering.status === 'draft' && lecturerRef
        ? 'documents_pending'
        : offering.status;
    await snap.ref.update({
      lecturerId,
      lecturerEmail,
      pendingLecturerEmail,
      pendingLecturerAllowlistId,
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: access.uid,
    });
    await grantLecturerRole(lecturerId);
    succeeded++;
    updatedIds.push(assignment.offeringId);
  }

  if (updatedIds.length > 0) {
    await audit('offering_lecturers_assigned', access.uid, access.email, {
      offeringIds: updatedIds,
    });
    revalidatePath('/admin/offering-manager');
  }

  return { ok: true, succeeded, failed };
}
