# Self-Only Signoff Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the assessor offering page UI and signed PDF output for self-only signoff so it is visually correct, clearly labeled, and has the same signed/locked affordances as committee signoff.

**Architecture:** Keep the durable signoff discriminator as `AssessmentDoc.signOffKind`. UI changes stay in `components/AssessmentForm.tsx`; PDF title/content changes stay in `functions/src/assessmentHtml.ts`, where `buildCombinedReportHtml()` already branches on `signOffKind`. No Firestore schema or workflow transition changes are needed.

**Tech Stack:** Next.js 14 App Router, React/TypeScript, Tailwind CSS, Firebase callable functions, Cloud Functions TypeScript PDF HTML renderer.

---

## File Structure

- Modify `components/AssessmentForm.tsx`
  - Replace the `fieldset`/`legend` signoff selector with a normal bordered section and in-card heading so "รูปแบบการลงนาม" does not float outside the card border.
  - Show a signed lock badge for locked self-only and documents-only assessments even when the rubric summary card is hidden.
  - Keep committee signoff behavior unchanged.

- Modify `functions/src/assessmentHtml.ts`
  - Add a small title helper keyed by `SignOffKind`.
  - Render the self-only combined report title as `รายงานการประเมินและทวนสอบผลสัมฤทธิ์รายวิชา (ฉบับลงนาม-ผลประเมินตนเองเท่านั้น)`.
  - Keep assessor rubric and follow-up sections rendered only for `signOffKind === 'committee'`.

- Verify with existing commands:
  - `npm run typecheck`
  - `npm run build`
  - `cd functions && npm run build`

---

### Task 1: Fix The Signoff Choice Card Title

**Files:**
- Modify: `components/AssessmentForm.tsx:518-559`

- [ ] **Step 1: Replace the `fieldset`/`legend` wrapper**

Change this block:

```tsx
{showSignOffChoice && (
  <fieldset className="rounded-xl border border-slate-200 bg-white p-4 lg:shrink-0">
    <legend className="text-sm font-semibold text-slate-700">
      รูปแบบการลงนาม
    </legend>
    <div className="mt-3 space-y-2">
      ...
    </div>
  </fieldset>
)}
```

To this structure:

```tsx
{showSignOffChoice && (
  <section
    aria-labelledby="sign-off-kind-title"
    className="rounded-xl border border-slate-200 bg-white p-4 lg:shrink-0"
  >
    <h3 id="sign-off-kind-title" className="text-sm font-semibold text-slate-700">
      รูปแบบการลงนาม
    </h3>
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
  </section>
)}
```

- [ ] **Step 2: Run a typecheck**

Run:

```bash
npm run typecheck
```

Expected: exits `0`.

- [ ] **Step 3: Commit**

```bash
git add components/AssessmentForm.tsx
git commit -m "fix: keep signoff choice title inside card"
```

---

### Task 2: Show Signed/Locked State For Self-Only Signoff

**Files:**
- Modify: `components/AssessmentForm.tsx:562-588`

- [ ] **Step 1: Add a shared lock badge helper**

Near `signedReportTitle`, add:

```tsx
const signedBadge = isLocked ? (
  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
    <span aria-hidden="true">🔒</span>
    ลงนามแล้ว
  </span>
) : null;
```

- [ ] **Step 2: Put the badge in the signoff summary card**

Replace:

```tsx
{showSignOffSummary && (
  <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 lg:shrink-0">
    <div className="font-semibold">รูปแบบการลงนาม</div>
    <div className="mt-1 text-slate-600">{signOffDescription}</div>
  </div>
)}
```

With:

```tsx
{(showSignOffSummary || (isLocked && !showRubric)) && (
  <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 lg:shrink-0">
    <div className="flex items-center justify-between gap-3">
      <div className="font-semibold">รูปแบบการลงนาม</div>
      {signedBadge}
    </div>
    <div className="mt-1 text-slate-600">{signOffDescription}</div>
  </div>
)}
```

Why: self-only hides `showRubric`, so the existing lock badge inside the rubric summary is invisible after signoff. This makes locked status visible for self-only without changing the committee rubric card.

- [ ] **Step 3: Reuse the badge in the committee rubric summary**

Replace:

```tsx
{isLocked && (
  <span className="text-xs px-2 py-1 rounded-full bg-white/60 font-medium">
    🔒 ลงนามแล้ว
  </span>
)}
```

With:

```tsx
{signedBadge}
```

- [ ] **Step 4: Run a typecheck**

Run:

```bash
npm run typecheck
```

Expected: exits `0`.

- [ ] **Step 5: Commit**

```bash
git add components/AssessmentForm.tsx
git commit -m "fix: show locked state for self-only signoffs"
```

---

### Task 3: Make Self-Only Combined PDF Title Explicit

**Files:**
- Modify: `functions/src/assessmentHtml.ts:44-79`

- [ ] **Step 1: Add a report-title helper**

Inside `buildCombinedReportHtml()`, after destructuring `args`, add:

```ts
const title =
  signOffKind === 'committee'
    ? 'รายงานการประเมินและทวนสอบผลสัมฤทธิ์รายวิชา (ฉบับลงนาม)'
    : signOffKind === 'self_only'
      ? 'รายงานการประเมินและทวนสอบผลสัมฤทธิ์รายวิชา (ฉบับลงนาม-ผลประเมินตนเองเท่านั้น)'
      : 'รายงานการประเมินและทวนสอบผลสัมฤทธิ์รายวิชา (ฉบับลงนาม-เอกสารเท่านั้น)';
```

- [ ] **Step 2: Use the title in the PDF cover**

Replace:

```ts
<h1>รายงานการประเมินและทวนสอบผลสัมฤทธิ์รายวิชา (ฉบับลงนาม)</h1>
```

With:

```ts
<h1>${esc(title)}</h1>
```

- [ ] **Step 3: Confirm self-only does not render the assessor form**

Leave this existing branch intact:

```ts
const assessorSection =
  signOffKind === 'committee' ? renderAssessorSection(assessment, n++) : '';
const followUpSection =
  signOffKind === 'committee' && followUp ? renderFollowUpSection(followUp, n++) : '';
```

This is the source-level guarantee that self-only combined PDFs do not include the assessor's 7-item assessment form.

- [ ] **Step 4: Run functions build**

Run:

```bash
cd functions && npm run build
```

Expected: exits `0`.

- [ ] **Step 5: Commit**

```bash
git add functions/src/assessmentHtml.ts
git commit -m "fix: label self-only signed pdf title"
```

---

### Task 4: Final Verification

**Files:**
- No code changes.

- [ ] **Step 1: Check source assertions**

Run:

```bash
rg -n "ฉบับลงนาม-ผลประเมินตนเองเท่านั้น|renderAssessorSection\\(assessment|showSignOffChoice|signedBadge" components/AssessmentForm.tsx functions/src/assessmentHtml.ts
```

Expected:
- `components/AssessmentForm.tsx` contains `signedBadge`.
- `functions/src/assessmentHtml.ts` contains `ฉบับลงนาม-ผลประเมินตนเองเท่านั้น`.
- `functions/src/assessmentHtml.ts` still gates `renderAssessorSection(assessment, n++)` behind `signOffKind === 'committee'`.

- [ ] **Step 2: Run app typecheck**

```bash
npm run typecheck
```

Expected: exits `0`.

- [ ] **Step 3: Run app production build**

```bash
npm run build
```

Expected: exits `0`.

- [ ] **Step 4: Run functions build**

```bash
cd functions && npm run build
```

Expected: exits `0`.

- [ ] **Step 5: Manual browser check**

Run:

```bash
npm run dev
```

Open an assessor offering page in a self-only signoff state and verify:
- The "รูปแบบการลงนาม" title is inside the bordered card.
- After the head signs, the page shows a lock icon with `ลงนามแล้ว`.
- The signed report card still offers generate/download behavior.
- The generated self-only PDF title says `ฉบับลงนาม-ผลประเมินตนเองเท่านั้น`.
- The self-only PDF does not contain `ผลการทวนสอบโดยผู้ทวนสอบ`.

- [ ] **Step 6: Commit verification notes only if code changed during verification**

If no code changed during verification, do not create an empty commit.

---

## Self-Review

**Spec coverage:**
- Floating title bug: Task 1.
- Self-only PDF title: Task 3.
- Self-only PDF excludes assessor form: Task 3 keeps and verifies the existing committee-only branch.
- Signed/locked affordance after head signoff: Task 2.

**Placeholder scan:** No placeholder steps remain.

**Type consistency:** Uses existing names: `signOffKind`, `SignOffKind`, `showRubric`, `isLocked`, `renderAssessorSection`, `buildCombinedReportHtml`.

