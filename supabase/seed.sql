-- =====================================================================
-- Seed data: OHS (Occupational Health and Safety) undergraduate program
-- Used for Phase 0–2 development and smoke testing.
--
-- NOTE: PLO descriptions for domains 1, 2, 3, 5 are taken from the
-- example TQF3 of course 1808102. PLOs 4 (Interpersonal) and 6 (Psychomotor)
-- are placeholders that must be confirmed against the actual มคอ.2
-- before the system goes live.
-- =====================================================================

-- ----- Program -------------------------------------------------------
insert into programs (id, code, name_th, name_en, school, level, plo_domain_schema)
values (
  '00000000-0000-0000-0000-000000000001',
  'OHS-BSC',
  'อาชีวอนามัยและความปลอดภัย',
  'Occupational Health and Safety',
  'Health Science',
  'undergraduate',
  '6_domain_tqf'
) on conflict (code) do nothing;

-- ----- PLOs (6 TQF domains) ------------------------------------------
insert into program_plos (program_id, plo_number, domain, description_th, description_en, bloom_level, display_order) values
  ('00000000-0000-0000-0000-000000000001', 1, 'ethics',
   'แสดงพฤติกรรมที่มีคุณธรรมและจริยธรรม จรรยาบรรณวิชาชีพ ในด้านความรับผิดชอบต่อหน้าที่ ความตรงต่อเวลา และการปฏิบัติตามกฎระเบียบของสังคม',
   'Demonstrate ethical and moral behavior, professional code of conduct, responsibility, punctuality, and compliance with social rules',
   3, 1),

  ('00000000-0000-0000-0000-000000000001', 2, 'knowledge',
   'สามารถอธิบายศาสตร์ด้านอาชีวอนามัย สุขศาสตร์อุตสาหกรรม และความปลอดภัยในการทำงาน สามารถประยุกต์ใช้องค์ความรู้ในการปฏิบัติงานตามสถานการณ์จริงได้อย่างเหมาะสม',
   'Explain occupational health, industrial hygiene, and workplace safety sciences, and apply knowledge appropriately in real situations',
   3, 2),

  ('00000000-0000-0000-0000-000000000001', 3, 'intellectual',
   'สามารถสร้างกรอบแนวคิด นวัตกรรม ออกแบบกระบวนการทำงาน/ร่วมสร้างหรือพัฒนานวัตกรรม ในการแก้ไขปัญหาหรือสนับสนุนงานด้านอาชีวอนามัยและความปลอดภัย โดยการบูรณาการองค์ความรู้ที่ทันสมัย และมีฐานกระบวนการคิดการเป็นผู้ประกอบการ',
   'Create conceptual frameworks, innovations, and design work processes to solve problems or support occupational health and safety work',
   5, 3),

  ('00000000-0000-0000-0000-000000000001', 4, 'interpersonal',
   '[PLACEHOLDER — verify against มคอ.2] ทำงานร่วมกับผู้อื่นในทีมสหวิชาชีพ มีภาวะผู้นำ และรับผิดชอบต่องานที่ได้รับมอบหมาย',
   '[PLACEHOLDER — verify against TQF.2] Work collaboratively in interprofessional teams, demonstrate leadership, and take responsibility',
   3, 4),

  ('00000000-0000-0000-0000-000000000001', 5, 'numerical_comm_it',
   'มีทักษะการเรียนรู้ในศตวรรษที่ 21 ด้านทักษะชีวิตและอาชีพ มีความรู้เท่าทันสื่อและเทคโนโลยีสมัยใหม่ และมีทักษะในการเลือกใช้เทคโนโลยีดิจิทัล ใช้ภาษาในการวิเคราะห์และสื่อสารข้อมูลได้อย่างมีประสิทธิภาพ',
   '21st century learning skills: life/career skills, media and modern technology literacy, digital technology selection, and effective analytical communication',
   4, 5),

  ('00000000-0000-0000-0000-000000000001', 6, 'psychomotor',
   '[PLACEHOLDER — verify against มคอ.2] ปฏิบัติการตรวจวัด ประเมิน และควบคุมสภาพแวดล้อมในการทำงานด้านอาชีวอนามัยและความปลอดภัยได้อย่างถูกต้องตามมาตรฐาน',
   '[PLACEHOLDER — verify against TQF.2] Perform measurement, assessment, and control of workplace environments in occupational health and safety according to standards',
   3, 6)
on conflict (program_id, plo_number) do nothing;

-- ----- Sample courses (from the OHS folder structure) ----------------
insert into courses (id, program_id, code, name_th, name_en, credit_structure, credits, type, year_of_study) values
  ('00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-000000000001',
   '1808102', 'การจัดการภาวะฉุกเฉินทางสารเคมี', 'Chemical Emergency Management',
   '2(2-0-4)', 2.0, 'theory', 3),

  ('00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-000000000001',
   '1808331', 'ปัญญาประดิษฐ์สำหรับอาชีวอนามัยและความปลอดภัย', 'AI for Occupational Health and Safety',
   '2(1-2-3)', 2.0, 'theory_practice', 3),

  ('00000000-0000-0000-0000-0000000000c3',
   '00000000-0000-0000-0000-000000000001',
   '1808412', 'ระเบียบวิธีวิจัย', 'Research Methodology',
   '2(2-0-4)', 2.0, 'theory', 4),

  ('00000000-0000-0000-0000-0000000000c4',
   '00000000-0000-0000-0000-000000000001',
   '1808413', 'สัมมนา', 'Seminar',
   '1(0-2-1)', 1.0, 'practice', 4),

  ('00000000-0000-0000-0000-0000000000c5',
   '00000000-0000-0000-0000-000000000001',
   '1808205', 'เคมีอาชีวอนามัย', 'Occupational Health Chemistry',
   '3(2-2-5)', 3.0, 'theory_practice', 2)
on conflict (program_id, code) do nothing;

-- ----- Sample offering (Chemical Emergency Management, 2/2568) -------
-- lecturer_id is intentionally null until a real profile is created by Google SSO sign-in.
insert into course_offerings (
  id, course_id, academic_year, semester, section, has_exam_assessment, status
) values (
  '00000000-0000-0000-0000-00000000000f',
  '00000000-0000-0000-0000-0000000000c1',
  2568, '2', '1', true, 'draft'
) on conflict (course_id, academic_year, semester, section) do nothing;
