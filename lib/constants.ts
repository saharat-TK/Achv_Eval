import type { OfferingStatus, UploadType, Semester } from '@/lib/types/models';

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

export const SEMESTER_LABEL: Record<Semester, string> = {
  '1': 'ภาคต้น',
  '2': 'ภาคปลาย',
  '3': 'ภาคฤดูร้อน',
};
