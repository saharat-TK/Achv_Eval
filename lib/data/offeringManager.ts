import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type {
  OfferingDoc,
  ProgramDoc,
  AcademicProgramDoc,
  AllowlistDoc,
  CourseDoc,
  Semester,
  OfferingStatus,
} from '@/lib/types/models';

/** Firestore `in` supports up to 30 values. */
function chunk<T>(arr: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface ScopeProfile {
  roles: {
    isAdmin?: boolean;
    directorOfAcademicPrograms?: string[];
  };
}

/** Academic-program ids the user may manage offerings for, plus whether the
 *  scope is "all" (admin/super) — so the page can decide query strategy. */
export async function getManagedAcademicPrograms(
  profile: ScopeProfile,
): Promise<{ all: boolean; programs: (AcademicProgramDoc & { id: string })[] }> {
  const db = getAdminDb();
  if (profile.roles.isAdmin) {
    const snap = await db.collection('academicPrograms').orderBy('code').get();
    return {
      all: true,
      programs: snap.docs.map((d) => ({ id: d.id, ...(d.data() as AcademicProgramDoc) })),
    };
  }
  const ids = profile.roles.directorOfAcademicPrograms ?? [];
  if (ids.length === 0) return { all: false, programs: [] };
  const snaps = await Promise.all(
    ids.map((id) => db.collection('academicPrograms').doc(id).get()),
  );
  return {
    all: false,
    programs: snaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, ...(s.data() as AcademicProgramDoc) }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

export interface ManagedOffering {
  id: string;
  courseId: string;
  courseCode: string;
  courseNameTh: string;
  academicYear: number;
  semester: Semester;
  section: string;
  status: OfferingStatus;
  lecturerId: string | null;
  lecturerEmail: string | null;
  pendingLecturerEmail: string | null;
  pendingLecturerAllowlistId: string | null;
  isActive: boolean;
  /** Curriculum (programs collection) this offering belongs to. */
  curriculumId: string;
  curriculumNameTh: string;
  /** Parent academic program, resolved via curriculum.parentProgramId. */
  academicProgramId: string | null;
  /** True when the offering has no aiReports/assessments/verifications,
   *  i.e. safe for a director to delete (status draft / documents_pending). */
  hasData: boolean;
}

const NO_DATA_STATUSES: OfferingStatus[] = ['draft', 'documents_pending'];

/**
 * All offerings under the given academic programs, enriched with curriculum
 * + academic-program context and a `hasData` flag. Two-hop: academicProgram →
 * curriculums (programs.parentProgramId) → offerings (offerings.programId).
 */
export async function getOfferingsForAcademicPrograms(
  academicProgramIds: string[],
): Promise<ManagedOffering[]> {
  if (academicProgramIds.length === 0) return [];
  const db = getAdminDb();

  // Curriculums under these academic programs.
  const curriculumSnaps = await Promise.all(
    chunk(academicProgramIds).map((ids) =>
      db.collection('programs').where('parentProgramId', 'in', ids).get(),
    ),
  );
  const curriculumMeta = new Map<string, { nameTh: string; academicProgramId: string | null }>();
  for (const snap of curriculumSnaps) {
    for (const d of snap.docs) {
      const data = d.data() as ProgramDoc;
      curriculumMeta.set(d.id, {
        nameTh: data.nameTh,
        academicProgramId: data.parentProgramId ?? null,
      });
    }
  }
  const curriculumIds = [...curriculumMeta.keys()];
  if (curriculumIds.length === 0) return [];

  // Offerings of those curriculums.
  const offeringSnaps = await Promise.all(
    chunk(curriculumIds).map((ids) =>
      db.collection('offerings').where('programId', 'in', ids).get(),
    ),
  );

  const offerings: ManagedOffering[] = [];
  for (const snap of offeringSnaps) {
    for (const d of snap.docs) {
      const o = d.data() as OfferingDoc;
      const meta = curriculumMeta.get(o.programId);
      offerings.push({
        id: d.id,
        courseId: o.courseId,
        courseCode: o.courseCode,
        courseNameTh: o.courseNameTh,
        academicYear: o.academicYear,
        semester: o.semester,
        section: o.section,
        status: o.status,
        lecturerId: o.lecturerId ?? null,
        lecturerEmail: o.lecturerEmail ?? null,
        pendingLecturerEmail: o.pendingLecturerEmail ?? null,
        pendingLecturerAllowlistId: o.pendingLecturerAllowlistId ?? null,
        isActive: o.isActive !== false,
        curriculumId: o.programId,
        curriculumNameTh: meta?.nameTh ?? '(ไม่พบเล่มหลักสูตร)',
        academicProgramId: meta?.academicProgramId ?? null,
        hasData: !NO_DATA_STATUSES.includes(o.status),
      });
    }
  }
  return offerings;
}

export interface ManagedLecturer {
  kind: 'user' | 'allowlist';
  id: string;
  nameTh: string;
  email: string;
  isActive: boolean;
  academicProgramIds: string[];
}

/**
 * Lecturers assigned to the given academic programs. Registered users can be
 * written directly to `lecturerId`; pending allowlist rows are written as
 * pending lecturer assignments and materialized on first sign-in.
 */
export async function getLecturersForAcademicPrograms(
  academicProgramIds: string[],
): Promise<ManagedLecturer[]> {
  if (academicProgramIds.length === 0) return [];
  const db = getAdminDb();
  const requestedAcademicProgramIds = new Set(academicProgramIds);
  const curriculumSnaps = await Promise.all(
    chunk(academicProgramIds).map((ids) =>
      db.collection('programs').where('parentProgramId', 'in', ids).get(),
    ),
  );
  const curriculumToAcademicProgram = new Map<string, string>();
  curriculumSnaps.forEach((snap) => {
    snap.docs.forEach((doc) => {
      const data = doc.data() as ProgramDoc;
      if (data.parentProgramId) curriculumToAcademicProgram.set(doc.id, data.parentProgramId);
    });
  });
  const allowedCurriculumIds = new Set(curriculumToAcademicProgram.keys());
  if (allowedCurriculumIds.size === 0) return [];

  const [usersSnap, allowlistSnap] = await Promise.all([
    db.collection('users').orderBy('email').get(),
    db.collection('allowlist').orderBy('email').get(),
  ]);
  const registeredEmails = new Set<string>();
  const registeredLecturers = usersSnap.docs.flatMap((doc): ManagedLecturer[] => {
    const data = doc.data() as {
      email?: string;
      nameTh?: string;
      isActive?: boolean;
      roles?: { lecturerOf?: string[] };
    };
    const academicIds = [
      ...new Set(
        (data.roles?.lecturerOf ?? [])
          .map((id) => curriculumToAcademicProgram.get(id) ?? id)
          .filter((id) => requestedAcademicProgramIds.has(id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (academicIds.length === 0 || !data.email) return [];
    registeredEmails.add(data.email.trim().toLowerCase());
    return [
      {
        kind: 'user',
        id: doc.id,
        nameTh: data.nameTh || data.email,
        email: data.email,
        isActive: data.isActive !== false,
        academicProgramIds: academicIds,
      },
    ];
  });

  const pendingLecturers = allowlistSnap.docs.flatMap((doc): ManagedLecturer[] => {
    const data = doc.data() as AllowlistDoc;
    if (data.consumedAt || !data.email) return [];
    if (registeredEmails.has(data.email.trim().toLowerCase())) return [];
    const academicIds = (data.presetLecturerAcademicProgramIds ?? []).filter((id) =>
      requestedAcademicProgramIds.has(id),
    );
    if (academicIds.length === 0) return [];
    return [
      {
        kind: 'allowlist',
        id: doc.id,
        nameTh: data.nameTh || data.email,
        email: data.email,
        isActive: false,
        academicProgramIds: [...new Set(academicIds)],
      },
    ];
  });

  return [...registeredLecturers, ...pendingLecturers]
    .sort((a, b) => (a.nameTh || a.email).localeCompare(b.nameTh || b.email, 'th'));
}

export interface CurriculumWithCourses {
  id: string;
  code: string;
  nameTh: string;
  courses: { id: string; code: string; nameTh: string }[];
}

/** Curriculums of an academic program, each with its (active) courses —
 *  feeds the dual-list selector in the batch-add modal. */
export async function getCurriculumsWithCourses(
  academicProgramId: string,
): Promise<CurriculumWithCourses[]> {
  const db = getAdminDb();
  const curriculumsSnap = await db
    .collection('programs')
    .where('parentProgramId', '==', academicProgramId)
    .get();
  const curriculums = curriculumsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as ProgramDoc) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return Promise.all(
    curriculums.map(async (c) => {
      const coursesSnap = await db
        .collection('courses')
        .where('programId', '==', c.id)
        .get();
      const courses = coursesSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as CourseDoc) }))
        .filter((co) => co.isActive !== false)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((co) => ({ id: co.id, code: co.code, nameTh: co.nameTh }));
      return { id: c.id, code: c.code, nameTh: c.nameTh, courses };
    }),
  );
}
