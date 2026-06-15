import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  deriveAcademicProgramIds,
  getCurriculumToAcademicProgram,
  personLabel,
  unique,
  type AssignmentPerson,
} from '@/lib/data/programAssignments';
import type { AcademicProgramDoc, AllowlistDoc, UserDoc } from '@/lib/types/models';

export interface VerificationProgramRow {
  id: string;
  code: string;
  nameTh: string;
  /** Members of this program's results-certification committee (คณะกรรมการรับรองผล). */
  verifiers: AssignmentPerson[];
}

export interface VerificationCommitteeData {
  /** Full directory (active/inactive users + pending allowlist) for the picker. */
  people: AssignmentPerson[];
  rows: VerificationProgramRow[];
}

/**
 * Verification-committee tab data. Mirrors the program-assignment roster
 * pattern: the directory is the union of users and unconsumed allowlist
 * entries, and each program's verifier list is derived from
 * `roles.verifierOfAcademicPrograms` (users) and
 * `presetVerifierAcademicProgramIds` (pending allowlist members), with the
 * legacy `verifierOf` curriculum mirror expanded back to academic programs.
 */
export async function getVerificationCommitteeData(): Promise<VerificationCommitteeData> {
  const db = getAdminDb();
  const [programSnap, userSnap, allowSnap, curriculumToAcademicProgram] =
    await Promise.all([
      db.collection('academicPrograms').orderBy('code').get(),
      db.collection('users').orderBy('email').get(),
      db.collection('allowlist').orderBy('email').get(),
      getCurriculumToAcademicProgram(),
    ]);

  const programs = programSnap.docs.map((doc) => {
    const data = doc.data() as AcademicProgramDoc;
    return { id: doc.id, code: data.code, nameTh: data.nameTh };
  });

  const peopleByKey = new Map<string, AssignmentPerson>();
  const verifiersByProgram = new Map<string, AssignmentPerson[]>();

  function addVerifier(programIds: string[], person: AssignmentPerson) {
    programIds.forEach((programId) => {
      const list = verifiersByProgram.get(programId) ?? [];
      if (!list.some((p) => p.key === person.key)) list.push(person);
      verifiersByProgram.set(programId, list);
    });
  }

  userSnap.docs.forEach((doc) => {
    const data = doc.data() as UserDoc;
    const person: AssignmentPerson = {
      key: `user:${doc.id}`,
      kind: 'user',
      userId: doc.id,
      allowlistId: null,
      email: data.email,
      nameTh: data.nameTh || data.email,
      status: data.isActive === false ? 'inactive' : 'active',
    };
    peopleByKey.set(person.key, person);
    const verifierIds = deriveAcademicProgramIds(
      data.roles?.verifierOfAcademicPrograms,
      data.roles?.verifierOf,
      curriculumToAcademicProgram,
    );
    addVerifier(verifierIds, person);
  });

  allowSnap.docs.forEach((doc) => {
    const data = doc.data() as AllowlistDoc;
    if (data.consumedAt) return;
    const person: AssignmentPerson = {
      key: `allowlist:${doc.id}`,
      kind: 'allowlist',
      userId: null,
      allowlistId: doc.id,
      email: data.email,
      nameTh: data.nameTh || data.email,
      status: 'pending',
    };
    peopleByKey.set(person.key, person);
    addVerifier(unique(data.presetVerifierAcademicProgramIds ?? []), person);
  });

  const rows = programs.map((program) => ({
    ...program,
    verifiers: [...(verifiersByProgram.get(program.id) ?? [])].sort(personLabel),
  }));

  return {
    people: [...peopleByKey.values()].sort(personLabel),
    rows,
  };
}
