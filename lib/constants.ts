import type {
  OfferingStatus,
  UploadType,
  Semester,
  AiReportStatus,
  ProgramLevel,
  PloSchema,
  PloDomain,
  CourseType,
  ImplementationDecision,
  VerificationDecision,
} from '@/lib/types/models';

/**
 * Offering lifecycle status — Thai label + a Tailwind colour token group
 * for badges. Order roughly follows the workflow.
 */
export const OFFERING_STATUS: Record<
  OfferingStatus,
  { labelTh: string; tone: 'slate' | 'amber' | 'blue' | 'violet' | 'green' | 'red' }
> = {
  draft: { labelTh: 'ร่าง', tone: 'slate' },
  documents_pending: { labelTh: 'รอเอกสาร', tone: 'amber' },
  ready_for_ai: { labelTh: 'พร้อมวิเคราะห์', tone: 'blue' },
  ai_in_progress: { labelTh: 'กำลังวิเคราะห์', tone: 'blue' },
  ai_complete: { labelTh: 'วิเคราะห์เสร็จ', tone: 'violet' },
  assessor_review: { labelTh: 'รอผู้ทวนสอบ', tone: 'violet' },
  assessed: { labelTh: 'ทวนสอบแล้ว', tone: 'green' },
  verification_review: { labelTh: 'รอคณะกรรมการ', tone: 'violet' },
  verified: { labelTh: 'รับรองผลแล้ว', tone: 'green' },
  needs_follow_up: { labelTh: 'ต้องติดตาม', tone: 'amber' },
  pending_review_next_semester: { labelTh: 'รอติดตามภาคหน้า', tone: 'amber' },
  implemented: { labelTh: 'ดำเนินการแล้ว', tone: 'green' },
  not_implemented: { labelTh: 'ยังไม่ดำเนินการ', tone: 'red' },
};

/**
 * Document slots a lecturer uploads per offering.
 * `required` marks documents needed before AI analysis can run.
 */
export const DOCUMENT_SLOTS: {
  type: UploadType;
  labelTh: string;
  descriptionTh: string;
  required: boolean;
}[] = [
  {
    type: 'tqf3',
    labelTh: 'มคอ.3 (TQF3)',
    descriptionTh: 'รายละเอียดของรายวิชา — บังคับ',
    required: true,
  },
  {
    type: 'tqf5',
    labelTh: 'มคอ.5 (TQF5)',
    descriptionTh: 'รายงานผลการดำเนินการของรายวิชา — บังคับเมื่อสิ้นภาค',
    required: true,
  },
  {
    type: 'grade_report_pdf',
    labelTh: 'ใบรายงานเกรด (PDF)',
    descriptionTh: 'ใบรายงานเกรดทางการของ มฟล. — บังคับเมื่อสิ้นภาค',
    required: true,
  },
  {
    type: 'grade_raw_scores',
    labelTh: 'คะแนนดิบ (Excel/CSV)',
    descriptionTh: 'ไม่บังคับ — ช่วยให้วิเคราะห์ค่าเฉลี่ย/SD ได้แม่นยำขึ้น',
    required: false,
  },
  {
    type: 'item_analysis',
    labelTh: 'การวิเคราะห์ข้อสอบ',
    descriptionTh: 'ไม่บังคับ — Item Analysis ถ้ามี',
    required: false,
  },
  {
    type: 'supporting',
    labelTh: 'เอกสารประกอบอื่น ๆ',
    descriptionTh: 'ไม่บังคับ — Rubric, แบบประเมิน ฯลฯ',
    required: false,
  },
];

/**
 * Verification-committee decision on whether the previous semester's
 * improvement recommendations were carried out in the next offering.
 */
export const IMPLEMENTATION_DECISION: Record<
  ImplementationDecision,
  { labelTh: string; tone: 'green' | 'amber' | 'red' }
> = {
  implemented: { labelTh: 'ดำเนินการแล้ว', tone: 'green' },
  partially_implemented: { labelTh: 'ดำเนินการบางส่วน', tone: 'amber' },
  not_implemented: { labelTh: 'ยังไม่ดำเนินการ', tone: 'red' },
};

/**
 * Final verification-committee decision after assessor sign-off.
 */
export const VERIFICATION_DECISION: Record<
  VerificationDecision,
  { labelTh: string; tone: 'green' | 'amber' }
> = {
  verified: { labelTh: 'รับรองผลการทวนสอบ', tone: 'green' },
  needs_follow_up: { labelTh: 'รับรองแบบมีเงื่อนไข / ต้องติดตาม', tone: 'amber' },
};

export const SEMESTER_LABEL: Record<Semester, string> = {
  '1': 'ภาคต้น',
  '2': 'ภาคปลาย',
  '3': 'ภาคฤดูร้อน',
};

export const REPORT_STATUS_TH: Record<AiReportStatus, string> = {
  queued: 'รอดำเนินการ',
  running: 'กำลังวิเคราะห์',
  succeeded: 'วิเคราะห์สำเร็จ',
  failed: 'วิเคราะห์ล้มเหลว',
};

/** In-app notification categories (NotificationDoc.type). */
export const NOTIFICATION_TYPE = {
  ai_analysis_ready: 'ผลวิเคราะห์ AI',
  course_ready_for_review: 'รอการทวนสอบ',
  course_assessed: 'ผลการทวนสอบ',
  verification_ready: 'รอการรับรองผล',
  verification_completed: 'รับรองผลแล้ว',
  verification_follow_up: 'ต้องติดตามผล',
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPE;

export const PROGRAM_LEVEL_LABEL: Record<ProgramLevel, string> = {
  undergraduate: 'ปริญญาตรี',
  master: 'ปริญญาโท',
  doctoral: 'ปริญญาเอก',
};

export const PLO_SCHEMA_LABEL: Record<PloSchema, string> = {
  '4_domain': '4 ด้าน',
  '6_domain_tqf': '6 ด้าน (TQF)',
};

export const PLO_DOMAIN_LABEL: Record<PloDomain, string> = {
  ethics: 'จริยธรรม',
  knowledge: 'ความรู้',
  intellectual: 'ทักษะทางปัญญา',
  interpersonal: 'ทักษะความสัมพันธ์ระหว่างบุคคล',
  numerical_comm_it: 'ทักษะการวิเคราะห์ สื่อสาร และ IT',
  psychomotor: 'ทักษะพิสัย',
  character: 'ลักษณะบุคคล',
  skill: 'ทักษะ',
};

export const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  theory: 'ทฤษฎี',
  theory_practice: 'ทฤษฎี + ปฏิบัติ',
  practice: 'ปฏิบัติ',
  field: 'ภาคสนาม',
  s_u: 'S/U',
};
