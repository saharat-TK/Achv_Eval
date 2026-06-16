import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getCurrentProfile, getSessionUser, isImpersonating } from '@/lib/firebase/auth-server';
import type { OfferingStatus, VerificationDecision, VerificationDoc } from '@/lib/types/models';
import { createNotification, notifySafely } from '@/lib/data/notifications';

export const runtime = 'nodejs';

const DECISIONS: VerificationDecision[] = ['verified', 'needs_follow_up'];
const ALLOWED_STATUSES: OfferingStatus[] = ['assessed', 'verification_review'];

/**
 * POST /api/verification/submit
 *
 * Final verification committee sign-off after assessor review.
 *
 * Body: { offeringId, decision, committeeNotes?, requiredActions? }
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 403 });
  }
  if (await isImpersonating()) {
    return NextResponse.json({ error: 'read_only_impersonation' }, { status: 403 });
  }

  let body: {
    offeringId: string;
    decision: VerificationDecision;
    committeeNotes?: string;
    requiredActions?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { offeringId, decision } = body;
  const committeeNotes = body.committeeNotes?.trim() || null;
  const requiredActions = body.requiredActions?.trim() || null;

  if (!offeringId || !DECISIONS.includes(decision)) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (decision === 'needs_follow_up' && !requiredActions) {
    return NextResponse.json({ error: 'required_actions_missing' }, { status: 400 });
  }

  const db = getAdminDb();
  const offeringRef = db.collection('offerings').doc(offeringId);
  const offeringSnap = await offeringRef.get();
  if (!offeringSnap.exists) {
    return NextResponse.json({ error: 'offering_not_found' }, { status: 404 });
  }

  const offering = offeringSnap.data()!;
  // Strict role-binding: signing a verification is committee-only. Admins
  // and directors who need to sign must be added to verifierOf.
  const canVerify = (profile.roles.verifierOf ?? []).includes(offering.programId);
  if (!canVerify) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }

  if (!ALLOWED_STATUSES.includes(offering.status)) {
    return NextResponse.json({ error: 'not_pending_verification' }, { status: 409 });
  }
  if (!offering.assessmentId) {
    return NextResponse.json({ error: 'assessment_required' }, { status: 409 });
  }

  const existing = await offeringRef
    .collection('verifications')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (!existing.empty && existing.docs[0].data()?.isLocked === true) {
    return NextResponse.json({ error: 'verification_locked' }, { status: 409 });
  }

  const now = FieldValue.serverTimestamp();
  const verificationData: Omit<VerificationDoc, 'createdAt' | 'updatedAt' | 'signedAt'> & {
    createdAt: any;
    updatedAt: any;
    signedAt: any;
  } = {
    offeringId,
    programId: offering.programId,
    aiReportId: offering.latestAiReportId ?? null,
    assessmentId: offering.assessmentId,
    verifierId: user.uid,
    verifierName: profile.nameTh,
    decision,
    committeeNotes,
    requiredActions,
    finalPdfStoragePath: null,
    finalPdfUrl: null,
    signedAt: now,
    isLocked: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    let verificationId: string;
    if (!existing.empty && existing.docs[0].data()?.isLocked !== true) {
      verificationId = existing.docs[0].id;
      const { createdAt: _, ...updateData } = verificationData;
      await offeringRef
        .collection('verifications')
        .doc(verificationId)
        .update(updateData);
    } else {
      const verificationRef = await offeringRef
        .collection('verifications')
        .add(verificationData);
      verificationId = verificationRef.id;
    }

    await offeringRef.update({
      status: decision,
      updatedAt: now,
      updatedBy: user.uid,
    });

    await db.collection('auditLog').add({
      occurredAt: now,
      actorId: user.uid,
      actorEmail: user.email,
      action: 'final_verification_signed',
      entityType: 'verifications',
      entityId: verificationId,
      before: null,
      after: {
        offeringId,
        programId: offering.programId,
        decision,
        requiredActions,
      },
    });

    // Notify the lecturer of the committee's decision (non-fatal).
    if (offering.lecturerId) {
      const courseCode = (offering.courseCode as string | undefined) ?? '';
      await notifySafely(
        createNotification({
          recipientId: offering.lecturerId,
          type: decision === 'verified' ? 'verification_completed' : 'verification_follow_up',
          title:
            decision === 'verified'
              ? 'ผลการทวนสอบได้รับการรับรอง'
              : 'ผลการทวนสอบ — ต้องติดตาม',
          body:
            decision === 'verified'
              ? `รายวิชา ${courseCode} ได้รับการรับรองผลขั้นสุดท้าย`.trim()
              : `รายวิชา ${courseCode}: ${requiredActions ?? 'มีรายการที่ต้องติดตาม'}`.trim(),
          relatedOfferingId: offeringId,
        }),
      );
    }

    return NextResponse.json({ ok: true, verificationId });
  } catch (err: any) {
    console.error('verification submit error', err);
    return NextResponse.json(
      { error: err.message || 'write_failed' },
      { status: 500 },
    );
  }
}
