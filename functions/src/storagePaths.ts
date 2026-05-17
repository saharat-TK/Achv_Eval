import * as admin from 'firebase-admin';

/** Reduces a path segment to a filesystem/URL-safe slug. */
function slug(value: string | number): string {
  return (
    String(value)
      .trim()
      .replace(/[^A-Za-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'na'
  );
}

export interface OfferingPathParts {
  programCode: string;
  courseCode: string;
  academicYear: number;
  semester: string;
  section: string;
}

/**
 * Human-readable Storage folder for one offering's report PDFs, e.g.
 * `reports/OHS-M/2568-S1/2105709-sec01`.
 */
export function offeringReportDir(p: OfferingPathParts): string {
  return [
    'reports',
    slug(p.programCode),
    `${slug(p.academicYear)}-S${slug(p.semester)}`,
    `${slug(p.courseCode)}-sec${slug(p.section)}`,
  ].join('/');
}

/**
 * Human-readable download filename for a report PDF, e.g.
 * `ai-report_ohs-1808412-2568-1-1_f1WEudIim8j.pdf`. The id keeps its
 * original case so it stays traceable to the Firestore doc.
 */
export function offeringReportFileName(
  prefix: string,
  p: OfferingPathParts,
  id: string,
): string {
  const tag = [
    p.programCode,
    p.courseCode,
    p.academicYear,
    p.semester,
    p.section,
  ]
    .map((v) => slug(v).toLowerCase())
    .join('-');
  return `${prefix}_${tag}_${slug(id)}.pdf`;
}

/** Looks up a program's human-readable code; falls back to its id. */
export async function getProgramCode(
  db: admin.firestore.Firestore,
  programId: string,
): Promise<string> {
  const snap = await db.collection('programs').doc(programId).get();
  return (snap.data()?.code as string | undefined) ?? programId;
}
