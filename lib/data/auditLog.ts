import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import type { AuditLogDoc } from '@/lib/types/models';

export interface AuditLogEntry extends AuditLogDoc {
  id: string;
}

/** Distinct `entityType` values that appear in `auditLog`. */
export const AUDIT_LOG_ENTITY_TYPES = [
  'users',
  'programs',
  'courses',
  'offerings',
  'aiReports',
  'assessments',
  'verifications',
  'implementationReviews',
] as const;
export type AuditLogEntityType = (typeof AUDIT_LOG_ENTITY_TYPES)[number];

/**
 * Reads a page of `auditLog` entries newest-first. Optional `entityType`
 * filter; `cursor` is the millis timestamp of the last entry on the
 * previous page (for older-than pagination).
 */
export async function getAuditLogPage({
  entityType,
  cursor,
  pageSize = 50,
}: {
  entityType?: string;
  cursor?: number;
  pageSize?: number;
}): Promise<{ entries: AuditLogEntry[]; nextCursor: number | null }> {
  const db = getAdminDb();
  let query = entityType
    ? db
        .collection('auditLog')
        .where('entityType', '==', entityType)
        .orderBy('occurredAt', 'desc')
    : db.collection('auditLog').orderBy('occurredAt', 'desc');

  if (cursor && Number.isFinite(cursor)) {
    query = query.startAfter(Timestamp.fromMillis(cursor));
  }

  const snap = await query.limit(pageSize).get();
  const entries: AuditLogEntry[] = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as AuditLogDoc),
  }));

  let nextCursor: number | null = null;
  if (entries.length === pageSize) {
    const lastRaw = snap.docs[snap.docs.length - 1].data().occurredAt;
    if (lastRaw && typeof lastRaw.toMillis === 'function') {
      nextCursor = lastRaw.toMillis();
    }
  }

  return { entries, nextCursor };
}
