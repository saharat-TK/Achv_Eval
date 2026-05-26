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

/** Structured result of one full analysis run (assembled from section calls).
 *  `section3RevisedTqf3` is no longer produced during analysis — the revised
 *  มคอ.3 draft is generated on demand by `runTqf3Draft` / generateTqf3Draft.
 *  The field stays optional so older stored reports still render it. */
export interface AnalysisResult {
  courseCodeDetected: string;
  section1Grading: string;
  section2Quality: string;
  section3RevisedTqf3?: string;
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
- JSON string values must be valid JSON strings: escape line breaks as \\n
  and escape double quotes inside Markdown content.
- Base every statement on the attached documents. If evidence is missing,
  write "ไม่พบหลักฐานในเอกสารที่ได้รับ".
- Be thorough and detailed. Do not summarise away substance — this output
  feeds an official quality-assurance report.`;

/** Override footer for plain-text (non-JSON) generations such as the revised
 *  มคอ.3 draft, which is too large to survive JSON-string escaping. */
const AUTOMATED_MODE_TEXT = `
=====================================================================
AUTOMATED MODE — OVERRIDES (take precedence over the guideline above)
=====================================================================
- Output language: ภาษาไทย. Do NOT ask the user to choose a language;
  ignore "ขั้นตอนที่ 0" and proceed directly.
- Do NOT produce a .docx file and do NOT return JSON. Return the document
  body as plain Markdown text only — no JSON wrapper and no code fences.
- Base every statement on the attached documents and the analysis findings
  provided. If evidence is missing, write "ไม่พบหลักฐานในเอกสารที่ได้รับ".
- Produce ONE single, clean, complete document. Be detailed where needed,
  but do NOT repeat sections or pad — write each part exactly once. The
  output budget is limited; excessive length gets truncated.`;

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
  label: string;
  schemaHint: string;
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
      maxOutputTokens: 65536,
    },
  });

  const resp = await model.generateContent({
    contents: [
      { role: 'user', parts: [{ text: args.userText }, ...fileParts(args.files)] },
    ],
  });

  const finishReason = resp.response.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new Error(`${args.label}: Gemini output was cut off before JSON completed`);
  }

  const text = resp.response.text();
  const usage = {
    input: resp.response.usageMetadata?.promptTokenCount ?? 0,
    output: resp.response.usageMetadata?.candidatesTokenCount ?? 0,
  };
  try {
    return {
      data: parseJson<T>(text),
      usage,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid JSON';
    console.warn('Gemini returned malformed JSON; attempting repair', {
      section: args.label,
      outputLength: text.length,
      outputPreview: preview(text),
    });

    try {
      const repaired = await repairJson<T>({
        genAI: args.genAI,
        model: args.model,
        label: args.label,
        schemaHint: args.schemaHint,
        malformedText: text,
      });
      return {
        data: repaired.data,
        usage: addUsage(usage, repaired.usage),
      };
    } catch (repairErr) {
      console.warn('Gemini JSON repair failed', {
        section: args.label,
        error: repairErr instanceof Error ? repairErr.message : String(repairErr),
      });
    }

    throw new Error(`${args.label}: ${message}`);
  }
}

/**
 * One Gemini call that returns raw text (no JSON wrapper). Used for large
 * free-form outputs (the revised มคอ.3 draft) where wrapping ~600 KB of
 * Markdown in a single JSON string is the dominant failure mode — JSON
 * escaping breaks and the repair round-trip is too large to fetch.
 */
async function callText(args: {
  genAI: GoogleGenerativeAI;
  model: string;
  label: string;
  systemInstruction: string;
  userText: string;
  files: InputFile[];
}): Promise<{ text: string; usage: Usage }> {
  const model = args.genAI.getGenerativeModel({
    model: args.model,
    systemInstruction: args.systemInstruction,
    generationConfig: {
      responseMimeType: 'text/plain',
      temperature: 0.3,
      maxOutputTokens: 65536,
    },
  });

  const resp = await model.generateContent({
    contents: [
      { role: 'user', parts: [{ text: args.userText }, ...fileParts(args.files)] },
    ],
  });

  const finishReason = resp.response.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new Error(`${args.label}: Gemini output was cut off before completion`);
  }

  return {
    text: resp.response.text(),
    usage: {
      input: resp.response.usageMetadata?.promptTokenCount ?? 0,
      output: resp.response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

async function repairJson<T>(args: {
  genAI: GoogleGenerativeAI;
  model: string;
  label: string;
  schemaHint: string;
  malformedText: string;
}): Promise<{ data: T; usage: Usage }> {
  const model = args.genAI.getGenerativeModel({
    model: args.model,
    systemInstruction:
      'You are a JSON repair tool. Return only one valid JSON object. ' +
      'Do not summarize, translate, add, remove, or reword content.',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
      maxOutputTokens: 65536,
    },
  });

  const resp = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Repair the malformed JSON output for ${args.label}.\n\n` +
              `Required JSON shape:\n${args.schemaHint}\n\n` +
              'Rules:\n' +
              '- Return JSON only. No markdown code fence, prose, or commentary.\n' +
              '- Preserve the original content exactly as much as possible.\n' +
              '- Escape all line breaks inside string values as \\n.\n' +
              '- Escape double quotes inside string values as \\".\n\n' +
              'Malformed output:\n' +
              args.malformedText,
          },
        ],
      },
    ],
  });

  const finishReason = resp.response.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new Error(`${args.label}: JSON repair output was cut off`);
  }

  return {
    data: parseJson<T>(resp.response.text()),
    usage: {
      input: resp.response.usageMetadata?.promptTokenCount ?? 0,
      output: resp.response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
  };
}

function preview(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 300);
}

/** Removes a leading heading that merely repeats the section title
 *  (e.g. "## ส่วนที่ 2 — ..."), which the report template / UI already render —
 *  otherwise the title shows up twice. */
function stripLeadingSectionHeading(content: string): string {
  return content.replace(/^\s*(?:#{1,6}\s*|\*\*\s*)?ส่วนที่\s*\d+[^\n]*\n+/u, '');
}

function parseJson<T>(raw: string): T {
  const text = raw.trim();
  if (!text) {
    throw new Error('Gemini returned empty output instead of JSON');
  }

  const candidates = [
    text,
    stripCodeFence(text),
    extractFirstJsonObject(text),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error('Gemini returned output that is not valid JSON');
}

function stripCodeFence(text: string): string | null {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? null;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return text.slice(start, i + 1).trim();
  }

  return null;
}

/**
 * Runs the full course analysis as three focused, section-by-section Gemini
 * calls (run in parallel): grading (§1), course-quality (§2), and the 7-item
 * verification rubric (§4). Each section gets the model's full attention,
 * which yields far more detail than a single combined pass.
 *
 * The revised มคอ.3 draft (formerly §3) is intentionally NOT generated here —
 * it is the largest, most failure-prone output and is now produced on demand
 * by `runTqf3Draft`.
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
    label: 'ส่วนที่ 1',
    schemaHint: '{ "content": "<Markdown รายละเอียดของส่วนที่ 1>" }',
    systemInstruction: system,
    files,
    userText:
      'จัดทำเฉพาะเนื้อหาของ "ส่วนที่ 1 — การประเมินผลและการตัดเกรด" อย่างละเอียด ' +
      'ห้ามใส่หัวข้อ "ส่วนที่ 1 ..." ซ้ำในเนื้อหา (ระบบจะใส่หัวข้อให้แล้ว). ' +
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
    label: 'ส่วนที่ 2',
    schemaHint:
      '{ "content": "<Markdown รายละเอียดของส่วนที่ 2>", ' +
      '"overallSummary": "<บทสรุปผู้บริหารแบบ Markdown>", ' +
      '"criticalIssues": ["<ประเด็น Critical>", "..."], ' +
      '"courseCodeDetected": "<รหัสวิชาที่พบในเอกสาร>" }',
    systemInstruction: system,
    files,
    userText:
      'จัดทำเฉพาะเนื้อหาของ "ส่วนที่ 2 — การประเมินคุณภาพรายวิชา" อย่างละเอียด ' +
      'ห้ามใส่หัวข้อ "ส่วนที่ 2 ..." ซ้ำในเนื้อหา (ระบบจะใส่หัวข้อให้แล้ว). ' +
      'ประเมินทีละหมวด (หมวดที่ 1 ถึง 6) ตามแนวทาง พร้อมวิเคราะห์ CLO, ' +
      'PLO–CLO mapping, ความสอดคล้องของวิธีประเมินกับ Bloom. ' +
      '**บังคับ: ทุกหมวด (หมวดที่ 1 ถึง 6) ต้องปิดท้ายด้วยบทสรุป 2 บรรทัดเสมอ คือ ' +
      '"จุดเด่นของหมวดนี้:" และ "จุดที่ควรพัฒนาของหมวดนี้:" ' +
      '(หากไม่พบให้ระบุว่า "ไม่พบ").** ' +
      'จากนั้นสรุปจุดเด่น/จุดอ่อนภาพรวมพร้อมระดับความรุนแรง (Critical/Major/Minor). ' +
      'ส่งผลเป็น JSON: { "content": "<Markdown รายละเอียดของส่วนที่ 2>", ' +
      '"overallSummary": "<บทสรุปผู้บริหารแบบ Markdown>", ' +
      '"criticalIssues": ["<ประเด็น Critical>", ...], ' +
      '"courseCodeDetected": "<รหัสวิชาที่พบในเอกสาร>" }',
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
    label: 'ส่วนที่ 4',
    schemaHint:
      '{ "items": [ { "key": "item1Clo|item21Content|item22Methods|' +
      'item31AssessmentMethods|item32AssessmentForms|item33Proportions|' +
      'item34ExamQuality", "labelTh": "<ชื่อหัวข้อ>", "score": 1|2|3, ' +
      '"strengths": "<ข้อดี>", "improvements": "<ข้อพัฒนา>" } ], ' +
      '"totalScore": <ผลรวม>, "maxScore": 21, ' +
      '"percent": <ร้อยละ ทศนิยม 1 ตำแหน่ง>, ' +
      '"band": "improve|good|excellent" }',
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

  const [r1, r2, r4] = await Promise.all([call1, call2, call4]);

  const result: AnalysisResult = {
    courseCodeDetected: r2.data.courseCodeDetected ?? '',
    section1Grading: stripLeadingSectionHeading(r1.data.content ?? ''),
    section2Quality: stripLeadingSectionHeading(r2.data.content ?? ''),
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
    input: r1.usage.input + r2.usage.input + r4.usage.input,
    output: r1.usage.output + r2.usage.output + r4.usage.output,
  };
  return { result, usage };
}

function validate(r: AnalysisResult): void {
  if (!r.section1Grading || !r.section2Quality) {
    throw new Error('Analysis result is missing one or more required sections');
  }
  if (!Array.isArray(r.section4Verification.items) || r.section4Verification.items.length !== 7) {
    throw new Error('Analysis result must contain exactly 7 rubric items');
  }
}

/** Context from a completed analysis, fed to the on-demand TQF3 draft so the
 *  model knows exactly which weaknesses to fix while it rewrites the document. */
export interface Tqf3Findings {
  section1Grading?: string;
  section2Quality?: string;
  overallSummary?: string;
  criticalIssues?: string[];
}

/**
 * Generates a full revised มคอ.3 draft on demand, in a single Gemini call.
 *
 * Re-feeds the original มคอ.3 files (so the model can rewrite the real
 * document, not reconstruct it) plus the analysis findings (so it fixes the
 * identified weaknesses). Returns Markdown for `buildTqf3Html` to render.
 */
export async function runTqf3Draft(args: {
  apiKey: string;
  model: string;
  guideline: string;
  files: InputFile[];
  findings: Tqf3Findings;
}): Promise<{ content: string; usage: Usage }> {
  const { apiKey, model, guideline, files, findings } = args;
  const genAI = new GoogleGenerativeAI(apiKey);
  const system = `${guideline}\n${AUTOMATED_MODE_TEXT}`;

  const findingsContext = [
    findings.overallSummary ? `## บทสรุปผู้บริหาร\n${findings.overallSummary}` : '',
    findings.criticalIssues?.length
      ? `## ประเด็นสำคัญที่ต้องแก้ไข\n${findings.criticalIssues
          .map((c) => `- ${c}`)
          .join('\n')}`
      : '',
    findings.section1Grading
      ? `## ผลการประเมินส่วนที่ 1 (การตัดเกรด)\n${findings.section1Grading}`
      : '',
    findings.section2Quality
      ? `## ผลการประเมินส่วนที่ 2 (คุณภาพรายวิชา)\n${findings.section2Quality}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const { text, usage } = await callText({
    genAI,
    model,
    label: 'ร่าง มคอ.3',
    systemInstruction: system,
    files,
    userText:
      'จัดทำ "เอกสาร มคอ.3 ฉบับปรับปรุง" ที่สมบูรณ์และพร้อมใช้งานจริง โดยอ้างอิงเอกสาร ' +
      'มคอ.3 ต้นฉบับที่แนบมา และนำผลการวิเคราะห์ด้านล่างมาแก้ไขทุกจุดอ่อนโดยตรง พร้อมคงจุดเด่นไว้.\n\n' +
      'ขอบเขตผลลัพธ์ (สำคัญมาก):\n' +
      '- ตอบกลับเป็น "ตัวเอกสาร มคอ.3 ฉบับปรับปรุง" เท่านั้น เรียงตามหมวดที่ 1 ถึง 6 ของ มคอ.3.\n' +
      '- ห้ามใส่บทวิเคราะห์ / ตารางเปรียบเทียบก่อน-หลัง / เหตุผลรายข้อ / Change Summary ' +
      'เพราะมีอยู่ในรายงานวิเคราะห์แล้ว — ให้นำผลวิเคราะห์ไปใช้แก้ไขเนื้อหาโดยตรง.\n' +
      '- เขียนแต่ละหมวดเพียงครั้งเดียว ห้ามทำซ้ำเนื้อหา เขียนกระชับแต่ครบถ้วน.\n' +
      '- หมวดที่ 4 (แผนการสอน) ต้องเป็นตารางครบทุกสัปดาห์ ในรูปแบบเดียวกับ มคอ.3 ต้นฉบับ.\n' +
      '- รูปแบบตาราง Markdown (สำคัญมาก ห้ามผิด): แถวหัวตารางอยู่บรรทัดเดียว ' +
      'ตามด้วยแถวเส้นคั่น "| --- | --- | ... |" ในบรรทัดถัดไปเพียงบรรทัดเดียว ' +
      'จากนั้น 1 สัปดาห์ต่อ 1 บรรทัด. ห้ามรวมแถวหัวตารางกับแถวเส้นคั่นไว้บรรทัดเดียวกัน ' +
      'และห้ามใส่เส้นขีด "----" คั่นระหว่างแถวข้อมูล. ตัวอย่าง:\n' +
      '| สัปดาห์ | หัวข้อ | ชม.บรรยาย | ชม.ปฏิบัติ | CLO | ผู้สอน |\n' +
      '| --- | --- | --- | --- | --- | --- |\n' +
      '| 1 | แนะนำรายวิชา | 2 | 0 | CLO1 | อ.ก |\n' +
      '- ตอบกลับเป็น Markdown ล้วนเท่านั้น ไม่มี JSON และไม่มี code fence.\n\n' +
      '=== ผลการวิเคราะห์ของระบบ (ใช้เป็นแนวทางการแก้ไข ไม่ต้องคัดลอกลงในเอกสาร) ===\n' +
      findingsContext,
  });

  // The model may still wrap the answer in a ```markdown fence; strip it.
  const trimmed = text.trim();
  const content = stripCodeFence(trimmed) ?? trimmed;
  return { content, usage };
}
