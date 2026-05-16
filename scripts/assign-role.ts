/**
 * Dev utility — grant a role to a user. Bridges the gap until the Phase 3
 * admin UI exists.
 *
 * Usage:
 *   npm run assign-role -- <email> admin
 *   npm run assign-role -- <email> assessor <programId>
 *   npm run assign-role -- <email> director <programId>
 *
 * Example:
 *   npm run assign-role -- saharat.arr@mfu.ac.th assessor ohs-bsc
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
  const [email, role, programId] = process.argv.slice(2);
  if (!email || !role) {
    console.error(
      'Usage: npm run assign-role -- <email> <admin|assessor|director> [programId]',
    );
    process.exit(1);
  }
  if ((role === 'assessor' || role === 'director') && !programId) {
    console.error(`Role "${role}" requires a programId.`);
    process.exit(1);
  }

  const userSnap = await db
    .collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();
  if (userSnap.empty) {
    console.error(`No user with email ${email}. Sign in once, then retry.`);
    process.exit(1);
  }
  const userRef = userSnap.docs[0].ref;

  if (role === 'admin') {
    await userRef.update({ 'roles.isAdmin': true });
  } else if (role === 'assessor') {
    await userRef.update({
      'roles.assessorOf': admin.firestore.FieldValue.arrayUnion(programId),
    });
  } else if (role === 'director') {
    await userRef.update({
      'roles.directorOf': admin.firestore.FieldValue.arrayUnion(programId),
    });
  } else {
    console.error(`Unknown role "${role}". Use admin, assessor, or director.`);
    process.exit(1);
  }

  console.log(
    `Granted "${role}"${programId ? ` (${programId})` : ''} to ${email}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
