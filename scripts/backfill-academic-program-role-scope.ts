/**
 * Backfill role assignments from curriculum ids to academic-program ids.
 *
 * For each user, this reads legacy role arrays (`directorOf`, `assessorOf`,
 * `verifierOf`), maps curriculum ids through `programs/{id}.parentProgramId`,
 * writes the new academic-program arrays, and refreshes the legacy arrays as
 * compatibility mirrors for all current curriculum revisions under each
 * selected academic program.
 *
 * Usage:
 *   npm run backfill-academic-role-scope
 */
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function main() {
  const programsSnap = await db.collection('programs').get();
  const curriculumToAcademic = new Map<string, string>();
  const academicToCurriculums = new Map<string, string[]>();

  for (const doc of programsSnap.docs) {
    const parentProgramId = doc.data().parentProgramId;
    if (typeof parentProgramId !== 'string' || !parentProgramId) continue;
    curriculumToAcademic.set(doc.id, parentProgramId);
    const curriculums = academicToCurriculums.get(parentProgramId) ?? [];
    curriculums.push(doc.id);
    academicToCurriculums.set(parentProgramId, curriculums);
  }

  function academicIdsForRole(existingAcademic: string[], legacy: string[]) {
    return unique([
      ...existingAcademic,
      ...legacy
        .map((curriculumId) => curriculumToAcademic.get(curriculumId))
        .filter((id): id is string => Boolean(id)),
    ]);
  }

  function legacyMirror(academicIds: string[], existingLegacy: string[]) {
    const orphanLegacy = existingLegacy.filter(
      (curriculumId) => !curriculumToAcademic.has(curriculumId),
    );
    return unique([
      ...orphanLegacy,
      ...academicIds.flatMap((id) => academicToCurriculums.get(id) ?? []),
    ]);
  }

  const usersSnap = await db.collection('users').get();
  let changed = 0;
  let batch = db.batch();
  let batchWrites = 0;

  for (const doc of usersSnap.docs) {
    const roles = doc.data().roles ?? {};
    const directorAcademic = academicIdsForRole(
      roles.directorOfAcademicPrograms ?? [],
      roles.directorOf ?? [],
    );
    const assessorAcademic = academicIdsForRole(
      roles.assessorOfAcademicPrograms ?? [],
      roles.assessorOf ?? [],
    );
    const verifierAcademic = academicIdsForRole(
      roles.verifierOfAcademicPrograms ?? [],
      roles.verifierOf ?? [],
    );

    batch.update(doc.ref, {
      'roles.directorOfAcademicPrograms': directorAcademic,
      'roles.assessorOfAcademicPrograms': assessorAcademic,
      'roles.verifierOfAcademicPrograms': verifierAcademic,
      'roles.directorOf': legacyMirror(directorAcademic, roles.directorOf ?? []),
      'roles.assessorOf': legacyMirror(assessorAcademic, roles.assessorOf ?? []),
      'roles.verifierOf': legacyMirror(verifierAcademic, roles.verifierOf ?? []),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    changed++;
    batchWrites++;
    if (batchWrites === 450) {
      await batch.commit();
      batch = db.batch();
      batchWrites = 0;
    }
  }

  if (batchWrites > 0) await batch.commit();
  console.log(`Backfilled academic-program role scope for ${changed} users.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
