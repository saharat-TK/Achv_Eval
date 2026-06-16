import type { AssessmentDoc } from '@/lib/types/models';

/** Key of one of the 7 official rubric items. */
export type ScoreKey = keyof AssessmentDoc['scores'];

export interface RubricDef {
  key: ScoreKey;
  number: string;
  labelTh: string;
  /** Official "รายละเอียดการทวนสอบ" — the criterion the score is judged against. */
  detailTh: string;
  allowNa: boolean;
}

// Topic labels and details from the official school verification form
// (manuals/Evaluation template-ทวนสอบผลลัพธ์การเรียนรู้รายวิชา.pdf). Used by the
// shared RubricScorer (lecturer self-assessment + assessor read-only reference).
// NOTE: components/AssessmentForm.tsx (the assessor's editable form) still holds
// its own copy of these definitions — keep the two in sync if the rubric text
// ever changes.
export const RUBRIC_ITEMS: RubricDef[] = [
  {
    key: 'item1Clo',
    number: '1',
    labelTh: 'ผลลัพธ์การเรียนรู้รายวิชา',
    detailTh:
      'ผลลัพธ์การเรียนรู้ของรายวิชาถูกต้องตามระดับการเรียนรู้ (ACTION VERB) มีความครบถ้วนตามที่ได้รับการกระจายผลลัพธ์การเรียนรู้จากหลักสูตร และมีความสอดคล้องกับผลลัพธ์การเรียนรู้ของหลักสูตร',
    allowNa: false,
  },
  {
    key: 'item21Content',
    number: '2.1',
    labelTh: 'เนื้อหาการเรียนการสอน',
    detailTh:
      'หัวข้อการสอน (15 หัวข้อ) มีความสอดคล้องกับผลลัพธ์การเรียนรู้รายวิชา',
    allowNa: false,
  },
  {
    key: 'item22Methods',
    number: '2.2',
    labelTh: 'วิธีการเรียนการสอน',
    detailTh:
      'วิธีการสอนมีความสอดคล้องกับผลลัพธ์การเรียนรู้ที่ระบุไว้ใน มคอ. 3/4 และมีวิธีการสอนที่หลากหลาย',
    allowNa: false,
  },
  {
    key: 'item31AssessmentMethods',
    number: '3.1',
    labelTh: 'วิธีการวัดและประเมินผล',
    detailTh: 'มีวิธีการวัดและประเมินผลที่ตรงและครอบคลุมผลลัพธ์การเรียนรู้',
    allowNa: false,
  },
  {
    key: 'item32AssessmentForms',
    number: '3.2',
    labelTh: 'รูปแบบการประเมินผล',
    detailTh:
      'ทวนสอบจาก มคอ. 3/4 มีรูปแบบการประเมินครอบคลุมรูปการประเมินทั้ง 3 รูปแบบ ได้แก่ Assessment as learning (AAL), Assessment for learning (AFL), Assessment of learning (AOL)',
    allowNa: false,
  },
  {
    key: 'item33Proportions',
    number: '3.3',
    labelTh: 'สัดส่วนในแต่ละวิธีการวัดและประเมินผล',
    detailTh:
      'สัดส่วนในแต่ละวิธีการวัดและประเมินผลสอดคล้องกับ Domain of Learning ที่ระบุใน มคอ. 3/4 และตรงกับประกาศเกณฑ์การวัดและประเมินผลของสำนักวิชาฯ',
    allowNa: false,
  },
  {
    key: 'item34ExamQuality',
    number: '3.4',
    labelTh: 'คุณภาพข้อสอบ',
    detailTh:
      'มีผลการวิเคราะห์คุณภาพข้อสอบอยู่ในระดับที่ดี และมีการปรับปรุงข้อสอบจากผลการวิเคราะห์ข้อสอบครั้งที่ผ่านมา',
    allowNa: true,
  },
];

export const BAND_LABEL: Record<string, { th: string; color: string }> = {
  excellent: { th: 'ดีเยี่ยม', color: 'text-green-700 bg-green-50 border-green-200' },
  good: { th: 'ดี', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  improve: { th: 'ควรปรับปรุง', color: 'text-amber-700 bg-amber-50 border-amber-200' },
};

export const DEFAULT_SCORES: AssessmentDoc['scores'] = {
  item1Clo: 1,
  item21Content: 1,
  item22Methods: 1,
  item31AssessmentMethods: 1,
  item32AssessmentForms: 1,
  item33Proportions: 1,
  item34ExamQuality: 1,
};

/** Initial scores for a fresh form: defaults, with 3.4 = N/A when the offering
 *  has no exam-based assessment. */
export function initialScores(hasExamAssessment: boolean): AssessmentDoc['scores'] {
  return { ...DEFAULT_SCORES, item34ExamQuality: hasExamAssessment ? 1 : 'na' };
}
