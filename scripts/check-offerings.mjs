/**
 * One-off: check offering statuses and promote one to ai_complete for testing.
 *
 * Usage: node --env-file=.env.local scripts/check-offerings.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);

// 1. List all offerings
const offeringsSnap = await db.collection('offerings').get();
if (offeringsSnap.empty) {
  console.log('❌ No offerings found. Run the seed script first (npm run seed).');
  process.exit(1);
}

console.log(`📋 Found ${offeringsSnap.size} offering(s):\n`);
for (const doc of offeringsSnap.docs) {
  const d = doc.data();
  console.log(`  ${doc.id}`);
  console.log(`    Course: ${d.courseCode} ${d.courseNameTh}`);
  console.log(`    Program: ${d.programId}`);
  console.log(`    Status: ${d.status}`);
  console.log(`    Lecturer: ${d.lecturerEmail ?? '(none)'}`);
  console.log();
}

// 2. Promote the FIRST offering to ai_complete so the assessor can see it
const firstDoc = offeringsSnap.docs[0];
const firstData = firstDoc.data();

if (!['ai_complete', 'assessor_review', 'assessed'].includes(firstData.status)) {
  await firstDoc.ref.update({ status: 'ai_complete' });
  console.log(`✅ Updated offering "${firstDoc.id}" status from "${firstData.status}" → "ai_complete"`);
  console.log('   It should now appear in the assessor dashboard.');
} else {
  console.log(`ℹ️  First offering already has status "${firstData.status}" — no change needed.`);
}
