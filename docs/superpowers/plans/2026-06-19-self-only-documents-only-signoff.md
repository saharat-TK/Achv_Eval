# Self-Only and Documents-Only Signoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let assessor heads close out offerings as committee-assessed, self-assessment-only, or documents-only while keeping all signed-off courses visible and all score metrics committee-only.

**Architecture:** Add two workflow statuses and one durable `AssessmentDoc.signOffKind` discriminator. Route all count/list visibility through shared signed-off status constants, and route all score averages, band distributions, recurring weaknesses, topic summaries, and rubric PDF sections through a shared committee-only predicate. The assessor UI/API owns the signoff kind; Cloud Functions render the matching PDF shape.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firebase Auth, Cloud Firestore/Admin SDK, Cloud Functions v2, Firebase Storage, Tailwind CSS.

---

## Current Branch Context

The branch `feat-self-only-signoff` already contains partial edits in:

- `app/api/assessor/submit/route.ts`
- `app/assessor/[offeringId]/page.tsx`
- `lib/constants.ts`
- `lib/data/implementationReviews.ts`
- `lib/data/verifications.ts`
- `lib/types/models.ts`

Do not overwrite those blindly. Start by reconciling them with this plan. Treat missing `AssessmentDoc.signOffKind` as `'committee'` for legacy signed assessments.

## Files And Responsibilities

- `lib/types/models.ts`: Firestore document types, `OfferingStatus`, `SignOffKind`, and rubric result helper.
- `lib/constants.ts`: Thai labels, assessor queue statuses, signed-off status buckets, and signoff kind helpers.
- `app/api/assessor/submit/route.ts`: server-authoritative transition validation, assessment persistence, audit logs, notifications.
- `components/AssessmentForm.tsx`: assessor/head UI for choosing signoff kind and hiding rubric sections when not committee-assessed.
- `app/assessor/[offeringId]/page.tsx`: page guard for assessor-visible statuses.
- `lib/data/assessments.ts`: assessor queue source.
- `lib/data/verifications.ts`: verification queue; self-only flows forward, documents-only does not.
- `lib/data/implementationReviews.ts`: next-semester follow-up queue; self-only flows forward like committee-assessed.
- `functions/src/generateCombinedReport.ts`: signed combined/minimal PDF data loading and generation.
- `functions/src/assessmentHtml.ts`: combined report HTML composition by signoff kind.
- `functions/src/reportShared.ts`: reusable PDF renderers and cover indicator.
- `lib/data/assessmentReports.ts`: frozen assessment summary snapshots and course rows.
- `functions/src/assessmentSummaryReport.ts`: summary PDF appendix collection.
- `functions/src/assessmentSummaryHtml.ts`: summary PDF rendering of listed non-committee rows.
- `lib/data/dashboard.ts`: executive dashboard filters, counts, score-only metrics.
- `lib/utils/dashboardConsolidate.ts`: academic-program consolidation.
- `components/DashboardFilterBar.tsx`: dashboard status filter.
- `app/admin/dashboard/page.tsx`: dashboard search params, metric card order, all-status display.
- `app/admin/dashboard/print/page.tsx`: printable dashboard filter pass-through.
- `app/api/dashboard/export/route.ts`: CSV dashboard filter pass-through.
- `app/verification/page.tsx`: verification queue copy/counts that must include self-only where appropriate.
- `app/lecturer/[offeringId]/page.tsx`: lecturer access to signed report for new final statuses.
- `components/AssessmentReportsClient.tsx`: report list coverage counts and score display.
- `components/CourseListByProgram.tsx`: report course list score display.
- `components/OfferingManagerClient.tsx` and `app/admin/offering-manager/actions.ts`: reset/edit protections for final statuses.

## Shared Invariants

- `signOffKind === 'committee'` or missing means a normal 7-item committee assessment.
- `signOffKind === 'self_only'` means the lecturer self-assessment was accepted/closed out, but no committee rubric scoring exists for official metrics.
- `signOffKind === 'documents_only'` means documents were received and the course was closed without AI/report/rubric assessment.
- `assessed_self_only` flows into verification like `assessed`.
- `closed_documents_only` does not flow into verification.
- Signed-off counts include `assessed`, `assessed_self_only`, `closed_documents_only`, and downstream assessed states.
- Score averages, band counts, recurring weaknesses, weakest rubric items, topic summaries, and percent/band display use only committee assessments.

## Task 1: Centralize Status And Signoff Semantics

**Files:**
- Modify: `lib/types/models.ts`
- Modify: `lib/constants.ts`

- [ ] **Step 1: Reconcile current partial model edits**

Run:

```bash
git diff -- lib/types/models.ts lib/constants.ts
```

Expected: existing partial edits show `assessed_self_only`, `closed_documents_only`, `AssessmentDoc.signOffKind`, and `SIGNED_OFF_STATUSES`. Keep those ideas, but centralize the type and helpers as below.

- [ ] **Step 2: Update `lib/types/models.ts` with shared `SignOffKind`**

Add the two statuses to `OfferingStatus` if they are not already present:

```ts
export type OfferingStatus =
  | 'draft'
  | 'documents_pending'
  | 'ready_for_ai'
  | 'ai_in_progress'
  | 'ai_complete'
  | 'pending_assessment'
  | 'assessor_review'
  | 'pending_head_signoff'
  | 'assessed'
  | 'assessed_self_only'
  | 'closed_documents_only'
  | 'verification_review'
  | 'verified'
  | 'needs_follow_up'
  | 'pending_review_next_semester'
  | 'implemented'
  | 'not_implemented';
```

Add this exported type near the model types:

```ts
export type SignOffKind = 'committee' | 'self_only' | 'documents_only';
```

Update `AssessmentDoc`:

```ts
export interface AssessmentDoc {
  // existing fields...
  signOffKind?: SignOffKind;
  committeeSnapshot?: { name: string; position: string }[];
}
```

- [ ] **Step 3: Update `lib/constants.ts` with all shared buckets and predicates**

Import `SignOffKind`:

```ts
import type { OfferingStatus, SignOffKind } from '@/lib/types/models';
```

Ensure `OFFERING_STATUS` includes:

```ts
assessed_self_only: { labelTh: 'ทวนสอบ (ประเมินตนเอง)', tone: 'green' },
closed_documents_only: { labelTh: 'ปิดรายการ (เอกสารเท่านั้น)', tone: 'slate' },
```

Replace or add these exported constants/helpers:

```ts
export const SIGN_OFF_KINDS: SignOffKind[] = [
  'committee',
  'self_only',
  'documents_only',
];

export const ASSESSOR_OFFERING_STATUSES: OfferingStatus[] = [
  'documents_pending',
  'pending_assessment',
  'assessor_review',
  'pending_head_signoff',
  'assessed',
  'assessed_self_only',
  'closed_documents_only',
];

export const SIGNED_OFF_STATUSES: OfferingStatus[] = [
  'assessed',
  'assessed_self_only',
  'closed_documents_only',
  'verification_review',
  'verified',
  'needs_follow_up',
  'pending_review_next_semester',
  'implemented',
  'not_implemented',
];

export const VERIFICATION_ENTRY_STATUSES: OfferingStatus[] = [
  'assessed',
  'assessed_self_only',
];

export function normalizeSignOffKind(value: unknown): SignOffKind {
  return SIGN_OFF_KINDS.includes(value as SignOffKind)
    ? (value as SignOffKind)
    : 'committee';
}

export function isCommitteeSignOff(value: unknown): boolean {
  return normalizeSignOffKind(value) === 'committee';
}

export function finalStatusForSignOffKind(kind: SignOffKind): OfferingStatus {
  if (kind === 'self_only') return 'assessed_self_only';
  if (kind === 'documents_only') return 'closed_documents_only';
  return 'assessed';
}
```

- [ ] **Step 4: Run typecheck and note expected failures**

Run:

```bash
npm run typecheck
```

Expected: typecheck may fail on exhaustive status maps such as `STATUS_ORDER` until later tasks add the new statuses everywhere. Do not fix unrelated lint/style issues in this task.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/types/models.ts lib/constants.ts
git commit -m "feat: add signoff status semantics"
```

## Task 2: Make The Assessor API The Source Of Truth

**Files:**
- Modify: `app/api/assessor/submit/route.ts`

- [ ] **Step 1: Replace route-local signoff unions with shared helpers**

At the top of `app/api/assessor/submit/route.ts`, import:

```ts
import {
  SIGN_OFF_KINDS,
  finalStatusForSignOffKind,
  normalizeSignOffKind,
} from '@/lib/constants';
import type { OfferingStatus, SignOffKind } from '@/lib/types/models';
```

Remove route-local `type SignOffKind = ...` and route-local `SIGN_OFF_KINDS` if present.

- [ ] **Step 2: Allow `documents_pending` in the API status gate**

Ensure:

```ts
const ASSESSMENT_ALLOWED_STATUSES: OfferingStatus[] = [
  'documents_pending',
  'pending_assessment',
  'assessor_review',
  'pending_head_signoff',
  'assessed',
  'assessed_self_only',
  'closed_documents_only',
];
```

- [ ] **Step 3: Parse signoff kind by status**

After `preSubmit`, add:

```ts
const docsStage = status === 'documents_pending';
const signOffKind: SignOffKind = docsStage
  ? 'documents_only'
  : normalizeSignOffKind(body.signOffKind);
const committeeKind = signOffKind === 'committee';
const selfOnlyKind = signOffKind === 'self_only';
const documentsOnlyKind = signOffKind === 'documents_only';
```

For non-documents stages, reject `documents_only` from the client:

```ts
if (!docsStage && documentsOnlyKind) {
  return NextResponse.json({ error: 'invalid_signoff_kind' }, { status: 400 });
}
```

- [ ] **Step 4: Keep the two-step flow but scope draft to committee assessment**

Use this transition gate:

```ts
if (action === 'draft') {
  if (!(free || isSecretaryActor)) return deny();
  if (!preSubmit || !committeeKind) return conflict();
} else if (action === 'submit') {
  if (!(free || isSecretaryActor)) return deny();
  if (!(preSubmit || docsStage)) return conflict();
  if (!committee.hasCommittee) return conflict();
} else if (action === 'sign') {
  if (!(free || role.isHead)) return deny();
  if (committee.hasCommittee && !free) {
    if (status !== 'pending_head_signoff') return conflict();
  } else if (!(preSubmit || docsStage || status === 'pending_head_signoff')) {
    return conflict();
  }
} else {
  if (!(free || role.isHead)) return deny();
  if (status !== 'pending_head_signoff') return conflict();
}
```

- [ ] **Step 5: Skip follow-up gate for non-committee signoffs**

Ensure the follow-up gate condition is exactly:

```ts
if (
  committeeKind &&
  (action === 'submit' || action === 'sign') &&
  offering.previousOfferingId
) {
  // existing previous assessment follow-up validation
}
```

- [ ] **Step 6: Persist assessment data without creating official rubric metrics for non-committee flows**

Keep `scores`, `comments`, and computed result for committee assessments. For non-committee flows, persist neutral rubric fields only because the existing `AssessmentDoc` type requires them; all reports must ignore them by `signOffKind`.

Use:

```ts
const persistedScores = committeeKind ? scores : DEFAULT_SCORES;
const persistedComments = committeeKind ? comments : {};
const result = computeRubricResult(persistedScores);
```

Then include:

```ts
scores: persistedScores,
comments: persistedComments,
totalScore: committeeKind ? result.totalScore : 0,
maxScore: committeeKind ? result.maxScore : 0,
percentScore: committeeKind ? result.percentScore : 0,
band: committeeKind ? result.band : 'improve',
signOffKind,
committeeSnapshot: lock && committeeKind ? committee.roster : undefined,
```

If this file currently constructs `assessmentData` with object spread, keep the local style but preserve these values.

- [ ] **Step 7: Set final status through the shared helper**

In the `action === 'sign'` branch:

```ts
const finalStatus = finalStatusForSignOffKind(signOffKind);
await offeringRef.update({
  status: finalStatus,
  assessmentId: docId,
  updatedAt: now,
  updatedBy: user.uid,
});
```

- [ ] **Step 8: Notify verifiers for committee and self-only, not documents-only**

Keep existing assessor/head notifications. For verification notifications:

```ts
documentsOnlyKind
  ? Promise.resolve()
  : getProgramVerifierIds(offering.programId).then((ids) =>
      createNotifications(ids, {
        type: 'verification_ready',
        title: 'มีรายวิชารอการรับรองผล',
        body: `รายวิชา ${courseCode} พร้อมรับรองผลขั้นสุดท้าย`.trim(),
        relatedOfferingId: offeringId,
      }),
    )
```

- [ ] **Step 9: Run a focused typecheck**

```bash
npm run typecheck
```

Expected: remaining failures are from UI/report/dashboard tasks, not this route's imports or types.

- [ ] **Step 10: Commit Task 2**

```bash
git add app/api/assessor/submit/route.ts
git commit -m "feat: support alternate assessor signoff transitions"
```

## Task 3: Update Assessor UI For Signoff Kind

**Files:**
- Modify: `app/assessor/[offeringId]/page.tsx`
- Modify: `components/AssessmentForm.tsx`

- [ ] **Step 1: Keep page visibility aligned with assessor queue**

In `app/assessor/[offeringId]/page.tsx`, ensure:

```ts
const ASSESSMENT_VISIBLE_STATUSES: OfferingStatus[] = [
  'documents_pending',
  'pending_assessment',
  'assessor_review',
  'pending_head_signoff',
  'assessed',
  'assessed_self_only',
  'closed_documents_only',
];
```

- [ ] **Step 2: Add client-side signoff type**

In `components/AssessmentForm.tsx`, import:

```ts
import type { SignOffKind } from '@/lib/types/models';
```

Add state after `status`:

```ts
const [signOffKind, setSignOffKind] = useState<SignOffKind>('self_only');
```

When a loaded assessment arrives, sync:

```ts
setSignOffKind(data.signOffKind ?? 'committee');
```

- [ ] **Step 3: Derive documents-only and committee-mode UI flags**

Near the gating booleans:

```ts
const docsStage = status === 'documents_pending';
const atFinalStage =
  status === 'assessed' ||
  status === 'assessed_self_only' ||
  status === 'closed_documents_only';
const effectiveSignOffKind: SignOffKind = docsStage ? 'documents_only' : signOffKind;
const committeeMode = effectiveSignOffKind === 'committee';
const showSignOffChoice =
  !docsStage && !atFinalStage && (preSubmit || atHeadStage);
const showRubric = committeeMode;
const showSelfOnlyNotice = effectiveSignOffKind === 'self_only';
const showDocumentsOnlyNotice = effectiveSignOffKind === 'documents_only';
```

- [ ] **Step 4: Send signoff kind in `runAction`**

In the POST body:

```ts
body: JSON.stringify({
  offeringId,
  assessmentId,
  scores,
  comments,
  generalNotes,
  action,
  signOffKind: effectiveSignOffKind,
}),
```

Add `effectiveSignOffKind` to the `useCallback` dependency array.

- [ ] **Step 5: Reflect final status locally after sign**

Replace `setStatus('assessed')` with:

```ts
setStatus(
  effectiveSignOffKind === 'self_only'
    ? 'assessed_self_only'
    : effectiveSignOffKind === 'documents_only'
      ? 'closed_documents_only'
      : 'assessed',
);
```

- [ ] **Step 6: Only enforce follow-up for committee mode**

Before calling `ensureFollowUp()` in submit/sign handlers, use:

```ts
if (committeeMode && !(await ensureFollowUp())) return;
```

- [ ] **Step 7: Render the radio choice before the scoring summary**

Insert above the scoring summary card:

```tsx
{showSignOffChoice && (
  <fieldset className="rounded-xl border border-slate-200 bg-white p-4 lg:shrink-0">
    <legend className="text-sm font-semibold text-slate-700">
      รูปแบบการลงนาม
    </legend>
    <div className="mt-3 space-y-2">
      <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
        <input
          type="radio"
          name="signOffKind"
          value="self_only"
          checked={signOffKind === 'self_only'}
          onChange={() => setSignOffKind('self_only')}
          disabled={readOnly}
          className="mt-1"
        />
        <span>
          <span className="font-medium">ประเมินตนเองเท่านั้น</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            ยังไม่ได้รับการทวนสอบจากคณะกรรมการ และจะไม่ถูกนับในคะแนนเฉลี่ย
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
        <input
          type="radio"
          name="signOffKind"
          value="committee"
          checked={signOffKind === 'committee'}
          onChange={() => setSignOffKind('committee')}
          disabled={readOnly}
          className="mt-1"
        />
        <span>
          <span className="font-medium">ได้รับการทวนสอบจากคณะกรรมการ</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            ใช้แบบประเมิน 7 รายการ และนับในคะแนนเฉลี่ยของรายงาน
          </span>
        </span>
      </label>
    </div>
  </fieldset>
)}
```

- [ ] **Step 8: Hide rubric summary and table for non-committee flows**

Wrap the scoring summary card and rubric table with:

```tsx
{showRubric && (
  // existing scoring summary card
)}
```

and:

```tsx
{showRubric && (
  // existing rubric table
)}
```

- [ ] **Step 9: Render non-committee notices**

Render above general notes:

```tsx
{showSelfOnlyNotice && (
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 lg:shrink-0">
    รายการนี้จะปิดโดยอ้างอิงผลการประเมินตนเองของอาจารย์ผู้รับผิดชอบเท่านั้น
    และจะไม่รวมในคะแนนเฉลี่ยหรือสรุปหัวข้อการทวนสอบของคณะกรรมการ
  </div>
)}
{showDocumentsOnlyNotice && (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 lg:shrink-0">
    รายการนี้อยู่ในสถานะรอเอกสาร ระบบจะสร้างรายงานหน้าปกเท่านั้น
    และจะไม่เข้าสู่คิวรับรองผล
  </div>
)}
```

- [ ] **Step 10: Make confirmation copy explicit**

For submit/sign confirmation, compute:

```ts
const signOffDescription =
  effectiveSignOffKind === 'committee'
    ? 'ระบบจะบันทึกผลการทวนสอบโดยคณะกรรมการและนับในคะแนนเฉลี่ยของรายงาน'
    : effectiveSignOffKind === 'self_only'
      ? 'ระบบจะปิดรายการจากผลประเมินตนเองเท่านั้นและไม่นับในคะแนนเฉลี่ย'
      : 'ระบบจะปิดรายการเอกสารเท่านั้นและไม่ส่งต่อให้คณะกรรมการรับรองผล';
```

Use it in confirmation messages so the head sees the exact outcome before signing.

- [ ] **Step 11: Run typecheck**

```bash
npm run typecheck
```

Expected: no `AssessmentForm.tsx` type errors. Remaining failures may be dashboard/report exhaustive status maps.

- [ ] **Step 12: Commit Task 3**

```bash
git add app/assessor/[offeringId]/page.tsx components/AssessmentForm.tsx
git commit -m "feat: add assessor signoff kind controls"
```

## Task 4: Wire Queues And Workflow Lists

**Files:**
- Modify: `lib/data/verifications.ts`
- Modify: `lib/data/implementationReviews.ts`
- Modify: `lib/data/assessments.ts`
- Modify: `app/verification/page.tsx`
- Modify: `app/lecturer/[offeringId]/page.tsx`
- Modify: `components/OfferingManagerClient.tsx`
- Modify: `app/admin/offering-manager/actions.ts`

- [ ] **Step 1: Use shared verification entry statuses**

In `lib/data/verifications.ts`, import `VERIFICATION_ENTRY_STATUSES` and ensure the status list includes self-only:

```ts
const VERIFICATION_STATUSES: OfferingStatus[] = [
  ...VERIFICATION_ENTRY_STATUSES,
  'verification_review',
  'needs_follow_up',
  'verified',
];
```

Add `assessed_self_only` to `STATUS_SORT` with the same rank as `assessed`. Add `closed_documents_only` with a non-queue fallback rank only if the `Record<OfferingStatus, number>` requires it.

- [ ] **Step 2: Keep self-only in next-semester follow-up queue**

In `lib/data/implementationReviews.ts`, use:

```ts
.where('status', 'in', ['assessed', 'assessed_self_only'])
```

If this is already present, leave it.

- [ ] **Step 3: Confirm assessor queue uses centralized statuses**

In `lib/data/assessments.ts`, keep:

```ts
import { ASSESSOR_OFFERING_STATUSES } from '@/lib/constants';
```

No further change is needed if the query already uses that constant.

- [ ] **Step 4: Update verification queue copy/counts**

In `app/verification/page.tsx`, replace:

```ts
const assessedOnly = items.filter((i) => i.offering.status === 'assessed').length;
```

with:

```ts
const assessedOnly = items.filter((i) =>
  i.offering.status === 'assessed' || i.offering.status === 'assessed_self_only',
).length;
```

Keep score displays as-is for committee rows, but ensure null/zero self-only scores render as `—` if a self-only assessment reaches this page.

- [ ] **Step 5: Let lecturers see signed reports for self-only and downstream statuses**

In `app/lecturer/[offeringId]/page.tsx`, replace the local `ASSESSED_STATUSES` with import from `SIGNED_OFF_STATUSES`, or include:

```ts
const ASSESSED_STATUSES: OfferingStatus[] = [
  'assessed',
  'assessed_self_only',
  'closed_documents_only',
  'verification_review',
  'verified',
  'needs_follow_up',
  'pending_review_next_semester',
  'implemented',
  'not_implemented',
];
```

- [ ] **Step 6: Audit offering manager final-state protections**

In `components/OfferingManagerClient.tsx`, decide per action:

- If the check prevents ordinary users from editing a signed-off offering, use `SIGNED_OFF_STATUSES.includes(offering.status)`.
- If the check is specifically for reversing committee-assessed signoff, use `offering.status === 'assessed' || offering.status === 'assessed_self_only'`.
- Do not treat `closed_documents_only` as a committee-assessed offering.

Use an imported helper where possible:

```ts
import { SIGNED_OFF_STATUSES } from '@/lib/constants';
```

- [ ] **Step 7: Audit admin offering-manager actions**

In `app/admin/offering-manager/actions.ts`, replace any guard that means "final signed-off state" with:

```ts
SIGNED_OFF_STATUSES.includes(offering.status as OfferingStatus)
```

Leave a strict `status === 'assessed'` only where the action truly requires a committee rubric assessment.

- [ ] **Step 8: Run typecheck**

```bash
npm run typecheck
```

Expected: queue/list files compile. Remaining failures may be Cloud Functions or dashboard/report tasks.

- [ ] **Step 9: Commit Task 4**

```bash
git add lib/data/verifications.ts lib/data/implementationReviews.ts lib/data/assessments.ts app/verification/page.tsx app/lecturer/[offeringId]/page.tsx components/OfferingManagerClient.tsx app/admin/offering-manager/actions.ts
git commit -m "feat: route self-only signoffs through queues"
```

## Task 5: Generate Correct Combined PDFs

**Files:**
- Modify: `functions/src/generateCombinedReport.ts`
- Modify: `functions/src/assessmentHtml.ts`
- Modify: `functions/src/reportShared.ts`

- [ ] **Step 1: Add local Cloud Functions signoff helpers**

Cloud Functions does not import app aliases. In `functions/src/reportShared.ts`, add:

```ts
export type SignOffKind = 'committee' | 'self_only' | 'documents_only';

export function normalizeSignOffKind(value: unknown): SignOffKind {
  return value === 'self_only' || value === 'documents_only' ? value : 'committee';
}
```

- [ ] **Step 2: Add a cover indicator renderer**

In `functions/src/reportShared.ts`, add:

```ts
export function renderSignOffKindNotice(kind: SignOffKind): string {
  if (kind === 'committee') return '';
  const text =
    kind === 'self_only'
      ? 'เอกสารประเมินตนเองเท่านั้น — ยังไม่ได้ทวนสอบโดยคณะกรรมการ'
      : 'เอกสารประกอบรายวิชาเท่านั้น — ยังไม่ได้วิเคราะห์หรือทวนสอบโดยคณะกรรมการ';
  return `<div class="note"><strong>สถานะการลงนาม:</strong> ${esc(text)}</div>`;
}
```

If `.note` does not exist in `REPORT_STYLES`, add a restrained bordered style there.

- [ ] **Step 3: Update `buildCombinedReportHtml` signature**

In `functions/src/assessmentHtml.ts`, import `SignOffKind` and `renderSignOffKindNotice`. Change args:

```ts
export function buildCombinedReportHtml(args: {
  signOffKind: SignOffKind;
  aiResult?: AnalysisResult | null;
  assessment: AssessmentForReport;
  meta: ReportMeta;
  followUp?: FollowUpForReport | null;
  selfAssessment?: SelfAssessmentForReport | null;
  committee?: CommitteeMemberForReport[] | null;
}): string {
```

- [ ] **Step 4: Compose sections by signoff kind**

Replace section construction with:

```ts
const { signOffKind, aiResult, assessment, meta, followUp, selfAssessment, committee } = args;
let n = 1;
const aiSection = signOffKind !== 'documents_only' && aiResult
  ? renderAiSection(aiResult, n++)
  : '';
const selfSection = signOffKind !== 'documents_only' && selfAssessment
  ? renderSelfAssessmentSection(selfAssessment, n++)
  : '';
const assessorSection = signOffKind === 'committee'
  ? renderAssessorSection(assessment, n++)
  : '';
const followUpSection = signOffKind === 'committee' && followUp
  ? renderFollowUpSection(followUp, n++)
  : '';
const signature = signOffKind === 'documents_only' ? '' : signatureTable();
```

On the cover, render:

```ts
${renderSignOffKindNotice(signOffKind)}
${signOffKind === 'committee' ? renderCommitteeCover(committee) : ''}
```

Use `${signature}` instead of unconditional `signatureTable()`.

- [ ] **Step 5: Let documents-only skip AI report loading**

In `functions/src/generateCombinedReport.ts`, after loading assessment:

```ts
const signOffKind = normalizeSignOffKind(assessment.signOffKind);
```

Import `normalizeSignOffKind` from `reportShared`.

Replace the unconditional AI report load with:

```ts
let aiResult: AnalysisResult | null = null;
if (signOffKind !== 'documents_only') {
  if (!offering.latestAiReportId) {
    throw new HttpsError('failed-precondition', 'ยังไม่มีรายงานการวิเคราะห์');
  }
  const aiSnap = await offeringRef
    .collection('aiReports')
    .doc(offering.latestAiReportId)
    .get();
  aiResult = aiSnap.data()?.structuredOutput as AnalysisResult | undefined ?? null;
  if (!aiResult) {
    throw new HttpsError('failed-precondition', 'ไม่พบผลการวิเคราะห์ของรายวิชา');
  }
}
```

- [ ] **Step 6: Pass signoff kind to HTML builder**

Use:

```ts
const html = buildCombinedReportHtml({
  signOffKind,
  aiResult,
  followUp: signOffKind === 'committee' ? followUp : null,
  selfAssessment: signOffKind === 'documents_only' ? null : selfAssessment,
  committee: signOffKind === 'committee' ? assessment.committeeSnapshot ?? null : null,
  assessment: {
    assessorName: assessment.assessorName ?? '',
    signedAtText,
    scores: assessment.scores ?? {},
    comments: assessment.comments ?? {},
    totalScore: assessment.totalScore ?? 0,
    maxScore: assessment.maxScore ?? 0,
    percentScore: assessment.percentScore ?? 0,
    band: assessment.band ?? 'improve',
    generalNotes: assessment.generalNotes ?? null,
  },
  meta,
});
```

- [ ] **Step 7: Build functions**

```bash
cd functions && npm run build
```

Expected: functions TypeScript build passes.

- [ ] **Step 8: Commit Task 5**

```bash
git add functions/src/generateCombinedReport.ts functions/src/assessmentHtml.ts functions/src/reportShared.ts
git commit -m "feat: render alternate signoff PDFs"
```

## Task 6: Fix Assessment Summary Reports

**Files:**
- Modify: `lib/data/assessmentReports.ts`
- Modify: `functions/src/assessmentSummaryReport.ts`
- Modify: `functions/src/assessmentSummaryHtml.ts`
- Modify: `components/AssessmentReportsClient.tsx`
- Modify: `components/CourseListByProgram.tsx`

- [ ] **Step 1: Import shared helpers in `lib/data/assessmentReports.ts`**

Add:

```ts
import { SIGNED_OFF_STATUSES, isCommitteeSignOff } from '@/lib/constants';
```

- [ ] **Step 2: Accumulate only committee assessments**

In both `buildReportSnapshot` and `buildAllProgramsSnapshot`, replace:

```ts
const isAssessed = o.status === 'assessed';
```

with:

```ts
const isSignedOff = SIGNED_OFF_STATUSES.includes(o.status);
```

Read the assessment when `isSignedOff` is true. Then:

```ts
const isCommittee = assessment ? isCommitteeSignOff(assessment.signOffKind) : false;
if (isSignedOff) assessedOfferings += 1;
if (assessment && isCommittee) {
  band = assessment.band;
  percentScore = assessment.percentScore;
  accumulate(acc, assessment);
}
```

For all-program snapshots, increment `pAssessed` for `isSignedOff`, but push `pPercents` only for committee assessments:

```ts
if (isSignedOff) pAssessed += 1;
if (assessment && isCommittee) {
  band = assessment.band;
  percentScore = assessment.percentScore;
  pPercents.push(assessment.percentScore);
  accumulate(acc, assessment);
}
```

Course rows should use:

```ts
assessed: isSignedOff,
band,
percentScore,
```

- [ ] **Step 3: Keep non-committee score display blank**

In `getCourseReportLinks`, expose score fields only for committee assessments:

```ts
const a = aSnap?.data() as AssessmentDoc | undefined;
const committee = a ? isCommitteeSignOff(a.signOffKind) : false;
const info: CourseReportLinks = {
  aiReportUrl,
  combinedReportUrl: a?.signedPdfUrl ?? null,
  totalScore: committee ? a?.totalScore ?? null : null,
  maxScore: committee ? a?.maxScore ?? null : null,
  percentScore: committee ? a?.percentScore ?? null : null,
  band: committee ? a?.band ?? null : null,
};
```

- [ ] **Step 4: Append all signed-off PDFs to summary PDF**

In `functions/src/assessmentSummaryReport.ts`, `collectCourseCombinedPdfs` already filters `r.assessed`. Because Task 6 makes `r.assessed` mean signed-off, keep that filter. Add a comment:

```ts
// `assessed` in the frozen snapshot means signed-off for appendix coverage;
// score fields on the row remain null for non-committee signoffs.
```

- [ ] **Step 5: Ensure summary HTML handles null scores**

In `functions/src/assessmentSummaryHtml.ts`, verify the course rows already render:

```ts
${r.percentScore == null ? '—' : `${r.percentScore}%`}
```

If the band column derives from `percentScore`, keep `—` for null.

- [ ] **Step 6: Fix report list counts**

In `components/AssessmentReportsClient.tsx`, import `SIGNED_OFF_STATUSES` and replace:

```ts
const assessed = active.filter((o) => o.status === 'assessed').length;
```

with:

```ts
const assessed = active.filter((o) => SIGNED_OFF_STATUSES.includes(o.status)).length;
```

- [ ] **Step 7: Keep course list score badge hidden for non-committee rows**

In `components/CourseListByProgram.tsx`, keep the existing guard:

```tsx
{r.percentScore != null ? ... : '—'}
```

Do not synthesize a band from non-committee ignored scores.

- [ ] **Step 8: Run app and functions builds**

```bash
npm run typecheck
cd functions && npm run build
```

Expected: both pass for report files.

- [ ] **Step 9: Commit Task 6**

```bash
git add lib/data/assessmentReports.ts functions/src/assessmentSummaryReport.ts functions/src/assessmentSummaryHtml.ts components/AssessmentReportsClient.tsx components/CourseListByProgram.tsx
git commit -m "feat: separate signed-off coverage from committee scores"
```

## Task 7: Fix Dashboard Counts, Filters, And Score Metrics

**Files:**
- Modify: `lib/data/dashboard.ts`
- Modify: `lib/utils/dashboardConsolidate.ts`
- Modify: `components/DashboardFilterBar.tsx`
- Modify: `app/admin/dashboard/page.tsx`
- Modify: `app/admin/dashboard/print/page.tsx`
- Modify: `app/api/dashboard/export/route.ts`

- [ ] **Step 1: Import shared dashboard semantics**

In `lib/data/dashboard.ts`, add:

```ts
import { SIGNED_OFF_STATUSES, isCommitteeSignOff } from '@/lib/constants';
```

Remove the local `ASSESSED_STATUSES` or replace its usages with `SIGNED_OFF_STATUSES`.

- [ ] **Step 2: Add status to dashboard filters**

Extend:

```ts
export interface DashboardFilters {
  departmentId?: string;
  academicProgramId?: string;
  programId?: string;
  academicYear?: number;
  semester?: Semester;
  status?: OfferingStatus;
}
```

In the offering filter:

```ts
if (filters.status && offering.status !== filters.status) return false;
```

Do not apply `filters.status` to `programScopedOfferings` used for trend unless the product explicitly wants filtered trend history. For this plan, trend remains scoped by program/year data, not the selected point-in-time status.

- [ ] **Step 3: Split signed assessments from committee assessments**

Replace:

```ts
const signedAssessments = offerings
  .map((offering) => assessmentByOffering.get(offering.id))
  .filter((assessment): assessment is AssessmentWithId =>
    Boolean(assessment?.isLocked),
  );
const percentScores = signedAssessments.map((assessment) => assessment.percentScore);
```

with:

```ts
const signedAssessments = offerings
  .map((offering) => assessmentByOffering.get(offering.id))
  .filter((assessment): assessment is AssessmentWithId => Boolean(assessment?.isLocked));
const committeeAssessments = signedAssessments.filter((assessment) =>
  isCommitteeSignOff(assessment.signOffKind),
);
const percentScores = committeeAssessments.map((assessment) => assessment.percentScore);
```

- [ ] **Step 4: Make trend score metrics committee-only**

In `buildTrend`, derive:

```ts
const committeeSigned = signed.filter((assessment) =>
  isCommitteeSignOff(assessment.signOffKind),
);
for (const assessment of committeeSigned) bands[assessment.band] += 1;
```

Use:

```ts
assessedCount: group.filter((o) => SIGNED_OFF_STATUSES.includes(o.status)).length,
averagePercentScore: average(committeeSigned.map((a) => a.percentScore)),
```

- [ ] **Step 5: Make recurring weaknesses committee-only**

In `buildRecurringWeaknesses`, after `if (!assessment?.isLocked) continue;`, add:

```ts
if (!isCommitteeSignOff(assessment.signOffKind)) continue;
```

- [ ] **Step 6: Make band counts and weakest rubric items committee-only**

Use `committeeAssessments` for:

```ts
for (const assessment of committeeAssessments) {
  bandCounts[assessment.band] += 1;
}
```

and for rubric averages:

```ts
const values = committeeAssessments
  .map((assessment) => numericScore(assessment.scores[item.key]))
  .filter((score): score is number => score !== null);
```

- [ ] **Step 7: Make program rows count signed-off but average committee-only**

For each program:

```ts
const programScores = programOfferings
  .map((offering) => assessmentByOffering.get(offering.id))
  .filter((assessment): assessment is AssessmentWithId =>
    Boolean(assessment?.isLocked) && isCommitteeSignOff(assessment.signOffKind),
  )
  .map((assessment) => assessment.percentScore);
```

Use:

```ts
assessed: programOfferings.filter((o) => SIGNED_OFF_STATUSES.includes(o.status)).length,
averagePercentScore: average(programScores),
signedCount: programScores.length,
```

- [ ] **Step 8: Make attention score reasons committee-only**

In `assessmentReason`, replace:

```ts
if (assessment && assessment.percentScore < 70) return 'คะแนนทวนสอบต่ำกว่า 70%';
```

with:

```ts
if (
  assessment &&
  isCommitteeSignOff(assessment.signOffKind) &&
  assessment.percentScore < 70
) {
  return 'คะแนนทวนสอบต่ำกว่า 70%';
}
```

When building attention items:

```ts
const committee = assessment ? isCommitteeSignOff(assessment.signOffKind) : false;
percentScore: committee ? assessment?.percentScore ?? null : null,
band: committee ? assessment?.band ?? null : null,
```

- [ ] **Step 9: Update dashboard summary counts**

Use:

```ts
assessed: offerings.filter((o) => SIGNED_OFF_STATUSES.includes(o.status)).length,
averagePercentScore: average(percentScores),
```

- [ ] **Step 10: Update consolidation weighted average**

In `lib/utils/dashboardConsolidate.ts`, confirm `signedCount` now means committee-scored count for averages. Rename local comments if needed:

```ts
 * `averagePercentScore` is weighted by `signedCount`, which represents
 * committee-scored signed assessments rather than every signed-off offering.
```

Keep assessed totals as summed signed-off counts.

- [ ] **Step 11: Add status select to `DashboardFilterBar`**

Add a prop if needed:

```ts
selectedStatus?: OfferingStatus;
```

Render a native select with every `OFFERING_STATUS` key:

```tsx
<select
  name="status"
  defaultValue={selectedStatus ?? ''}
  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
>
  <option value="">ทุกสถานะ</option>
  {Object.entries(OFFERING_STATUS).map(([status, meta]) => (
    <option key={status} value={status}>
      {meta.labelTh}
    </option>
  ))}
</select>
```

- [ ] **Step 12: Read status param on dashboard page**

In `app/admin/dashboard/page.tsx`, add `status?: string | string[]` to `searchParams` and parse:

```ts
function readStatus(value: string | string[] | undefined): OfferingStatus | undefined {
  const raw = readSearchValue(value);
  return raw && raw in OFFERING_STATUS ? (raw as OfferingStatus) : undefined;
}
```

Pass `status: selectedStatus` to `getExecutiveDashboardData`.

- [ ] **Step 13: Render all statuses including zero counts**

Add the new statuses to `STATUS_ORDER`:

```ts
'pending_head_signoff',
'assessed',
'assessed_self_only',
'closed_documents_only',
'verification_review',
```

Replace:

```ts
const visibleStatuses = STATUS_ORDER.filter(
  (status) => (data.statusCounts[status] ?? 0) > 0,
);
```

with:

```ts
const visibleStatuses = STATUS_ORDER;
```

- [ ] **Step 14: Reorder the first metric card**

In `app/admin/dashboard/page.tsx`, make the first card lead with total offerings and show programs as sub-detail. Preserve existing styling; only swap labels/values.

- [ ] **Step 15: Pass status through export and print routes**

In `app/admin/dashboard/page.tsx`, add:

```ts
if (selectedStatus) exportParams.set('status', selectedStatus);
```

In `app/admin/dashboard/print/page.tsx`, parse and pass `status`.

In `app/api/dashboard/export/route.ts`, parse and pass `status`.

- [ ] **Step 16: Run typecheck**

```bash
npm run typecheck
```

Expected: dashboard files compile and all `OfferingStatus` exhaustive arrays include the new statuses.

- [ ] **Step 17: Commit Task 7**

```bash
git add lib/data/dashboard.ts lib/utils/dashboardConsolidate.ts components/DashboardFilterBar.tsx app/admin/dashboard/page.tsx app/admin/dashboard/print/page.tsx app/api/dashboard/export/route.ts
git commit -m "feat: dashboard counts alternate signoffs"
```

## Task 8: Full Audit For Remaining `assessed` Assumptions

**Files:**
- Modify any file found by the audit where the check is incorrect.

- [ ] **Step 1: Search status equality checks**

Run:

```bash
rg -n "status === 'assessed'|status === \\\"assessed\\\"|status', '==', 'assessed'|ASSESSED_STATUSES" app components lib functions/src
```

Expected: every remaining hit is reviewed.

- [ ] **Step 2: Classify each hit**

Use these rules:

- "Signed off / complete / closed / visible in reports" means `SIGNED_OFF_STATUSES.includes(status)`.
- "Can enter verification queue" means `status === 'assessed' || status === 'assessed_self_only'`.
- "Has official committee rubric score" means `assessment && isCommitteeSignOff(assessment.signOffKind)`.
- "Exactly normal committee-assessed workflow state" may remain `status === 'assessed'`.

- [ ] **Step 3: Search score aggregation paths**

Run:

```bash
rg -n "assessment\\.band|assessment\\.scores|assessment\\.percentScore|signedAssessments|bandCounts|averagePercentScore|recurringWeaknesses|weakestRubricItems" app components lib functions/src
```

Expected: every metric path that affects averages/bands/weaknesses checks `isCommitteeSignOff` or receives data already filtered to committee assessments.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 5: Commit Task 8**

```bash
git add app components lib functions/src
git commit -m "fix: audit assessed status assumptions"
```

## Task 9: Build And Manual Verification

**Files:**
- No planned code edits unless verification finds defects.

- [ ] **Step 1: Run app typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: exits 0. This is required by `AGENTS.md` before commit.

- [ ] **Step 3: Run functions build**

```bash
cd functions && npm run build
```

Expected: exits 0.

- [ ] **Step 4: Manual E2E: self-only signoff**

Use a `pending_assessment` or `assessor_review` offering with an existing lecturer self-assessment.

Expected:

- Secretary selects `ประเมินตนเองเท่านั้น`.
- Rubric table is hidden.
- Secretary submits to head.
- Head confirmation says it will not count in averages.
- Head signs.
- Offering status becomes `assessed_self_only`.
- Combined PDF shows AI/self-assessment and the indicator, with no committee rubric section.
- Offering appears in verification queue.

- [ ] **Step 5: Manual E2E: committee signoff regression**

Use a normal `pending_assessment` offering.

Expected:

- Secretary selects `ได้รับการทวนสอบจากคณะกรรมการ`.
- Rubric table is visible.
- Follow-up gate still applies when previous assessment requires it.
- Head signs.
- Offering status becomes `assessed`.
- Combined PDF includes committee cover and official rubric section.
- Dashboard/report averages include this course.

- [ ] **Step 6: Manual E2E: documents-only closeout**

Use a `documents_pending` offering.

Expected:

- Offering appears in assessor queue.
- Form shows documents-only notice and no rubric/radio.
- Secretary submits to head.
- Head signs.
- Offering status becomes `closed_documents_only`.
- Minimal combined PDF is cover-only with the documents-only indicator.
- Offering does not appear in verification queue.

- [ ] **Step 7: Manual E2E: assessment summary report**

Generate or refresh an assessment summary report for a scope containing all three signoff kinds.

Expected:

- All signed-off courses are listed.
- Self-only/documents-only rows have blank score/band cells.
- Average, band distribution, and topic summaries include committee-assessed rows only.
- Appendix includes available signed PDFs for all signed-off rows.

- [ ] **Step 8: Manual E2E: dashboard**

Open admin dashboard for the same scope.

Expected:

- Status filter includes both new statuses.
- `สถานะรายวิชา` shows every status, including zeros.
- `ทวนสอบ` count includes committee, self-only, documents-only, and downstream signed-off states.
- Average score, band chart, recurring weaknesses, weakest items, trend averages, and attention score warnings include committee assessments only.
- CSV and print/PDF exports honor the status filter.

- [ ] **Step 9: Commit final fixes**

If verification required edits:

```bash
git add app components lib functions/src
git commit -m "fix: complete alternate signoff verification"
```

If no edits were required, do not create an empty commit.

## Task 10: Deploy Functions After App Review

**Files:**
- No repo edits.

- [ ] **Step 1: Deploy updated combined report function**

Run after app changes are reviewed and ready:

```bash
firebase deploy --only functions:generateCombinedReport --project achv-evaluation-ohs
```

Expected: deploy succeeds in `asia-southeast1`.

- [ ] **Step 2: Deploy summary report function if Task 6 changed function output**

Run:

```bash
firebase deploy --only functions:generateAssessmentSummaryReport --project achv-evaluation-ohs
```

Expected: deploy succeeds if the function exists under that export name. If Firebase reports the export name differs, inspect `functions/src/index.ts` and deploy the exact exported function.

- [ ] **Step 3: Record deployment outcome**

Add a short release note or PR comment:

```md
Deployed Cloud Functions:
- generateCombinedReport: supports committee, self-only, and documents-only signed PDFs
- generateAssessmentSummaryReport: includes all signed-off course PDFs in appendices while keeping metrics committee-only
```

## Final Verification Commands

Run from repo root:

```bash
npm run typecheck
npm run build
cd functions && npm run build
```

Expected: all three commands exit 0.

## Self-Review

- Spec coverage: The plan covers statuses/model, assessor form/API, two-step flow, self-only and documents-only PDFs, verification routing, summary reports, dashboard counts/filter/status display, and manual E2E.
- Red-flag scan: No task contains unfinished implementation gaps; each broad audit task has exact search commands and classification rules.
- Type consistency: `SignOffKind`, `signOffKind`, `SIGNED_OFF_STATUSES`, `isCommitteeSignOff`, and `finalStatusForSignOffKind` are named consistently across tasks.
