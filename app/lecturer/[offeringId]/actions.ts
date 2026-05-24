'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/auth-server';
import {
  createNotifications,
  getProgramAssessorIds,
  notifySafely,
} from '@/lib/data/notifications';
import type { AiReportDoc, OfferingDoc } from '@/lib/types/models';

type SendResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendOfferingForAssessment(
  offeringId: string,
): Promise<SendResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const db = getAdminDb();
  const offeringRef = db.collection('offerings').doc(offeringId);
  const now = FieldValue.serverTimestamp();

  let notificationPayload: {
    programId: string;
    courseCode: string;
  } | null = null;

  try {
    await db.runTransaction(async (tx) => {
      const offeringSnap = await tx.get(offeringRef);
      if (!offeringSnap.exists) {
        throw new Error('offering_not_found');
      }

      const offering = offeringSnap.data() as OfferingDoc;
      if (offering.isActive === false) {
        throw new Error('offering_not_found');
      }
      if (offering.lecturerId !== user.uid) {
        throw new Error('not_authorized');
      }
      if (offering.status !== 'ai_complete') {
        throw new Error(
          ['pending_assessment', 'assessor_review', 'assessed'].includes(
            offering.status,
          )
            ? 'already_sent'
            : 'invalid_status',
        );
      }
      if (!offering.latestAiReportId) {
        throw new Error('missing_ai_report');
      }

      const reportRef = offeringRef
        .collection('aiReports')
        .doc(offering.latestAiReportId);
      const reportSnap = await tx.get(reportRef);
      if (!reportSnap.exists) {
        throw new Error('missing_ai_report');
      }
      const report = reportSnap.data() as AiReportDoc;
      if (report.status !== 'succeeded') {
        throw new Error('ai_report_not_ready');
      }

      tx.update(offeringRef, {
        status: 'pending_assessment',
        updatedAt: now,
        updatedBy: user.uid,
      });
      tx.set(db.collection('auditLog').doc(), {
        occurredAt: now,
        actorId: user.uid,
        actorEmail: user.email,
        action: 'send_for_assessment',
        entityType: 'offerings',
        entityId: offeringId,
        before: { status: offering.status },
        after: {
          status: 'pending_assessment',
          latestAiReportId: offering.latestAiReportId,
        },
      });

      notificationPayload = {
        programId: offering.programId,
        courseCode: offering.courseCode,
      };
    });
  } catch (err) {
    return { ok: false, error: mapSendError(err) };
  }

  if (notificationPayload) {
    const { programId, courseCode } = notificationPayload;
    await notifySafely(
      getProgramAssessorIds(programId).then((ids) =>
        createNotifications(ids, {
          type: 'course_ready_for_review',
          title: 'มีรายวิชารอการทวนสอบ',
          body: `รายวิชา ${courseCode} พร้อมให้ทวนสอบแล้ว`.trim(),
          relatedOfferingId: offeringId,
        }),
      ),
    );
  }

  revalidatePath('/lecturer');
  revalidatePath(`/lecturer/${offeringId}`);
  revalidatePath('/assessor');
  return { ok: true };
}

function mapSendError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const map: Record<string, string> = {
    not_authenticated: 'กรุณาเข้าสู่ระบบอีกครั้ง',
    offering_not_found: 'ไม่พบรายวิชานี้',
    not_authorized: 'ท่านไม่ใช่อาจารย์ผู้รับผิดชอบรายวิชานี้',
    already_sent: 'ส่งผลให้ผู้ทวนสอบแล้ว',
    invalid_status: 'รายวิชายังไม่พร้อมส่งให้ผู้ทวนสอบ',
    missing_ai_report: 'ไม่พบรายงาน AI ที่พร้อมส่ง',
    ai_report_not_ready: 'รายงาน AI ยังไม่พร้อมส่งให้ผู้ทวนสอบ',
  };
  return map[message] ?? 'ส่งผลเพื่อทวนสอบไม่สำเร็จ';
}
