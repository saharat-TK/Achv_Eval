/**
 * Dev utility — grant a role to a user. Bridges the gap until the Phase 3
 * admin UI exists.
 *
 * Usage:
 *   npm run assign-role -- <email> superadmin
 *   npm run assign-role -- <email> admin
 *   npm run assign-role -- <email> assessor <academicProgramId>
 *   npm run assign-role -- <email> director <academicProgramId>
 *
 * Example:
 *   npm run assign-role -- saharat.arr@mfu.ac.th superadmin
 *   npm run assign-role -- saharat.arr@mfu.ac.th assessor ohs-bsc-program
 *
 * Note: "superadmin" is the bootstrap for the first super admin (the only
 * role that can manage other admins). After that, super admins promote
 * each other from the /admin/users UI.
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
  const [email, role, academicProgramId] = process.argv.slice(2);
  if (!email || !role) {
    console.error(
      'Usage: npm run assign-role -- <email> <superadmin|admin|assessor|director> [academicProgramId]',
    );
    process.exit(1);
  }
  if ((role === 'assessor' || role === 'director') && !academicProgramId) {
    console.error(`Role "${role}" requires an academicProgramId.`);
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
  let curriculumIds: string[] = [];
  if (role === 'assessor' || role === 'director') {
    const academicProgram = await db
      .collection('academicPrograms')
      .doc(academicProgramId)
      .get();
    if (!academicProgram.exists) {
      console.error(`No academic program with id ${academicProgramId}.`);
      process.exit(1);
    }
    const curriculums = await db
      .collection('programs')
      .where('parentProgramId', '==', academicProgramId)
      .get();
    curriculumIds = curriculums.docs.map((doc) => doc.id);
  }

  if (role === 'superadmin') {
    // Super admin is a strict superset of admin — set both.
    await userRef.update({
      'roles.isSuperAdmin': true,
      'roles.isAdmin': true,
    });
  } else if (role === 'admin') {
    await userRef.update({ 'roles.isAdmin': true });
  } else if (role === 'assessor') {
    const update: Record<string, unknown> = {
      'roles.assessorOfAcademicPrograms':
        admin.firestore.FieldValue.arrayUnion(academicProgramId),
    };
    if (curriculumIds.length > 0) {
      update['roles.assessorOf'] =
        admin.firestore.FieldValue.arrayUnion(...curriculumIds);
    }
    await userRef.update(update);
  } else if (role === 'director') {
    const update: Record<string, unknown> = {
      'roles.directorOfAcademicPrograms':
        admin.firestore.FieldValue.arrayUnion(academicProgramId),
    };
    if (curriculumIds.length > 0) {
      update['roles.directorOf'] =
        admin.firestore.FieldValue.arrayUnion(...curriculumIds);
    }
    await userRef.update(update);
  } else {
    console.error(
      `Unknown role "${role}". Use superadmin, admin, assessor, or director.`,
    );
    process.exit(1);
  }

  console.log(
    `Granted "${role}"${
      academicProgramId ? ` (${academicProgramId})` : ''
    } to ${email}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
