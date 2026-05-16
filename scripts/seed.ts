/**
 * Firestore seed — OHS (Occupational Health and Safety) undergraduate program.
 * For Phase 0–2 development and smoke testing.
 *
 * Run:  npm run seed
 * (loads .env.local via Node's --env-file flag — see package.json)
 *
 * Idempotent: uses fixed document IDs, so re-running overwrites cleanly.
 *
 * NOTE: PLOs 4 (Interpersonal) and 6 (Psychomotor) carry placeholder text;
 * verify them against the actual มคอ.2 before go-live.
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
const now = admin.firestore.Timestamp.now();

const PROGRAM_ID = 'ohs-bsc';

async function seed() {
  console.log('Seeding OHS program…');

  // ----- Program (PLOs embedded) -------------------------------------
  await db.collection('programs').doc(PROGRAM_ID).set({
    code: 'OHS-BSC',
    nameTh: 'อาชีวอนามัยและความปลอดภัย',
    nameEn: 'Occupational Health and Safety',
    school: 'Health Science',
    level: 'undergraduate',
    ploDomainSchema: '6_domain_tqf',
    isActive: true,
    plos: [
      {
        ploNumber: 1,
        domain: 'ethics',
        descriptionTh:
          'แสดงพฤติกรรมที่มีคุณธรรมและจริยธรรม จรรยาบรรณวิชาชีพ ในด้านความรับผิดชอบต่อหน้าที่ ความตรงต่อเวลา และการปฏิบัติตามกฎระเบียบของสังคม',
        descriptionEn:
          'Demonstrate ethical and moral behavior, professional code of conduct, responsibility, punctuality, and compliance with social rules',
        bloomLevel: 3,
      },
      {
        ploNumber: 2,
        domain: 'knowledge',
        descriptionTh:
          'สามารถอธิบายศาสตร์ด้านอาชีวอนามัย สุขศาสตร์อุตสาหกรรม และความปลอดภัยในการทำงาน สามารถประยุกต์ใช้องค์ความรู้ในการปฏิบัติงานตามสถานการณ์จริงได้อย่างเหมาะสม',
        descriptionEn:
          'Explain occupational health, industrial hygiene, and workplace safety sciences, and apply knowledge appropriately in real situations',
        bloomLevel: 3,
      },
      {
        ploNumber: 3,
        domain: 'intellectual',
        descriptionTh:
          'สามารถสร้างกรอบแนวคิด นวัตกรรม ออกแบบกระบวนการทำงาน/ร่วมสร้างหรือพัฒนานวัตกรรม ในการแก้ไขปัญหาหรือสนับสนุนงานด้านอาชีวอนามัยและความปลอดภัย',
        descriptionEn:
          'Create conceptual frameworks, innovations, and design work processes to solve problems or support occupational health and safety work',
        bloomLevel: 5,
      },
      {
        ploNumber: 4,
        domain: 'interpersonal',
        descriptionTh:
          '[PLACEHOLDER — verify against มคอ.2] ทำงานร่วมกับผู้อื่นในทีมสหวิชาชีพ มีภาวะผู้นำ และรับผิดชอบต่องานที่ได้รับมอบหมาย',
        descriptionEn:
          '[PLACEHOLDER — verify against TQF.2] Work collaboratively in interprofessional teams, demonstrate leadership, and take responsibility',
        bloomLevel: 3,
      },
      {
        ploNumber: 5,
        domain: 'numerical_comm_it',
        descriptionTh:
          'มีทักษะการเรียนรู้ในศตวรรษที่ 21 ด้านทักษะชีวิตและอาชีพ มีความรู้เท่าทันสื่อและเทคโนโลยีสมัยใหม่ และมีทักษะในการเลือกใช้เทคโนโลยีดิจิทัล ใช้ภาษาในการวิเคราะห์และสื่อสารข้อมูลได้อย่างมีประสิทธิภาพ',
        descriptionEn:
          '21st century learning skills: life/career skills, media and technology literacy, digital technology selection, and effective analytical communication',
        bloomLevel: 4,
      },
      {
        ploNumber: 6,
        domain: 'psychomotor',
        descriptionTh:
          '[PLACEHOLDER — verify against มคอ.2] ปฏิบัติการตรวจวัด ประเมิน และควบคุมสภาพแวดล้อมในการทำงานด้านอาชีวอนามัยและความปลอดภัยได้อย่างถูกต้องตามมาตรฐาน',
        descriptionEn:
          '[PLACEHOLDER — verify against TQF.2] Perform measurement, assessment, and control of workplace environments in occupational health and safety according to standards',
        bloomLevel: 3,
      },
    ],
    createdAt: now,
    updatedAt: now,
  });

  // ----- Courses -----------------------------------------------------
  const courses = [
    { id: 'ohs-1808102', code: '1808102', nameTh: 'การจัดการภาวะฉุกเฉินทางสารเคมี', nameEn: 'Chemical Emergency Management', creditStructure: '2(2-0-4)', credits: 2, type: 'theory', yearOfStudy: 3 },
    { id: 'ohs-1808331', code: '1808331', nameTh: 'ปัญญาประดิษฐ์สำหรับอาชีวอนามัยและความปลอดภัย', nameEn: 'AI for Occupational Health and Safety', creditStructure: '2(1-2-3)', credits: 2, type: 'theory_practice', yearOfStudy: 3 },
    { id: 'ohs-1808412', code: '1808412', nameTh: 'ระเบียบวิธีวิจัย', nameEn: 'Research Methodology', creditStructure: '2(2-0-4)', credits: 2, type: 'theory', yearOfStudy: 4 },
    { id: 'ohs-1808413', code: '1808413', nameTh: 'สัมมนา', nameEn: 'Seminar', creditStructure: '1(0-2-1)', credits: 1, type: 'practice', yearOfStudy: 4 },
    { id: 'ohs-1808205', code: '1808205', nameTh: 'เคมีอาชีวอนามัย', nameEn: 'Occupational Health Chemistry', creditStructure: '3(2-2-5)', credits: 3, type: 'theory_practice', yearOfStudy: 2 },
  ];

  for (const c of courses) {
    const { id, ...rest } = c;
    await db.collection('courses').doc(id).set({
      programId: PROGRAM_ID,
      ...rest,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // ----- Sample offering (1808102, semester 2 / 2568) ----------------
  await db.collection('offerings').doc('ohs-1808102-2568-2-1').set({
    courseId: 'ohs-1808102',
    programId: PROGRAM_ID,
    courseCode: '1808102',
    courseNameTh: 'การจัดการภาวะฉุกเฉินทางสารเคมี',
    courseNameEn: 'Chemical Emergency Management',
    academicYear: 2568,
    semester: '2',
    section: '1',
    lecturerId: null,
    lecturerEmail: null,
    hasExamAssessment: true,
    assignedPloNumbers: [1, 2, 3, 5],
    status: 'draft',
    previousOfferingId: null,
    latestAiReportId: null,
    assessmentId: null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'seed',
    updatedBy: 'seed',
  });

  console.log('Seed complete: 1 program, 6 PLOs, 5 courses, 1 offering.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
