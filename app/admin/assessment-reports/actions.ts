'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, getAdminStorage } from '@/lib/firebase/admin';
import { getSessionUser, getCurrentProfile, isImpersonating } from '@/lib/firebase/auth-server';
import { COMMITTEE_ROLES, REPORT_THRESHOLD, formatThaiMeeting } from '@/lib/constants';
import {
  academicProgramLabel,
  buildAllProgramsSnapshot,
  buildReportSnapshot,
  reportDocId,
} from '@/lib/data/assessmentReports';
import { getManagedAcademicPrograms } from '@/lib/data/offeringManager';
import {
  ALL_PROGRAMS_ID,
  type ReportCommitteeMember,
  type ReportCoverage,
  type ReportScope,
  type ReportSnapshot,
  type Semester,
} from '@/lib/types/models';

const ALL_PROGRAMS_LABEL = 'ทุกหลักสูตร (ทั้งสำนักวิชา)';

export interface CreateReportInput {
  academicProgramId: string;
  coverage?: ReportCoverage;
  academicYear: number;
  scope: ReportScope;
  semester: Semester | null;
  header: {
    venue: string;
    meetingDate: string; // yyyy-mm-dd (Gregorian)
    meetingStartTime: string; // HH:mm
    meetingEndTime: string; // HH:mm
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
  if (await isImpersonating()) {
    return { ok: false, error: 'อยู่ในโหมดดูมุมมองผู้ใช้ (อ่านอย่างเดียว)' };
  }

  const coverage: ReportCoverage = input.coverage === 'all' ? 'all' : 'program';
  // School-wide reports are admin/super-admin only.
  if (coverage === 'all') {
    if (!access.isAdmin) return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' };
  } else if (!canAccess(access, input.academicProgramId)) {
    return { ok: false, error: 'ไม่มีสิทธิ์ในหลักสูตรนี้' };
  }

  if (input.scope === 'semester' && !input.semester)
    return { ok: false, error: 'กรุณาระบุภาคการศึกษา' };

  const committee = input.header.committee
    .map((m) => ({
      name: m.name.trim(),
      role: m.role.trim(),
      ...(m.uid ? { uid: m.uid } : {}),
    }))
    .filter((m) => m.name.length > 0);
  if (committee.length === 0)
    return { ok: false, error: 'กรุณาระบุรายชื่อคณะกรรมการอย่างน้อย 1 คน' };
  if (committee.some((m) => !(COMMITTEE_ROLES as readonly string[]).includes(m.role)))
    return { ok: false, error: 'ตำแหน่งคณะกรรมการไม่ถูกต้อง' };
  const names = committee.map((m) => m.name.toLowerCase());
  if (new Set(names).size !== names.length)
    return { ok: false, error: 'มีรายชื่อคณะกรรมการซ้ำกัน กรุณาตรวจสอบอีกครั้ง' };

  const meetingDateTime = formatThaiMeeting(
    input.header.meetingDate,
    input.header.meetingStartTime,
    input.header.meetingEndTime,
  );

  const semester = input.scope === 'annual' ? null : input.semester;
  const academicProgramId = coverage === 'all' ? ALL_PROGRAMS_ID : input.academicProgramId;

  const id = reportDocId(academicProgramId, input.academicYear, input.scope, semester);
  const ref = getAdminDb().collection('assessmentSummaryReports').doc(id);
  const existing = await ref.get();

  // Directors get one generation per row; admins bypass. A locked report must
  // be reset by an admin (or deleted) before a director can regenerate.
  if (!access.isAdmin && existing.exists) {
    const prev = existing.data() as { directorLocked?: boolean };
    if (prev.directorLocked === true)
      return {
        ok: false,
        error: 'ได้สร้างรายงานสำหรับรอบนี้แล้ว กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตก่อนสร้างใหม่',
      };
  }

  // Recompute the snapshot server-side and re-check the 25% gate so the
  // threshold can't be bypassed from the client.
  let snapshot: ReportSnapshot;
  let label: string;
  if (coverage === 'all') {
    const { programs } = await getManagedAcademicPrograms({
      roles: { isAdmin: true },
    });
    snapshot = await buildAllProgramsSnapshot(
      programs.map((p) => ({ id: p.id, code: p.code, nameTh: p.nameTh })),
      input.academicYear,
      input.scope,
      semester,
    );
    label = ALL_PROGRAMS_LABEL;
  } else {
    snapshot = await buildReportSnapshot(
      input.academicProgramId,
      input.academicYear,
      input.scope,
      semester,
    );
    label = await academicProgramLabel(input.academicProgramId);
  }

  if (snapshot.totalOfferings === 0)
    return { ok: false, error: 'ไม่มีรายวิชาที่เปิดสอนในช่วงที่เลือก' };
  if (snapshot.assessedOfferings / snapshot.totalOfferings < REPORT_THRESHOLD)
    return {
      ok: false,
      error: `ต้องทวนสอบอย่างน้อย ${Math.round(REPORT_THRESHOLD * 100)}% ของรายวิชาก่อนจึงจะสร้างรายงานได้`,
    };

  const now = FieldValue.serverTimestamp();
  await ref.set(
    {
      academicProgramId,
      academicProgramLabel: label,
      coverage,
      academicYear: input.academicYear,
      scope: input.scope,
      semester,
      header: {
        venue: input.header.venue.trim(),
        meetingDateTime,
        meetingDate: input.header.meetingDate,
        meetingStartTime: input.header.meetingStartTime,
        meetingEndTime: input.header.meetingEndTime,
        committee,
      },
      snapshot,
      // A report now exists for this row — lock directors to one generation.
      directorLocked: true,
      // Syntheses + artifacts are produced in the generation phase.
      aiSynthesis: null,
      assessorSynthesis: null,
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

export type ResetReportResult = { ok: true } | { ok: false; error: string };

/** Admin/super-admin only — re-arm a program director to generate the report
 *  for this row again. Keeps the existing report and its PDF intact. */
export async function resetReport(reportId: string): Promise<ResetReportResult> {
  const access = await resolveAccess();
  if (!access) return { ok: false, error: 'ไม่มีสิทธิ์ดำเนินการ' };
  if (!access.isAdmin) return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' };

  const ref = getAdminDb().collection('assessmentSummaryReports').doc(reportId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'ไม่พบรายงาน' };

  const now = FieldValue.serverTimestamp();
  await ref.update({ directorLocked: false, updatedAt: now, updatedBy: access.uid });

  const data = snap.data() as { academicProgramId: string };
  await getAdminDb().collection('auditLog').add({
    occurredAt: now,
    actorId: access.uid,
    actorEmail: access.email,
    action: 'reset',
    entityType: 'assessmentSummaryReports',
    entityId: reportId,
    before: { academicProgramId: data.academicProgramId, directorLocked: true },
    after: { directorLocked: false },
  });

  revalidatePath('/admin/assessment-reports');
  return { ok: true };
}

export type DeleteReportResult = { ok: true } | { ok: false; error: string };

/** Delete a report and best-effort remove its stored PDF/DOCX artifacts. */
export async function deleteAssessmentReport(
  reportId: string,
): Promise<DeleteReportResult> {
  const access = await resolveAccess();
  if (!access) return { ok: false, error: 'ไม่มีสิทธิ์ดำเนินการ' };
  // Admin/super-admin only — keeps the director's one-generation lock airtight
  // (a director must not delete-then-recreate to bypass it).
  if (!access.isAdmin) return { ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้น' };

  const ref = getAdminDb().collection('assessmentSummaryReports').doc(reportId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'ไม่พบรายงาน' };
  const data = snap.data() as {
    academicProgramId: string;
    pdfStoragePath: string | null;
    docxStoragePath: string | null;
  };

  // Best-effort artifact cleanup — never block the delete on storage errors.
  const bucket = getAdminStorage().bucket();
  await Promise.allSettled(
    [data.pdfStoragePath, data.docxStoragePath]
      .filter((p): p is string => !!p)
      .map((p) => bucket.file(p).delete()),
  );

  await ref.delete();

  await getAdminDb().collection('auditLog').add({
    occurredAt: FieldValue.serverTimestamp(),
    actorId: access.uid,
    actorEmail: access.email,
    action: 'delete',
    entityType: 'assessmentSummaryReports',
    entityId: reportId,
    before: { academicProgramId: data.academicProgramId },
    after: null,
  });

  revalidatePath('/admin/assessment-reports');
  return { ok: true };
}
