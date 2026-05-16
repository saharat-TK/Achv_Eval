/**
 * One-off script: Add assessor role to saharat.arr@mfu.ac.th
 *
 * Usage: node --env-file=.env.local scripts/add-assessor.mjs
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

// 1. Find the user by email
const usersSnap = await db.collection('users').where('email', '==', 'saharat.arr@mfu.ac.th').get();
if (usersSnap.empty) {
  console.error('❌ No user found with email saharat.arr@mfu.ac.th');
  process.exit(1);
}
const userDoc = usersSnap.docs[0];
console.log(`✅ Found user: ${userDoc.id} (${userDoc.data().email})`);
console.log('   Current roles:', JSON.stringify(userDoc.data().roles));

// 2. Find all programs
const programsSnap = await db.collection('programs').get();
if (programsSnap.empty) {
  console.error('❌ No programs found in Firestore. Run the seed script first.');
  process.exit(1);
}
console.log('\n📋 Available programs:');
programsSnap.docs.forEach((d) => {
  const p = d.data();
  console.log(`   ${d.id} — ${p.code} ${p.nameTh}`);
});

// 3. Add ALL program IDs to assessorOf
const programIds = programsSnap.docs.map((d) => d.id);
const currentRoles = userDoc.data().roles || {};
const currentAssessorOf = currentRoles.assessorOf || [];
const merged = [...new Set([...currentAssessorOf, ...programIds])];

await userDoc.ref.update({
  'roles.assessorOf': merged,
});

console.log(`\n✅ Updated roles.assessorOf to: [${merged.join(', ')}]`);
console.log('   Sign out and sign back in to pick up the change.');
