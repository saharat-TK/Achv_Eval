import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} from 'docx';
import type { SummaryReportData, SummaryTopic } from './assessmentSummaryHtml';

function p(text: string, opts: { bold?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22 })],
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } });
}

function cell(text: string, opts: { bold?: boolean } = {}): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: 20 })] })],
  });
}

function courseTable(rows: { code: string; lecturer: string; band: string }[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell('รหัส/ชื่อรายวิชา', { bold: true }),
          cell('ผู้รับผิดชอบรายวิชา', { bold: true }),
          cell('ผลการประเมิน', { bold: true }),
        ],
      }),
      ...rows.map(
        (r) =>
          new TableRow({ children: [cell(r.code), cell(r.lecturer), cell(r.band)] }),
      ),
    ],
  });
}

/** Section 3.1 — a 3-column table (topic | strengths | suggestions). */
function bulletCell(items: string[]): TableCell {
  if (items.length === 0) {
    return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '—', size: 20 })] })] });
  }
  return new TableCell({
    children: items.map(
      (s) => new Paragraph({ text: s, bullet: { level: 0 }, spacing: { after: 20 } }),
    ),
  });
}

function assessorTopicTable(topics: SummaryTopic[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell('หัวข้อการทวนสอบ', { bold: true }),
          cell('ข้อดี / จุดเด่น', { bold: true }),
          cell('ข้อเสนอแนะ', { bold: true }),
        ],
      }),
      ...topics.map(
        (t) =>
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: `${t.number}. ${t.labelTh}`, bold: true, size: 20 })],
                  }),
                ],
              }),
              bulletCell(t.strengths),
              bulletCell(t.improvements),
            ],
          }),
      ),
    ],
  });
}

function topicParagraphs(topics: SummaryTopic[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const t of topics) {
    out.push(p(`${t.number}. ${t.labelTh}`, { bold: true }));
    if (t.improvements.length === 0) {
      out.push(
        new Paragraph({
          children: [new TextRun({ text: 'ไม่มีความเห็นเพิ่มเติม', italics: true, size: 20 })],
        }),
      );
    } else {
      for (const s of t.improvements) {
        out.push(new Paragraph({ text: s, bullet: { level: 0 }, spacing: { after: 20 } }));
      }
    }
  }
  return out;
}

/** Builds an editable .docx meeting-minutes report mirroring the PDF/HTML. */
export async function buildAssessmentSummaryDocx(d: SummaryReportData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `รายงานการประชุมทวนสอบผลสัมฤทธิ์การศึกษา ${d.scopeLabel} ปีการศึกษา ${d.academicYear}`,
          bold: true,
          size: 28,
        }),
      ],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.academicProgramLabel, size: 22 })] }),
  );
  if (d.header.meetingDateTime) children.push(p(d.header.meetingDateTime));
  if (d.header.venue) children.push(p(`ณ ${d.header.venue}`));

  if (d.header.committee.length) {
    children.push(heading('รายนามคณะกรรมการทวนสอบ'));
    for (const m of d.header.committee) children.push(p(`${m.name}    ${m.role}`));
  }

  children.push(
    heading('รายละเอียดการทวนสอบ'),
    p(
      `ประจำปีการศึกษา ${d.academicYear} ${d.scopeLabel} มีรายวิชาที่รับผิดชอบสอนในหลักสูตร ` +
        `${d.totalOfferings} รายวิชา ดำเนินการทวนสอบผลสัมฤทธิ์แล้ว ${d.assessedOfferings} รายวิชา ` +
        `คิดเป็นร้อยละ ${d.percent} ของรายวิชาที่เปิดสอน`,
    ),
    p(
      `สัดส่วนผลการประเมิน 3 กลุ่ม: ควรปรับปรุง ${d.bandDistribution.improve} · ` +
        `ดี ${d.bandDistribution.good} · ดีเยี่ยม ${d.bandDistribution.excellent}`,
    ),
  );

  for (const g of d.semesterGroups) {
    children.push(p(`${g.semesterLabel} (จำนวน ${g.rows.length} รายวิชา)`, { bold: true }));
    children.push(
      courseTable(
        g.rows.map((r) => ({
          code: `${r.courseCode} ${r.courseNameEn}`,
          lecturer: r.lecturerName ?? '—',
          band: r.bandLabel ?? '—',
        })),
      ),
    );
  }

  children.push(heading('สรุปข้อเสนอแนะตามหัวข้อการทวนสอบ (7 รายการ) — จากผู้ทวนสอบ'));
  children.push(assessorTopicTable(d.assessorTopics));

  children.push(heading('ข้อเสนอแนะเพิ่มเติมตามหัวข้อการทวนสอบ (7 รายการ) — จากการวิเคราะห์ AI'));
  children.push(...topicParagraphs(d.aiTopics));

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Sarabun', size: 22 } },
      },
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
