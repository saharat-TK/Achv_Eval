/**
 * Dev utility — assign a user as the corresponding lecturer of an offering.
 *
 * Until the admin UI (Phase 3) exists, this bridges the gap so the lecturer
 * flow can be tested.
 *
 * Usage:
 *   npm run assign-lecturer -- <email> <offeringId>
 *   npm run assign-lecturer -- saharat.arr@mfu.ac.th ohs-1808102-2568-2-1
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
  const [email, offeringId] = process.argv.slice(2);
  if (!email || !offeringId) {
    console.error('Usage: npm run assign-lecturer -- <email> <offeringId>');
    process.exit(1);
  }

  const userSnap = await db
    .collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();
  if (userSnap.empty) {
    console.error(
      `No user with email ${email}. Sign in to the app once so the profile is created, then retry.`,
    );
    process.exit(1);
  }
  const userId = userSnap.docs[0].id;

  const offeringRef = db.collection('offerings').doc(offeringId);
  if (!(await offeringRef.get()).exists) {
    console.error(`No offering ${offeringId}.`);
    process.exit(1);
  }

  await offeringRef.update({
    lecturerId: userId,
    lecturerEmail: email,
    status: 'documents_pending',
    updatedAt: admin.firestore.Timestamp.now(),
    updatedBy: 'assign-lecturer-script',
  });

  console.log(`Assigned ${email} (uid ${userId}) as lecturer of ${offeringId}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
