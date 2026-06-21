/**
 * Backfill read-only viewer access for external assessment-committee members.
 *
 * The `assessorViewerOf` scope (added 2026-06) is granted when a committee is
 * saved, so external assessors placed before that change have no access yet.
 * This walks every `academicPrograms/{id}.assessmentCommittee`, collects the
 * external assessors that resolve to a real user (`uid`) or a pending allowlist
 * entry, and grants them the viewer scope — exactly as `saveAssessmentCommittee`
 * would. Anyone who is also an internal role (head / internal / secretary) is
 * skipped, because their full `assessorOf` access already covers reads.
 *
 * Idempotent: re-running unions the same ids, so nothing is duplicated. Writes
 * never touch `assessorOf`, so it cannot grant write access.
 *
 * Usage:
 *   npm run backfill-external-assessor-viewer            # dry run (no writes)
 *   npm run backfill-external-assessor-viewer -- --commit
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
const COMMIT = process.argv.includes('--commit');

interface Member {
  name?: string;
  uid?: string;
  allowlistId?: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function main() {
  // academic program id -> curriculum revision ids (offerings.programId space).
  const programsSnap = await db.collection('programs').get();
  const academicToCurriculums = new Map<string, string[]>();
  for (const doc of programsSnap.docs) {
    const parentProgramId = doc.data().parentProgramId;
    if (typeof parentProgramId !== 'string' || !parentProgramId) continue;
    const list = academicToCurriculums.get(parentProgramId) ?? [];
    list.push(doc.id);
    academicToCurriculums.set(parentProgramId, list);
  }

  // Accumulate grants per identity across all programs before writing once each.
  const userGrants = new Map<string, { academic: Set<string>; curriculum: Set<string> }>();
  const allowGrants = new Map<string, Set<string>>();

  const apSnap = await db.collection('academicPrograms').get();
  let committeesWithExternals = 0;

  for (const doc of apSnap.docs) {
    const c = doc.data().assessmentCommittee as
      | {
          headAssessor?: Member | null;
          internalAssessors?: Member[];
          secretary?: Member | null;
          externalAssessors?: Member[];
        }
      | undefined
      | null;
    if (!c) continue;

    const externals = c.externalAssessors ?? [];
    if (externals.length === 0) continue;

    // Internal identities are excluded — their full access already covers reads.
    const internalUids = new Set<string>();
    const internalAllow = new Set<string>();
    for (const m of [c.headAssessor, ...(c.internalAssessors ?? []), c.secretary]) {
      if (!m) continue;
      if (m.uid) internalUids.add(m.uid);
      else if (m.allowlistId) internalAllow.add(m.allowlistId);
    }

    const apId = doc.id;
    const curriculumIds = academicToCurriculums.get(apId) ?? [];
    let touched = false;

    for (const m of externals) {
      if (m.uid && !internalUids.has(m.uid)) {
        const g = userGrants.get(m.uid) ?? {
          academic: new Set<string>(),
          curriculum: new Set<string>(),
        };
        g.academic.add(apId);
        curriculumIds.forEach((id) => g.curriculum.add(id));
        userGrants.set(m.uid, g);
        touched = true;
      } else if (m.allowlistId && !internalAllow.has(m.allowlistId)) {
        const s = allowGrants.get(m.allowlistId) ?? new Set<string>();
        s.add(apId);
        allowGrants.set(m.allowlistId, s);
        touched = true;
      }
    }
    if (touched) committeesWithExternals++;
  }

  let batch = db.batch();
  let writes = 0;
  let userChanges = 0;
  let allowChanges = 0;

  const flush = async () => {
    if (!COMMIT || writes === 0) return;
    await batch.commit();
    batch = db.batch();
    writes = 0;
  };

  // Users with an account — union the viewer scope arrays.
  for (const [uid, g] of userGrants) {
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`  ! user ${uid} not found — skipping`);
      continue;
    }
    const roles = snap.data()?.roles ?? {};
    const nextAcademic = unique([
      ...(roles.assessorViewerOfAcademicPrograms ?? []),
      ...g.academic,
    ]);
    const nextCurriculum = unique([
      ...(roles.assessorViewerOf ?? []),
      ...g.curriculum,
    ]);
    console.log(
      `  user ${uid}: +${g.academic.size} program(s), viewer curricula -> ${nextCurriculum.length}`,
    );
    if (COMMIT) {
      batch.update(ref, {
        'roles.assessorViewerOfAcademicPrograms': nextAcademic,
        'roles.assessorViewerOf': nextCurriculum,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      writes++;
      if (writes === 450) await flush();
    }
    userChanges++;
  }

  // Pending allowlist entries — union the preset that expands on first sign-in.
  for (const [allowId, programs] of allowGrants) {
    const ref = db.collection('allowlist').doc(allowId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`  ! allowlist ${allowId} not found — skipping`);
      continue;
    }
    const next = unique([
      ...(snap.data()?.presetAssessorViewerAcademicProgramIds ?? []),
      ...programs,
    ]);
    console.log(`  allowlist ${allowId}: preset programs -> ${next.length}`);
    if (COMMIT) {
      batch.update(ref, { presetAssessorViewerAcademicProgramIds: next });
      writes++;
      if (writes === 450) await flush();
    }
    allowChanges++;
  }

  await flush();

  console.log(
    `\n${COMMIT ? 'Committed' : 'DRY RUN — no writes made.'} ` +
      `Committees with externals: ${committeesWithExternals}. ` +
      `Users granted: ${userChanges}. Allowlist presets set: ${allowChanges}.`,
  );
  if (!COMMIT) console.log('Re-run with `-- --commit` to apply.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
