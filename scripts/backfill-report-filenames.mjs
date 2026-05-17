/**
 * One-off: set a Content-Disposition header on report PDFs generated before
 * the readable-filename change, so browsers download them as
 * ai-report_<tag>_<id>.pdf / combined-report_<tag>_<id>.pdf instead of the
 * opaque Storage object path.
 *
 * Safe to re-run — it only patches contentDisposition and leaves the download
 * token metadata untouched.
 *
 * Usage: node --env-file=.env.local scripts/backfill-report-filenames.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
  storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`,
});

const db = getFirestore(app);
const bucket = getStorage(app).bucket();

function slug(value) {
  return (
    String(value)
      .trim()
      .replace(/[^A-Za-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'na'
  );
}

function reportFileName(prefix, p, id) {
  const tag = [p.programCode, p.courseCode, p.academicYear, p.semester, p.section]
    .map((v) => slug(v).toLowerCase())
    .join('-');
  return `${slug(prefix).toLowerCase()}_${tag}_${slug(id)}.pdf`;
}

async function setDisposition(path, downloadName) {
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    console.log(`  ⚠️  missing object, skipped: ${path}`);
    return false;
  }
  await file.setMetadata({
    contentDisposition: `attachment; filename="${downloadName}"`,
  });
  console.log(`  ✅ ${path} → ${downloadName}`);
  return true;
}

const programCodes = new Map();
for (const doc of (await db.collection('programs').get()).docs) {
  programCodes.set(doc.id, doc.data().code ?? doc.id);
}

let patched = 0;
for (const offeringDoc of (await db.collection('offerings').get()).docs) {
  const o = offeringDoc.data();
  const parts = {
    programCode: programCodes.get(o.programId) ?? o.programId,
    courseCode: o.courseCode,
    academicYear: o.academicYear,
    semester: o.semester,
    section: o.section,
  };

  for (const r of (await offeringDoc.ref.collection('aiReports').get()).docs) {
    const path = r.data().reportStoragePath;
    if (path && (await setDisposition(path, reportFileName('ai-report', parts, r.id)))) {
      patched++;
    }
  }

  for (const a of (await offeringDoc.ref.collection('assessments').get()).docs) {
    const path = a.data().signedPdfStoragePath;
    if (path && (await setDisposition(path, reportFileName('combined-report', parts, a.id)))) {
      patched++;
    }
  }
}

console.log(`\nDone. Patched ${patched} PDF object(s).`);
process.exit(0);
