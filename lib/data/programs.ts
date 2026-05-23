import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { ProgramDoc } from '@/lib/types/models';

export type ProgramWithId = ProgramDoc & { id: string };

/** All programs, ordered by code. For admins. */
export async function getAllPrograms(): Promise<ProgramWithId[]> {
  const snap = await getAdminDb().collection('programs').orderBy('code').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ProgramDoc) }));
}

/** Specific programs by id. For directors (their assigned programs). */
export async function getProgramsByIds(ids: string[]): Promise<ProgramWithId[]> {
  if (ids.length === 0) return [];
  const db = getAdminDb();
  const snaps = await db.getAll(
    ...ids.map((id) => db.collection('programs').doc(id)),
  );
  return snaps
    .filter((s) => s.exists)
    .map((s) => ({ id: s.id, ...(s.data() as ProgramDoc) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function getProgram(id: string): Promise<ProgramWithId | null> {
  const snap = await getAdminDb().collection('programs').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as ProgramDoc) };
}

/** Curriculum revisions belonging to a parent academic program. */
export async function getCurriculumsForProgram(
  parentProgramId: string,
): Promise<ProgramWithId[]> {
  const snap = await getAdminDb()
    .collection('programs')
    .where('parentProgramId', '==', parentProgramId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as ProgramDoc) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
