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
