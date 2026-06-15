'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import { normalizeEmail } from '@/lib/data/allowlist';
import type {
  AcademicProgramDoc,
  AssessmentCommitteeMember,
} from '@/lib/types/models';

export type CommitteeActionResult = { ok: true } | { ok: false; error: string };

/** A picked person (`user:<uid>` / `allowlist:<email>`) or a free-typed name (no key). */
export interface CommitteeMemberInput {
  name: string;
  key?: string | null;
}

export interface SaveCommitteeInput {
  academicProgramId: string;
  headAssessor: CommitteeMemberInput | null;
  externalAssessors: CommitteeMemberInput[];
  internalAssessors: CommitteeMemberInput[];
  secretary: CommitteeMemberInput | null;
}

async function authorizeAdmin() {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  return user && profile?.roles.isAdmin ? user : null;
}

function memberFromInput(m: CommitteeMemberInput | null | undefined): AssessmentCommitteeMember | null {
  if (!m) return null;
  const name = m.name.trim();
  if (!name) return null;
  if (m.key?.startsWith('user:')) return { name, uid: m.key.slice(5) };
  if (m.key?.startsWith('allowlist:')) return { name, allowlistId: normalizeEmail(m.key.slice(10)) };
  return { name }; // free-typed external
}

function cleanList(items: CommitteeMemberInput[]): AssessmentCommitteeMember[] {
  const seen = new Set<string>();
  const out: AssessmentCommitteeMember[] = [];
  for (const raw of items) {
    const m = memberFromInput(raw);
    if (!m) continue;
    const dedupe = m.uid ?? m.allowlistId ?? m.name.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(m);
  }
  return out;
}

/** uids / allowlist ids of the internal roles (head, internal assessors, secretary) —
 *  the members that receive assessor access to the program. */
function internalIdentities(c: {
  headAssessor: AssessmentCommitteeMember | null;
  internalAssessors: AssessmentCommitteeMember[];
  secretary: AssessmentCommitteeMember | null;
}): { uids: Set<string>; allow: Set<string> } {
  const uids = new Set<string>();
  const allow = new Set<string>();
  for (const m of [c.headAssessor, ...c.internalAssessors, c.secretary]) {
    if (!m) continue;
    if (m.uid) uids.add(m.uid);
    else if (m.allowlistId) allow.add(m.allowlistId);
  }
  return { uids, allow };
}

export async function saveAssessmentCommittee(
  input: SaveCommitteeInput,
): Promise<CommitteeActionResult> {
  const actor = await authorizeAdmin();
  if (!actor) return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการได้' };

  const db = getAdminDb();
  const ref = db.collection('academicPrograms').doc(input.academicProgramId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'ไม่พบหลักสูตร' };

  const externalAssessors = cleanList(input.externalAssessors);
  if (externalAssessors.length > 3)
    return { ok: false, error: 'ผู้ทวนสอบภายนอกได้ไม่เกิน 3 คน' };

  const committee = {
    headAssessor: memberFromInput(input.headAssessor),
    externalAssessors,
    internalAssessors: cleanList(input.internalAssessors),
    secretary: memberFromInput(input.secretary),
  };

  // Reconcile assessor access for the internal roles: grant to the new set,
  // revoke from anyone dropped since the previous save.
  const prev = (snap.data() as AcademicProgramDoc).assessmentCommittee ?? null;
  const next = internalIdentities(committee);
  const before = prev
    ? internalIdentities({
        headAssessor: prev.headAssessor ?? null,
        internalAssessors: prev.internalAssessors ?? [],
        secretary: prev.secretary ?? null,
      })
    : { uids: new Set<string>(), allow: new Set<string>() };

  const programId = input.academicProgramId;
  const batch = db.batch();
  batch.update(ref, {
    assessmentCommittee: {
      ...committee,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const uid of next.uids)
    batch.update(db.collection('users').doc(uid), {
      'roles.assessorOfAcademicPrograms': FieldValue.arrayUnion(programId),
    });
  for (const id of next.allow)
    batch.update(db.collection('allowlist').doc(id), {
      presetAssessorAcademicProgramIds: FieldValue.arrayUnion(programId),
    });
  for (const uid of before.uids)
    if (!next.uids.has(uid))
      batch.update(db.collection('users').doc(uid), {
        'roles.assessorOfAcademicPrograms': FieldValue.arrayRemove(programId),
      });
  for (const id of before.allow)
    if (!next.allow.has(id))
      batch.update(db.collection('allowlist').doc(id), {
        presetAssessorAcademicProgramIds: FieldValue.arrayRemove(programId),
      });

  try {
    await batch.commit();
  } catch (err) {
    console.error('saveAssessmentCommittee failed', err);
    return { ok: false, error: 'บันทึกไม่สำเร็จ — กรุณาลองใหม่' };
  }

  await db.collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: actor.uid,
    actorEmail: actor.email ?? null,
    action: 'assessment_committee_saved',
    entityType: 'academicPrograms',
    entityId: programId,
    before: null,
    after: {
      head: committee.headAssessor?.name ?? null,
      external: committee.externalAssessors.length,
      internal: committee.internalAssessors.length,
      secretary: committee.secretary?.name ?? null,
    },
  });

  revalidatePath('/admin/users/assessment-committee');
  return { ok: true };
}

export async function clearAssessmentCommittee(
  academicProgramId: string,
): Promise<CommitteeActionResult> {
  const actor = await authorizeAdmin();
  if (!actor) return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการได้' };

  const db = getAdminDb();
  const ref = db.collection('academicPrograms').doc(academicProgramId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'ไม่พบหลักสูตร' };

  const prev = (snap.data() as AcademicProgramDoc).assessmentCommittee ?? null;
  const before = prev
    ? internalIdentities({
        headAssessor: prev.headAssessor ?? null,
        internalAssessors: prev.internalAssessors ?? [],
        secretary: prev.secretary ?? null,
      })
    : { uids: new Set<string>(), allow: new Set<string>() };

  const batch = db.batch();
  batch.update(ref, { assessmentCommittee: FieldValue.delete() });
  for (const uid of before.uids)
    batch.update(db.collection('users').doc(uid), {
      'roles.assessorOfAcademicPrograms': FieldValue.arrayRemove(academicProgramId),
    });
  for (const id of before.allow)
    batch.update(db.collection('allowlist').doc(id), {
      presetAssessorAcademicProgramIds: FieldValue.arrayRemove(academicProgramId),
    });

  try {
    await batch.commit();
  } catch (err) {
    console.error('clearAssessmentCommittee failed', err);
    return { ok: false, error: 'ล้างข้อมูลไม่สำเร็จ — กรุณาลองใหม่' };
  }

  await db.collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: actor.uid,
    actorEmail: actor.email ?? null,
    action: 'assessment_committee_cleared',
    entityType: 'academicPrograms',
    entityId: academicProgramId,
    before: null,
    after: null,
  });

  revalidatePath('/admin/users/assessment-committee');
  return { ok: true };
}
