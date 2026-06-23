/**
 * Normalise a human input into a Firestore-safe document ID component.
 * Uppercases and strips every character that is not A-Z or 0-9.
 *
 * Usage:
 *   academicPrograms  →  toDocId(code)               e.g. "OHS"
 *   programs          →  toDocId(code)               e.g. "OHS2565"
 *   courses           →  `${programId}_${toDocId(code)}`
 *   offerings         →  `${courseId}_${year}_${sem}_${section}`
 */
export function toDocId(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Normalises a thesis-installment input (ส่วนที่/ครั้งที่ลงทะเบียน). Returns the
 * part number only when it is a real 2nd+ installment (2–6); part 1, null, and
 * out-of-range values collapse to `null` so ordinary coursework and "part 1"
 * keep their original offering id and dedup untouched.
 */
export function normalizeThesisPart(part: number | null | undefined): number | null {
  if (part == null) return null;
  const n = Math.trunc(part);
  return n >= 2 && n <= 6 ? n : null;
}

/**
 * Builds an offering document id. A `_P{n}` suffix is appended only for thesis
 * installments 2–6 (`part` already normalised via {@link normalizeThesisPart}),
 * so ordinary offerings keep `${courseId}_${year}_${sem}_${section}`.
 */
export function offeringDocId(
  courseId: string,
  year: number,
  semester: string,
  section: string,
  part: number | null,
): string {
  const base = `${courseId}_${year}_${semester}_${section}`;
  return part ? `${base}_P${part}` : base;
}

/**
 * Display label for a thesis installment — the English word "Revision" by
 * product choice. Returns `"Revision N"` for installments 2–6, or `""` for
 * ordinary offerings / the collapsed first installment (so callers can render
 * nothing). Callers add their own separator (e.g. `· `) around a non-empty
 * result.
 */
export function revisionLabel(part: number | null | undefined): string {
  const p = normalizeThesisPart(part);
  return p ? `Revision ${p}` : '';
}
