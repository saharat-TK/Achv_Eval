/**
 * One-off backfill — set `roles.isLecturer = true` on every user who is
 * currently assigned as the lecturer of at least one offering. Run once
 * after deploying the lecturer-role feature so existing lecturers see the
 * "รายวิชาที่รับผิดชอบ" workspace in the switcher.
 *
 * Usage:
 *   npm run backfill-lecturer-role
 *
 * Idempotent — safe to re-run.
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

async function main() {
  const offerings = await db.collection('offerings').get();
  const lecturerIds = new Set<string>();
  offerings.forEach((doc) => {
    const id = doc.data().lecturerId as string | null | undefined;
    if (id) lecturerIds.add(id);
  });

  if (lecturerIds.size === 0) {
    console.log('No assigned lecturers found — nothing to backfill.');
    return;
  }

  let updated = 0;
  for (const uid of lecturerIds) {
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) continue;
    if (snap.data()?.roles?.isLecturer === true) continue;
    await ref.update({ 'roles.isLecturer': true });
    updated++;
    console.log(`  granted isLecturer → ${snap.data()?.email ?? uid}`);
  }

  console.log(
    `Done. ${lecturerIds.size} distinct lecturers, ${updated} newly flagged.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
