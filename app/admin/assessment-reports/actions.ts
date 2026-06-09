'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile } from '@/lib/firebase/auth-server';
import { REPORT_THRESHOLD } from '@/lib/constants';
import {
  academicProgramLabel,
  buildReportSnapshot,
  reportDocId,
} from '@/lib/data/assessmentReports';
import type {
  ReportCommitteeMember,
  ReportScope,
  Semester,
} from '@/lib/types/models';

export interface CreateReportInput {
  academicProgramId: string;
  academicYear: number;
  scope: ReportScope;
  semester: Semester | null;
  header: {
    venue: string;
    meetingDateTime: string;
    committee: ReportCommitteeMember[];
  };
}

export type CreateReportResult =
  | { ok: true; reportId: string }
  | { ok: false; error: string };

interface Access {
  uid: string;
  email: string | null;
  isAdmin: boolean;
  allowed: Set<string>;
}

async function resolveAccess(): Promise<Access | null> {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();
  if (!user || !profile) return null;
  const isAdmin = profile.roles.isAdmin === true;
  const allowed = new Set(profile.roles.directorOfAcademicPrograms ?? []);
  if (!isAdmin && allowed.size === 0) return null;
  return { uid: user.uid, email: user.email ?? null, isAdmin, allowed };
}

function canAccess(access: Access, academicProgramId: string): boolean {
  return access.isAdmin || access.allowed.has(academicProgramId);
}

export async function createAssessmentReport(
  input: CreateReportInput,
): Promise<CreateReportResult> {
  const access = await resolveAccess();
  if (!access) return { ok: false, error: 'ไม่มีสิทธิ์ดำเนินการ' };
  if (!canAccess(access, input.academicProgramId))
    return { ok: false, error: 'ไม่มีสิทธิ์ในหลักสูตรนี้' };

  if (input.scope === 'semester' && !input.semester)
    return { ok: false, error: 'กรุณาระบุภาคการศึกษา' };

  const committee = input.header.committee
    .map((m) => ({ name: m.name.trim(), role: m.role.trim() }))
    .filter((m) => m.name.length > 0);
  if (committee.length === 0)
    return { ok: false, error: 'กรุณาระบุรายชื่อคณะกรรมการอย่างน้อย 1 คน' };

  const semester = input.scope === 'annual' ? null : input.semester;

  // Recompute the snapshot server-side and re-check the 25% gate so the
  // threshold can't be bypassed from the client.
  const snapshot = await buildReportSnapshot(
    input.academicProgramId,
    input.academicYear,
    input.scope,
    semester,
  );
  if (snapshot.totalOfferings === 0)
    return { ok: false, error: 'ไม่มีรายวิชาที่เปิดสอนในช่วงที่เลือก' };
  if (snapshot.assessedOfferings / snapshot.totalOfferings < REPORT_THRESHOLD)
    return {
      ok: false,
      error: `ต้องทวนสอบอย่างน้อย ${Math.round(REPORT_THRESHOLD * 100)}% ของรายวิชาก่อนจึงจะสร้างรายงานได้`,
    };

  const label = await academicProgramLabel(input.academicProgramId);
  const id = reportDocId(input.academicProgramId, input.academicYear, input.scope, semester);
  const ref = getAdminDb().collection('assessmentSummaryReports').doc(id);
  const existing = await ref.get();

  const now = FieldValue.serverTimestamp();
  await ref.set(
    {
      academicProgramId: input.academicProgramId,
      academicProgramLabel: label,
      academicYear: input.academicYear,
      scope: input.scope,
      semester,
      header: { venue: input.header.venue.trim(), meetingDateTime: input.header.meetingDateTime.trim(), committee },
      snapshot,
      // Section 3.2 + artifacts are produced in the generation phase.
      aiSynthesis: null,
      status: 'draft',
      pdfStoragePath: null,
      pdfUrl: null,
      docxStoragePath: null,
      docxUrl: null,
      generatedAt: null,
      ...(existing.exists ? {} : { createdAt: now, createdBy: access.uid }),
      updatedAt: now,
      updatedBy: access.uid,
    },
    { merge: true },
  );

  await getAdminDb().collection('auditLog').add({
    occurredAt: now,
    actorId: access.uid,
    actorEmail: access.email,
    action: existing.exists ? 'update' : 'create',
    entityType: 'assessmentSummaryReports',
    entityId: id,
    before: null,
    after: {
      academicProgramId: input.academicProgramId,
      academicYear: input.academicYear,
      scope: input.scope,
      semester,
      assessedOfferings: snapshot.assessedOfferings,
      totalOfferings: snapshot.totalOfferings,
    },
  });

  revalidatePath('/admin/assessment-reports');
  revalidatePath(`/admin/assessment-reports/${id}`);
  return { ok: true, reportId: id };
}
