'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import { normalizeEmail } from '@/lib/data/allowlist';

export interface AllowlistEntryInput {
  email: string;
  nameTh?: string;
  nameEn?: string;
  notes?: string;
}

export type AllowlistActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface BulkAddFailure {
  email: string;
  reason: string;
}

export type BulkAddResult =
  | {
      ok: true;
      added: number;
      duplicates: number;
      invalid: BulkAddFailure[];
    }
  | { ok: false; error: string };

async function authorizeAdmin() {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  return user && profile?.roles.isAdmin ? user : null;
}

async function audit(
  action: string,
  emailId: string,
  uid: string,
  email: string | null,
  after: Record<string, unknown> | null = null,
): Promise<void> {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: uid,
    actorEmail: email,
    action,
    entityType: 'allowlist',
    entityId: emailId,
    before: null,
    after,
  });
}

function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? 'mfu.ac.th')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function validateEmail(raw: string): { ok: true } | { ok: false; reason: string } {
  const email = raw.trim();
  if (!email) return { ok: false, reason: 'อีเมลว่าง' };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: 'รูปแบบอีเมลไม่ถูกต้อง' };
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || !allowedDomains().includes(domain)) {
    return { ok: false, reason: `อนุญาตเฉพาะโดเมน ${allowedDomains().join(', ')}` };
  }
  return { ok: true };
}

function fallbackName(email: string): string {
  return email.split('@')[0] ?? email;
}

/** Add a single allowlist entry. */
export async function addToAllowlist(
  input: AllowlistEntryInput,
): Promise<AllowlistActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถเพิ่มรายชื่อได้' };
  }
  const check = validateEmail(input.email);
  if (!check.ok) return { ok: false, error: check.reason };

  const id = normalizeEmail(input.email);
  const ref = getAdminDb().collection('allowlist').doc(id);
  const existing = await ref.get();
  if (existing.exists) {
    return { ok: false, error: 'อีเมลนี้อยู่ในทะเบียนแล้ว' };
  }

  await ref.set({
    email: id,
    nameTh: input.nameTh?.trim() || fallbackName(id),
    nameEn: input.nameEn?.trim() || fallbackName(id),
    notes: input.notes?.trim() || '',
    addedBy: user.uid,
    addedAt: FieldValue.serverTimestamp(),
    consumedAt: null,
    consumedUid: null,
  });

  await audit('allowlist_added', id, user.uid, user.email ?? null, {
    nameTh: input.nameTh ?? '',
  });
  revalidatePath('/admin/users/allowlist');
  return { ok: true, id };
}

/** Bulk add — used by CSV import. Returns per-row results. */
export async function bulkAddToAllowlist(
  rows: AllowlistEntryInput[],
): Promise<BulkAddResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถเพิ่มรายชื่อได้' };
  }
  if (rows.length === 0) {
    return { ok: true, added: 0, duplicates: 0, invalid: [] };
  }

  const db = getAdminDb();
  const invalid: BulkAddFailure[] = [];
  const validRows: { id: string; row: AllowlistEntryInput }[] = [];

  for (const row of rows) {
    const check = validateEmail(row.email);
    if (!check.ok) {
      invalid.push({ email: row.email, reason: check.reason });
      continue;
    }
    validRows.push({ id: normalizeEmail(row.email), row });
  }

  // Dedupe within the batch (later rows for the same email win).
  const byId = new Map<string, AllowlistEntryInput>();
  for (const { id, row } of validRows) byId.set(id, row);

  // Pre-fetch existing docs to count duplicates.
  const existingChecks = await Promise.all(
    Array.from(byId.keys()).map((id) =>
      db.collection('allowlist').doc(id).get(),
    ),
  );

  let duplicates = 0;
  let added = 0;
  const addedIds: string[] = [];
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  Array.from(byId.entries()).forEach(([id, row], i) => {
    if (existingChecks[i].exists) {
      duplicates++;
      return;
    }
    batch.set(db.collection('allowlist').doc(id), {
      email: id,
      nameTh: row.nameTh?.trim() || fallbackName(id),
      nameEn: row.nameEn?.trim() || fallbackName(id),
      notes: row.notes?.trim() || '',
      addedBy: user.uid,
      addedAt: now,
      consumedAt: null,
      consumedUid: null,
    });
    added++;
    addedIds.push(id);
  });

  if (added > 0) {
    await batch.commit();
    await audit('allowlist_bulk_added', 'bulk', user.uid, user.email ?? null, {
      added,
      duplicates,
      invalid: invalid.length,
      emails: addedIds,
    });
    revalidatePath('/admin/users/allowlist');
  }

  return { ok: true, added, duplicates, invalid };
}

/** Remove an allowlist entry. Refuses if already consumed (the
 *  matching `users/{uid}` should be deactivated instead). */
export async function removeFromAllowlist(
  emailId: string,
): Promise<AllowlistActionResult> {
  const user = await authorizeAdmin();
  if (!user) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้' };
  }
  const id = normalizeEmail(emailId);
  const ref = getAdminDb().collection('allowlist').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'ไม่พบรายการ' };
  const data = snap.data() as { consumedAt?: unknown };
  if (data.consumedAt) {
    return {
      ok: false,
      error:
        'ผู้ใช้รายนี้ลงทะเบียนแล้ว — กรุณาใช้ "ปิดใช้งานบัญชี" จากหน้าผู้ใช้งานแทน',
    };
  }
  await ref.delete();
  await audit('allowlist_removed', id, user.uid, user.email ?? null);
  revalidatePath('/admin/users/allowlist');
  return { ok: true, id };
}
