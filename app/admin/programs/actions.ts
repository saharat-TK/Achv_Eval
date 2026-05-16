'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import type { ProgramLevel, PloSchema, ProgramPlo } from '@/lib/types/models';

export interface ProgramFormData {
  code: string;
  nameTh: string;
  nameEn: string;
  school: string;
  level: ProgramLevel;
  ploDomainSchema: PloSchema;
  isActive: boolean;
  plos: ProgramPlo[];
}

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function validate(data: ProgramFormData): string | null {
  if (!data.code?.trim()) return 'กรุณาระบุรหัสหลักสูตร';
  if (!data.nameTh?.trim()) return 'กรุณาระบุชื่อหลักสูตร (ไทย)';
  if (!data.nameEn?.trim()) return 'กรุณาระบุชื่อหลักสูตร (อังกฤษ)';
  for (const plo of data.plos) {
    if (!plo.descriptionTh?.trim()) {
      return `PLO ${plo.ploNumber}: กรุณาระบุคำอธิบาย`;
    }
  }
  return null;
}

function normalize(data: ProgramFormData) {
  return {
    code: data.code.trim(),
    nameTh: data.nameTh.trim(),
    nameEn: data.nameEn.trim(),
    school: data.school?.trim() || 'Health Science',
    level: data.level,
    ploDomainSchema: data.ploDomainSchema,
    isActive: data.isActive,
    plos: data.plos.map((p) => ({
      ploNumber: p.ploNumber,
      domain: p.domain,
      descriptionTh: p.descriptionTh.trim(),
      descriptionEn: p.descriptionEn?.trim() || '',
      bloomLevel: p.bloomLevel ?? null,
    })),
  };
}

async function writeAudit(
  action: string,
  programId: string,
  actorId: string,
  actorEmail: string | null,
): Promise<void> {
  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId,
    actorEmail,
    action,
    entityType: 'programs',
    entityId: programId,
    before: null,
    after: null,
  });
}

/** Create a new program. Admin only. */
export async function createProgram(data: ProgramFormData): Promise<ActionResult> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!user || !profile?.roles.isAdmin) {
    return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มหลักสูตรได้' };
  }

  const err = validate(data);
  if (err) return { ok: false, error: err };

  const now = FieldValue.serverTimestamp();
  const ref = await getAdminDb()
    .collection('programs')
    .add({ ...normalize(data), createdAt: now, updatedAt: now });

  await writeAudit('program_created', ref.id, user.uid, user.email ?? null);
  revalidatePath('/admin');
  return { ok: true, id: ref.id };
}

/** Update a program. Admin, or the director of that program. */
export async function updateProgram(
  programId: string,
  data: ProgramFormData,
): Promise<ActionResult> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  const allowed =
    profile?.roles.isAdmin ||
    profile?.roles.directorOf?.includes(programId);
  if (!user || !allowed) {
    return { ok: false, error: 'ท่านไม่มีสิทธิ์แก้ไขหลักสูตรนี้' };
  }

  const err = validate(data);
  if (err) return { ok: false, error: err };

  await getAdminDb()
    .collection('programs')
    .doc(programId)
    .update({ ...normalize(data), updatedAt: FieldValue.serverTimestamp() });

  await writeAudit('program_updated', programId, user.uid, user.email ?? null);
  revalidatePath('/admin');
  revalidatePath(`/admin/programs/${programId}`);
  return { ok: true, id: programId };
}
