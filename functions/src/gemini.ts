import { GoogleGenerativeAI, type Part } from '@google/generative-ai';

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

/** Structured result of one full analysis run (assembled from 4 section calls). */
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

const AUTOMATED_MODE = `
=====================================================================
AUTOMATED MODE — OVERRIDES (take precedence over the guideline above)
=====================================================================
- Output language: ภาษาไทย. Do NOT ask the user to choose a language;
  ignore "ขั้นตอนที่ 0" and proceed directly.
- Do NOT produce a .docx file. Return ONE JSON object only — no prose or
  markdown code fences around it.
- Base every statement on the attached documents. If evidence is missing,
  write "ไม่พบหลักฐานในเอกสารที่ได้รับ".
- Be thorough and detailed. Do not summarise away substance — this output
  feeds an official quality-assurance report.`;

function fileParts(files: InputFile[]): Part[] {
  return files.map((f) => ({
    inlineData: { mimeType: f.mimeType, data: f.dataBase64 },
  }));
}

interface Usage {
  input: number;
  output: number;
}

/** One Gemini call that returns a parsed JSON object of type T. */
async function callJson<T>(args: {
  genAI: GoogleGenerativeAI;
  model: string;
  systemInstruction: string;
  userText: string;
  files: InputFile[];
}): Promise<{ data: T; usage: Usage }> {
  const model = args.genAI.getGenerativeModel({
    model: args.model,
    systemInstruction: args.systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 32768,
    },
  });

  const resp = await model.generateContent({
    contents: [
      { role: 'user', parts: [{ text: args.userText }, ...fileParts(args.files)] },
    ],
  });

  const text = resp.response.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error('Gemini returned output that is not valid JSON');
  }
  return {
    data,
    usage: {
      input: resp.response.usageMetadata?.promptTokenCount ?? 0,
      output: resp.response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

/**
 * Runs the full course analysis as four focused, section-by-section Gemini
 * calls (run in parallel). Each section gets the model's full attention,
 * which yields far more detail than a single combined pass.
 */
export async function runAnalysis(args: {
  apiKey: string;
  model: string;
  guideline: string;
  files: InputFile[];
}): Promise<{ result: AnalysisResult; usage: Usage }> {
  const { apiKey, model, guideline, files } = args;
  const genAI = new GoogleGenerativeAI(apiKey);
  const system = `${guideline}\n${AUTOMATED_MODE}`;

  // --- Section 1: grading evaluation -------------------------------
  const call1 = callJson<{ content: string }>({
    genAI,
    model,
    systemInstruction: system,
    files,
    userText:
      'จัดทำเฉพาะ "ส่วนที่ 1 — การประเมินผลและการตัดเกรด" อย่างละเอียด ' +
      'ครอบคลุมทุกหัวข้อย่อย: สรุปข้อมูลคะแนน/เกรด, การตรวจสอบตามแนวปฏิบัติ ' +
      '(สัดส่วน 90/10, เกณฑ์การตัดเกรด, ประเด็นเฉพาะ, กระบวนการทบทวน) ' +
      'พร้อมระดับ ✅/⚠️/❌ และจุดเด่น/จุดอ่อน/ข้อเสนอแนะ. ' +
      'ส่งผลเป็น JSON: { "content": "<Markdown รายละเอียดของส่วนที่ 1>" }',
  });

  // --- Section 2: course-quality assessment ------------------------
  const call2 = callJson<{
    content: string;
    overallSummary: string;
    criticalIssues: string[];
    courseCodeDetected: string;
  }>({
    genAI,
    model,
    systemInstruction: system,
    files,
    userText:
      'จัดทำเฉพาะ "ส่วนที่ 2 — การประเมินคุณภาพรายวิชา" อย่างละเอียด ' +
      'ประเมินทีละหมวด (หมวดที่ 1 ถึง 6) ตามแนวทาง พร้อมวิเคราะห์ CLO, ' +
      'PLO–CLO mapping, ความสอดคล้องของวิธีประเมินกับ Bloom, ' +
      'และสรุปจุดเด่น/จุดอ่อนพร้อมระดับความรุนแรง (Critical/Major/Minor). ' +
      'ส่งผลเป็น JSON: { "content": "<Markdown รายละเอียดของส่วนที่ 2>", ' +
      '"overallSummary": "<บทสรุปผู้บริหารแบบ Markdown>", ' +
      '"criticalIssues": ["<ประเด็น Critical>", ...], ' +
      '"courseCodeDetected": "<รหัสวิชาที่พบในเอกสาร>" }',
  });

  // --- Section 3: revised TQF3 draft -------------------------------
  const call3 = callJson<{ content: string }>({
    genAI,
    model,
    systemInstruction: system,
    files,
    userText:
      'จัดทำเฉพาะ "ส่วนที่ 3 — ร่าง มคอ.3 ฉบับปรับปรุง" อย่างละเอียด ' +
      'แก้ไขทุกจุดอ่อนที่พบ คงจุดเด่นไว้ ประกอบด้วยบทสรุปการเปลี่ยนแปลง ' +
      'และร่างข้อความฉบับสมบูรณ์ — หมวดที่ 4 (แผนการสอน) ต้องเป็น ' +
      'ตารางสมบูรณ์ครบทุกสัปดาห์. ' +
      'ส่งผลเป็น JSON: { "content": "<Markdown ร่าง มคอ.3 ฉบับปรับปรุง>" }',
  });

  // --- Section 4: 7-item verification rubric -----------------------
  const call4 = callJson<{
    items: RubricItemResult[];
    totalScore: number;
    maxScore: number;
    percent: number;
    band: 'improve' | 'good' | 'excellent';
  }>({
    genAI,
    model,
    systemInstruction: system,
    files,
    userText:
      'จัดทำเฉพาะ "ส่วนที่ 4 — แบบรายงานผลการทวนสอบ 7 หัวข้อ" ' +
      'ให้คะแนนแต่ละหัวข้อ (3 ดีเยี่ยม / 2 ดี / 1 ควรปรับปรุง) ' +
      'พร้อมข้อดีและข้อพัฒนาที่อ้างอิงหลักฐาน. ' +
      `ส่งผลเป็น JSON: { "items": [ { "key": <หนึ่งใน ${RUBRIC_KEYS.join(
        ' | ',
      )}>, "labelTh": "<ชื่อหัวข้อ>", "score": 1|2|3, ` +
      '"strengths": "<ข้อดี>", "improvements": "<ข้อพัฒนา>" } x7 ตามลำดับคีย์ ], ' +
      '"totalScore": <ผลรวม>, "maxScore": 21, "percent": <ร้อยละ ทศนิยม 1 ตำแหน่ง>, ' +
      '"band": "improve"|"good"|"excellent" }',
  });

  const [r1, r2, r3, r4] = await Promise.all([call1, call2, call3, call4]);

  const result: AnalysisResult = {
    courseCodeDetected: r2.data.courseCodeDetected ?? '',
    section1Grading: r1.data.content ?? '',
    section2Quality: r2.data.content ?? '',
    section3RevisedTqf3: r3.data.content ?? '',
    section4Verification: {
      items: r4.data.items ?? [],
      totalScore: r4.data.totalScore ?? 0,
      maxScore: r4.data.maxScore ?? 21,
      percent: r4.data.percent ?? 0,
      band: r4.data.band ?? 'improve',
    },
    overallSummary: r2.data.overallSummary ?? '',
    criticalIssues: r2.data.criticalIssues ?? [],
  };

  validate(result);

  const usage: Usage = {
    input: r1.usage.input + r2.usage.input + r3.usage.input + r4.usage.input,
    output: r1.usage.output + r2.usage.output + r3.usage.output + r4.usage.output,
  };
  return { result, usage };
}

function validate(r: AnalysisResult): void {
  if (!r.section1Grading || !r.section2Quality || !r.section3RevisedTqf3) {
    throw new Error('Analysis result is missing one or more required sections');
  }
  if (!Array.isArray(r.section4Verification.items) || r.section4Verification.items.length !== 7) {
    throw new Error('Analysis result must contain exactly 7 rubric items');
  }
}
