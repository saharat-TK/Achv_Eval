import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  getProgramAssignmentData,
  type AssignmentPerson,
} from '@/lib/data/programAssignments';
import type {
  AcademicProgramDoc,
  AssessmentCommitteeMember,
} from '@/lib/types/models';

/** Serializable committee slots (no Firestore Timestamp) for the client. */
export interface CommitteeSlots {
  headAssessor: AssessmentCommitteeMember | null;
  externalAssessors: AssessmentCommitteeMember[];
  internalAssessors: AssessmentCommitteeMember[];
  secretary: AssessmentCommitteeMember | null;
}

export interface CommitteeProgramRow {
  id: string;
  code: string;
  nameTh: string;
  /** Saved committee, or null when none has been assigned yet. */
  committee: CommitteeSlots | null;
  /** Internal-assessor candidates — this program's assigned lecturers. */
  lecturers: AssignmentPerson[];
}

export interface AssessmentCommitteeData {
  /** Full directory (users + allowlist) for head / external / secretary pickers. */
  people: AssignmentPerson[];
  rows: CommitteeProgramRow[];
}

const member = (m: AssessmentCommitteeMember | null | undefined) =>
  m && m.name
    ? { name: m.name, ...(m.uid ? { uid: m.uid } : {}), ...(m.allowlistId ? { allowlistId: m.allowlistId } : {}) }
    : null;

/** Committee tab data. Reuses the program-assignment roster + per-program
 *  lecturer lists, and layers each program's saved assessment committee on top. */
export async function getAssessmentCommitteeData(): Promise<AssessmentCommitteeData> {
  const base = await getProgramAssignmentData();
  const snap = await getAdminDb().collection('academicPrograms').get();

  const committeeById = new Map<string, CommitteeSlots | null>();
  snap.docs.forEach((d) => {
    const c = (d.data() as AcademicProgramDoc).assessmentCommittee;
    committeeById.set(
      d.id,
      c
        ? {
            headAssessor: member(c.headAssessor),
            externalAssessors: (c.externalAssessors ?? []).map(member).filter(Boolean) as AssessmentCommitteeMember[],
            internalAssessors: (c.internalAssessors ?? []).map(member).filter(Boolean) as AssessmentCommitteeMember[],
            secretary: member(c.secretary),
          }
        : null,
    );
  });

  return {
    people: base.people,
    rows: base.rows.map((r) => ({
      id: r.id,
      code: r.code,
      nameTh: r.nameTh,
      committee: committeeById.get(r.id) ?? null,
      lecturers: r.lecturers,
    })),
  };
}

export type CommitteePosition = 'head' | 'internal' | 'secretary';

export interface CommitteeMembership {
  programId: string;
  code: string;
  nameTh: string;
  position: CommitteePosition;
}

/**
 * Per-user assessment-committee memberships, keyed by uid, derived from every
 * program's `assessmentCommittee`. Only the internal roles carry a uid (external
 * assessors are names). Source of truth for the users tab's assessor display.
 */
export async function getCommitteeMembershipsByUser(): Promise<
  Record<string, CommitteeMembership[]>
> {
  const snap = await getAdminDb().collection('academicPrograms').get();
  const out: Record<string, CommitteeMembership[]> = {};
  const add = (
    uid: string | undefined,
    base: { programId: string; code: string; nameTh: string },
    position: CommitteePosition,
  ) => {
    if (!uid) return;
    (out[uid] ??= []).push({ ...base, position });
  };
  snap.docs.forEach((d) => {
    const c = (d.data() as AcademicProgramDoc).assessmentCommittee;
    if (!c) return;
    const data = d.data() as AcademicProgramDoc;
    const base = { programId: d.id, code: data.code, nameTh: data.nameTh };
    add(c.headAssessor?.uid, base, 'head');
    (c.internalAssessors ?? []).forEach((m) => add(m.uid, base, 'internal'));
    add(c.secretary?.uid, base, 'secretary');
  });
  return out;
}
