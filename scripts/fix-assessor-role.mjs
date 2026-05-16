/**
 * Fix: ensure assessorOf contains the exact lowercase program ID.
 *
 * Usage: node --env-file=.env.local scripts/fix-assessor-role.mjs
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

const usersSnap = await db.collection('users').where('email', '==', 'saharat.arr@mfu.ac.th').get();
const userDoc = usersSnap.docs[0];

console.log('Before:', JSON.stringify(userDoc.data().roles));

// Set the exact correct program ID (lowercase, matching the offerings collection)
await userDoc.ref.update({
  'roles.assessorOf': ['ohs-bsc'],
});

const updated = (await userDoc.ref.get()).data();
console.log('After:', JSON.stringify(updated.roles));
console.log('\n✅ Fixed. Sign out and sign back in.');
