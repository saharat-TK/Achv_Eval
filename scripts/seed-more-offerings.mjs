/**
 * One-off script: create more mock offerings in Firestore.
 *
 * Usage: node --env-file=.env.local scripts/seed-more-offerings.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);
const now = Timestamp.now();
const PROGRAM_ID = 'ohs-bsc';

async function seed() {
  const offeringsRef = db.collection('offerings');

  const newOfferings = [
    {
      id: 'ohs-1808331-2568-2-1',
      courseId: 'ohs-1808331',
      programId: PROGRAM_ID,
      courseCode: '1808331',
      courseNameTh: 'ปัญญาประดิษฐ์สำหรับอาชีวอนามัยและความปลอดภัย',
      courseNameEn: 'AI for Occupational Health and Safety',
      academicYear: 2568,
      semester: '2',
      section: '1',
      lecturerId: 'QoyT2Oc20zSNWX69kfbqGqHVrNv2', // saharat.arr@mfu.ac.th
      lecturerEmail: 'saharat.arr@mfu.ac.th',
      hasExamAssessment: true,
      assignedPloNumbers: [2, 3, 5],
      status: 'assessor_review',
      previousOfferingId: null,
      latestAiReportId: 'mock-report-1',
      assessmentId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: 'seed',
      updatedBy: 'seed',
    },
    {
      id: 'ohs-1808412-2568-1-1',
      courseId: 'ohs-1808412',
      programId: PROGRAM_ID,
      courseCode: '1808412',
      courseNameTh: 'ระเบียบวิธีวิจัย',
      courseNameEn: 'Research Methodology',
      academicYear: 2568,
      semester: '1',
      section: '1',
      lecturerId: 'QoyT2Oc20zSNWX69kfbqGqHVrNv2', // saharat.arr@mfu.ac.th
      lecturerEmail: 'saharat.arr@mfu.ac.th',
      hasExamAssessment: true,
      assignedPloNumbers: [1, 2, 3, 5],
      status: 'assessed',
      previousOfferingId: null,
      latestAiReportId: 'mock-report-2',
      assessmentId: 'mock-assessment-1',
      createdAt: now,
      updatedAt: now,
      createdBy: 'seed',
      updatedBy: 'seed',
    },
    {
      id: 'ohs-1808205-2567-3-1',
      courseId: 'ohs-1808205',
      programId: PROGRAM_ID,
      courseCode: '1808205',
      courseNameTh: 'เคมีอาชีวอนามัย',
      courseNameEn: 'Occupational Health Chemistry',
      academicYear: 2567,
      semester: '3',
      section: '1',
      lecturerId: null,
      lecturerEmail: null,
      hasExamAssessment: false,
      assignedPloNumbers: [2, 6],
      status: 'ai_complete',
      previousOfferingId: null,
      latestAiReportId: 'mock-report-3',
      assessmentId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: 'seed',
      updatedBy: 'seed',
    }
  ];

  for (const offering of newOfferings) {
    const { id, ...data } = offering;
    await offeringsRef.doc(id).set(data);
    console.log(`✅ Created offering: ${id} (${data.courseNameTh}) -> status: ${data.status}`);
  }

  console.log('\nDone creating mock offerings!');
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
