import { GoogleGenerativeAI } from '@google/generative-ai';

export interface InputFile {
  type: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
}

export interface RubricItemResult {
  key: string;
  labelTh: string;
  score: 1 | 2 | 3;
  strengths: string;
  improvements: string;
}

/** Structured result Gemini returns for one analysis run. */
export interface AnalysisResult {
  courseCodeDetected: string;
  section1Grading: string;
  section2Quality: string;
  section3RevisedTqf3: string;
  section4Verification: {
    items: RubricItemResult[];
    totalScore: number;
    maxScore: number;
    percent: number;
    band: 'improve' | 'good' | 'excellent';
  };
  overallSummary: string;
  criticalIssues: string[];
}

const RUBRIC_KEYS = [
  'item1Clo',
  'item21Content',
  'item22Methods',
  'item31AssessmentMethods',
  'item32AssessmentForms',
  'item33Proportions',
  'item34ExamQuality',
] as const;

/**
 * Instruction wrapper that adapts the CLAUDE.*.md guideline (written for an
 * interactive .docx workflow) to automated JSON output.
 */
function buildSystemInstruction(guideline: string): string {
  return `${guideline}

=====================================================================
AUTOMATED MODE — OVERRIDES (these take precedence over the guideline above)
=====================================================================
- Output language: ภาษาไทย. Do NOT ask the user to choose a language.
  Ignore "ขั้นตอนที่ 0" entirely and proceed directly.
- Do NOT produce a .docx file. Return ONE JSON object only — no prose
  before or after, no markdown code fences.
- Base every conclusion on the attached documents only. If a document is
  missing, state "ไม่พบหลักฐานในเอกสารที่ได้รับ" in the relevant section.
- The JSON object MUST have exactly this shape:

{
  "courseCodeDetected": string,
  "section1Grading": string,          // Markdown — ส่วนที่ 1 การประเมินผลและการตัดเกรด
  "section2Quality": string,          // Markdown — ส่วนที่ 2 การประเมินคุณภาพรายวิชา (หมวด 1-6)
  "section3RevisedTqf3": string,      // Markdown — ส่วนที่ 3 ร่าง มคอ.3 ฉบับปรับปรุง (รวมตารางแผนการสอนสมบูรณ์)
  "section4Verification": {
    "items": [
      {
        "key": one of ${RUBRIC_KEYS.join(' | ')},
        "labelTh": string,            // ชื่อหัวข้อภาษาไทย
        "score": 1 | 2 | 3,           // 3 ดีเยี่ยม, 2 ดี, 1 ควรปรับปรุง
        "strengths": string,          // ข้อดี อ้างอิงหลักฐาน
        "improvements": string        // ข้อพัฒนา อ้างอิงหลักฐาน
      }
      // exactly 7 items, one per key, in the order listed above
    ],
    "totalScore": number,             // sum of the 7 scores
    "maxScore": 21,
    "percent": number,                // totalScore / 21 * 100, one decimal
    "band": "improve" | "good" | "excellent"  // <70 improve, 70-79 good, 80-100 excellent
  },
  "overallSummary": string,           // Markdown — บทสรุปผู้บริหาร
  "criticalIssues": string[]          // ประเด็น Critical ที่ต้องแก้ก่อนเปิดสอนภาคหน้า
}

If the course has no exam-based assessment, still score item34ExamQuality
but note in its "improvements" that it is not applicable.`;
}

/**
 * Runs one Gemini analysis pass over the submitted documents.
 * Throws on API error or unparseable output.
 */
export async function runAnalysis(args: {
  apiKey: string;
  model: string;
  guideline: string;
  files: InputFile[];
}): Promise<{ result: AnalysisResult; usage: { input: number; output: number } }> {
  const { apiKey, model, guideline, files } = args;

  const genAI = new GoogleGenerativeAI(apiKey);
  const gemini = genAI.getGenerativeModel({
    model,
    systemInstruction: buildSystemInstruction(guideline),
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 32768,
    },
  });

  const parts = [
    {
      text:
        'วิเคราะห์เอกสารรายวิชาที่แนบมา (มคอ.3 และ มคอ.5/ใบรายงานเกรด หากมี) ' +
        'ตามแนวทางในคำสั่งระบบ แล้วส่งผลลัพธ์เป็น JSON object เดียวตามโครงสร้างที่กำหนด',
    },
    ...files.map((f) => ({
      inlineData: { mimeType: f.mimeType, data: f.dataBase64 },
    })),
  ];

  const response = await gemini.generateContent({
    contents: [{ role: 'user', parts }],
  });

  const text = response.response.text();
  const usage = {
    input: response.response.usageMetadata?.promptTokenCount ?? 0,
    output: response.response.usageMetadata?.candidatesTokenCount ?? 0,
  };

  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(text) as AnalysisResult;
  } catch {
    throw new Error('Gemini returned output that is not valid JSON');
  }

  validate(parsed);
  return { result: parsed, usage };
}

function validate(r: AnalysisResult): void {
  if (!r.section1Grading || !r.section2Quality || !r.section3RevisedTqf3) {
    throw new Error('Analysis result is missing one or more required sections');
  }
  const items = r.section4Verification?.items;
  if (!Array.isArray(items) || items.length !== 7) {
    throw new Error('Analysis result must contain exactly 7 rubric items');
  }
}
