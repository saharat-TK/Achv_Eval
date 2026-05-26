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
