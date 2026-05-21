import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { DepartmentDoc } from '@/lib/types/models';

export type DepartmentWithId = DepartmentDoc & { id: string };

/** All departments ordered by Thai name. */
export async function getAllDepartments(): Promise<DepartmentWithId[]> {
  const snap = await getAdminDb()
    .collection('departments')
    .orderBy('nameTh')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as DepartmentDoc) }));
}

export async function getDepartment(
  deptId: string,
): Promise<DepartmentWithId | null> {
  const snap = await getAdminDb().collection('departments').doc(deptId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as DepartmentDoc) };
}

/**
 * Fetch a set of departments as a `{ [id]: DepartmentWithId }` map.
 * Convenience for list views that need to resolve department names
 * for many programs in a single pass.
 */
export async function getDepartmentMap(
  deptIds: string[],
): Promise<Record<string, DepartmentWithId>> {
  const unique = Array.from(new Set(deptIds)).filter(Boolean);
  if (unique.length === 0) return {};
  const db = getAdminDb();
  const snaps = await Promise.all(
    unique.map((id) => db.collection('departments').doc(id).get()),
  );
  const map: Record<string, DepartmentWithId> = {};
  snaps.forEach((s) => {
    if (s.exists) {
      map[s.id] = { id: s.id, ...(s.data() as DepartmentDoc) };
    }
  });
  return map;
}

/** Count programs per department — drives the list view & the
 *  hard-delete blocker check. */
export async function getProgramCountsByDepartment(
  deptIds: string[],
): Promise<Record<string, number>> {
  if (deptIds.length === 0) return {};
  const db = getAdminDb();
  const counts = await Promise.all(
    deptIds.map(async (id) => {
      const agg = await db
        .collection('programs')
        .where('departmentId', '==', id)
        .count()
        .get();
      return [id, agg.data().count] as const;
    }),
  );
  return Object.fromEntries(counts);
}
