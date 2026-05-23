import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { AcademicProgramDoc } from '@/lib/types/models';

export type AcademicProgramWithId = AcademicProgramDoc & { id: string };

/** All academic programs (หลักสูตร), ordered by code. */
export async function getAllAcademicPrograms(): Promise<AcademicProgramWithId[]> {
  const snap = await getAdminDb()
    .collection('academicPrograms')
    .orderBy('code')
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as AcademicProgramDoc),
  }));
}

export async function getAcademicProgram(
  id: string,
): Promise<AcademicProgramWithId | null> {
  const snap = await getAdminDb().collection('academicPrograms').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as AcademicProgramDoc) };
}

/** Resolve a set of academic-program ids to a `{ [id]: doc }` map. */
export async function getAcademicProgramMap(
  ids: string[],
): Promise<Record<string, AcademicProgramWithId>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return {};
  const db = getAdminDb();
  const snaps = await Promise.all(
    unique.map((id) => db.collection('academicPrograms').doc(id).get()),
  );
  const map: Record<string, AcademicProgramWithId> = {};
  snaps.forEach((s) => {
    if (s.exists) map[s.id] = { id: s.id, ...(s.data() as AcademicProgramDoc) };
  });
  return map;
}

/** Count of curriculum revisions per academic program. */
export async function getCurriculumCountsByProgram(
  programIds: string[],
): Promise<Record<string, number>> {
  if (programIds.length === 0) return {};
  const db = getAdminDb();
  const counts = await Promise.all(
    programIds.map(async (id) => {
      const agg = await db
        .collection('programs')
        .where('parentProgramId', '==', id)
        .count()
        .get();
      return [id, agg.data().count] as const;
    }),
  );
  return Object.fromEntries(counts);
}
