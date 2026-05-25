import 'server-only';
import { getAdminDb } from '@/lib/firebase/admin';
import type { AcademicProgramDoc, AllowlistDoc, UserDoc } from '@/lib/types/models';

export type AssignmentPersonKind = 'user' | 'allowlist';
export type AssignmentPersonStatus = 'active' | 'inactive' | 'pending';

export interface AssignmentPerson {
  key: string;
  kind: AssignmentPersonKind;
  userId: string | null;
  allowlistId: string | null;
  email: string;
  nameTh: string;
  status: AssignmentPersonStatus;
}

export interface AcademicProgramAssignmentRow {
  id: string;
  code: string;
  nameTh: string;
  director: AssignmentPerson | null;
  directors: AssignmentPerson[];
  lecturers: AssignmentPerson[];
}

export interface ProgramAssignmentData {
  programs: { id: string; code: string; nameTh: string }[];
  people: AssignmentPerson[];
  rows: AcademicProgramAssignmentRow[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function personLabel(a: AssignmentPerson, b: AssignmentPerson): number {
  return (a.nameTh || a.email).localeCompare(b.nameTh || b.email, 'th');
}

function deriveAcademicProgramIds(
  academicIds: string[] | undefined,
  curriculumIds: string[] | undefined,
  curriculumToAcademicProgram: Map<string, string>,
): string[] {
  if (academicIds?.length) return unique(academicIds);
  return unique(
    (curriculumIds ?? [])
      .map((id) => curriculumToAcademicProgram.get(id))
      .filter((id): id is string => Boolean(id)),
  );
}

async function getCurriculumToAcademicProgram(): Promise<Map<string, string>> {
  const snap = await getAdminDb().collection('programs').get();
  const map = new Map<string, string>();
  snap.docs.forEach((doc) => {
    const parentProgramId = doc.data().parentProgramId;
    if (typeof parentProgramId === 'string' && parentProgramId) {
      map.set(doc.id, parentProgramId);
    }
  });
  return map;
}

export async function getProgramAssignmentData(): Promise<ProgramAssignmentData> {
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
  const directorByProgram = new Map<string, AssignmentPerson[]>();
  const lecturersByProgram = new Map<string, AssignmentPerson[]>();

  function addRole(
    map: Map<string, AssignmentPerson[]>,
    programIds: string[],
    person: AssignmentPerson,
  ) {
    programIds.forEach((programId) => {
      const list = map.get(programId) ?? [];
      if (!list.some((p) => p.key === person.key)) list.push(person);
      map.set(programId, list);
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
    const directorIds = deriveAcademicProgramIds(
      data.roles?.directorOfAcademicPrograms,
      data.roles?.directorOf,
      curriculumToAcademicProgram,
    );
    const lecturerIds = deriveAcademicProgramIds(
      undefined,
      data.roles?.lecturerOf,
      curriculumToAcademicProgram,
    );
    addRole(directorByProgram, directorIds, person);
    addRole(lecturersByProgram, lecturerIds, person);
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

    const directorAcademicIds = unique([
      ...(data.presetDirectorAcademicProgramIds ?? []),
      ...(data.presetIsDirector && data.presetDirectorProgramId
        ? [
            curriculumToAcademicProgram.get(data.presetDirectorProgramId) ??
              data.presetDirectorProgramId,
          ]
        : []),
    ]);
    const lecturerAcademicIds = unique(data.presetLecturerAcademicProgramIds ?? []);
    addRole(directorByProgram, directorAcademicIds, person);
    addRole(lecturersByProgram, lecturerAcademicIds, person);
  });

  const rows = programs.map((program) => {
    const directors = [...(directorByProgram.get(program.id) ?? [])].sort(personLabel);
    const lecturers = [...(lecturersByProgram.get(program.id) ?? [])].sort(personLabel);
    return {
      ...program,
      director: directors[0] ?? null,
      directors,
      lecturers,
    };
  });

  return {
    programs,
    people: [...peopleByKey.values()].sort(personLabel),
    rows,
  };
}
