import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { CourseDoc } from '@/lib/types/models';

export type CourseWithId = CourseDoc & { id: string };

/** Courses belonging to a program, ordered by code. */
export async function getCoursesForProgram(
  programId: string,
): Promise<CourseWithId[]> {
  const snap = await getAdminDb()
    .collection('courses')
    .where('programId', '==', programId)
    .orderBy('code')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as CourseDoc) }));
}

export async function getCourse(courseId: string): Promise<CourseWithId | null> {
  const snap = await getAdminDb().collection('courses').doc(courseId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as CourseDoc) };
}

/**
 * Count of courses per program, used by the admin programs list. Returns
 * a map keyed by programId; missing keys mean 0 courses. Uses Firestore
 * count() aggregation so it doesn't pull every course doc.
 */
export async function getCourseCountsByProgram(
  programIds: string[],
): Promise<Record<string, number>> {
  if (programIds.length === 0) return {};
  const db = getAdminDb();
  const counts = await Promise.all(
    programIds.map(async (programId) => {
      const agg = await db
        .collection('courses')
        .where('programId', '==', programId)
        .count()
        .get();
      return [programId, agg.data().count] as const;
    }),
  );
  return Object.fromEntries(counts);
}
