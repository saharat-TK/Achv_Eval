# Course Evaluation & Monitoring System

ระบบประเมินและทวนสอบรายวิชา สำนักวิชาวิทยาศาสตร์สุขภาพ มหาวิทยาลัยแม่ฟ้าหลวง

Per-semester workflow: lecturers upload TQF documents → Gemini analyzes them
against the school's evaluation guideline → assessors review the AI output,
score with the 7-item rubric, sign off → status carries forward to next
semester for verification.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Auth:** Firebase Authentication, Google SSO restricted to `@mfu.ac.th`
- **Database:** Cloud Firestore (security rules enforce the four-role matrix)
- **AI:** Google Gemini 2.5 Pro (single-shot, with deterministic grade-stats hybrid)
- **File storage:** Google Drive (owned by Academic & QA Department)
- **Visibility mirror:** Google Sheets — lecturer-action log
- **Notifications:** Gmail API (in-app inbox + email)
- **Hosting:** Vercel

See [`docs/FIRESTORE_MODEL.md`](docs/FIRESTORE_MODEL.md) for the data model and
[`prompts/`](prompts/) for the AI evaluation guidelines.

## Project status

Phase 7 (hardening & load testing) — **next**. Phases 0–5, 6A, and 3D
complete; Phase 6B (notification email) deferred.

- [x] Firebase Auth with Google SSO + `@mfu.ac.th` enforcement
- [x] Server session cookies + middleware gate
- [x] Firestore data model, security rules, indexes
- [x] OHS seed script
- [x] Phase 1A: lecturer workspace, dashboard, offering detail
- [x] Phase 1B: Gemini analysis pipeline (`analyzeCourse` Cloud Function)
- [x] Phase 1C: report PDF (`generateReportPdf`) → Firebase Storage + log Sheet
- [x] Phase 2A: assessor workspace & inbox
- [x] Phase 2B: 7-item rubric evaluation form & sign-off
- [x] Phase 2C: combined report PDF (AI analysis + assessor form) on sign-off
- [x] Phase 3A: admin workspace & program management (PLO editor)
- [x] Phase 3B-1: course management & CSV batch upload
- [x] Phase 3B-2: offering management — lecturer assignment & clone-from-previous
- [x] Phase 3C: user & role management
- [x] Phase 3D: end-to-end validation, lint/build gate, deployment checklist ([docs/PHASE3_VALIDATION.md](docs/PHASE3_VALIDATION.md)) — automated gate passed 2026-05-19
- [x] Phase 4A: verification committee role, status model, read-only queue
- [x] Phase 4B-1: verification decision form, final sign-off, status transition
- [x] Phase 4B-2: final verification PDF
- [x] Phase 5: executive dashboard (school-wide analytics)
  - [x] Phase 5A: dashboard foundation, role-scoped metrics, attention list
  - [x] Phase 5B: cross-semester trend charts (score, completion, band mix)
  - [x] Phase 5C: recurring-weakness analysis (rubric items low across courses)
  - [x] Phase 5D: QA export of the dashboard (CSV, print-to-PDF view)
- [ ] Phase 6: notifications (email & in-app alerts)
  - [x] Phase 6A: in-app notifications (triggers, header bell, inbox dropdown)
  - [ ] Phase 6B: email delivery
- [ ] Phase 7: hardening & load testing

## Admin Role Adjustment — Implementation Plan

Audit findings from branch `admin-role-adjustment`. The current model has
two tiers — global `isAdmin` (super admin) and per-program `directorOf`
(program admin). The audit found six items worth resolving (A–F). They
are listed in recommended build order: small/safe first, decision-heavy
last.

### F. Document "admin writes via server" convention (10 min)

The Firestore rules for `assessments` and `verifications` require
`assessesProgram` / `verifiesProgram` for client writes and don't
short-circuit on `isAdmin`. This is intentional — sign-off writes go
through `/api/assessor/submit` and `/api/verification/submit` so the
role check stays explicit on the server. Capture this so it isn't
mis-read as a bug.

- Add a top-of-block comment in `firestore.rules` above
  `match /offerings/{id}/assessments/{aid}` and
  `match /offerings/{id}/verifications/{vid}` explaining: "Sign-off
  writes go through server actions; client rules deliberately exclude
  `isAdmin()` so an admin cannot fabricate a signed record."
- No code changes.

### C. Last-admin safeguard (½ day)

`users/actions.ts:32` already blocks an admin from removing **their
own** `isAdmin`, but they can demote or deactivate **another** admin.
If the system ends up with zero active admins it's locked out of user
management.

- Add a helper `countOtherActiveAdmins(actorUid)` to
  `app/admin/users/actions.ts` — single Firestore query
  `where('roles.isAdmin', '==', true).where('isActive', '!=', false)`
  excluding the actor, returning the count.
- In `updateUserRoles`: if the target currently has `isAdmin=true`, the
  incoming roles set it to false, **and** `countOtherActiveAdmins
  (target)` is 0, return `last_admin_protected`.
- In `setUserActive`: if the target currently has `isAdmin=true`, the
  incoming value is `false`, **and** `countOtherActiveAdmins(target)`
  is 0, return `last_admin_protected`.
- Surface a friendly error in `app/admin/users/[userId]/page.tsx`.
- Tests: by hand — try to demote/deactivate the only other admin;
  confirm the action refuses.

### E. Admin read access to `/assessor` (½ hour)

Admins currently can't browse the assessor workspace at all
(`app/assessor/layout.tsx` redirects if `assessorOf` is empty). Allow
admins in for support/troubleshooting; their view stays read-only
because the assessor submit route still gates on `assessorOf`
(unchanged).

- `app/assessor/layout.tsx`: change the gate to
  `if (!isAdmin && (!assessorOf || assessorOf.length === 0))
   redirect('/login')`.
- `app/assessor/page.tsx` and any list/data fetcher: if `isAdmin` and
  `assessorOf` is empty, show all programs' offerings instead of an
  empty list. Otherwise behave the same.
- `app/assessor/[offeringId]/page.tsx`: admin can view but not sign
  (the form's submit will be rejected by the server). Optionally hide
  the sign-off button when the viewer isn't an assessor of the
  program.

### D. Codify the director-as-verifier overlap (1 hour)

Currently directors are admitted to `/verification` and can submit
final verification decisions (`api/verification/submit:63`). If this
is the intended policy ("directors may sit on the verification
committee for their programs"), make it explicit and discoverable.

- Add a new `docs/ROLE_MATRIX.md` documenting every role × capability
  intersection (read, write, sign, scope).
- Link it from this README's "Security notes" section.
- No code change required if the overlap is policy. If you'd rather
  separate the roles, see option in finding A below.

### B. Build UIs for the two rule-only admin capabilities (1 day)

`firestore.rules` already grant `isAdmin` two abilities that have no
client surface: reading the audit log and deleting a program.

**B1. Audit log viewer.**
- New page `app/admin/audit-log/page.tsx` — admin-only (redirect
  others). Server-rendered.
- New data fn `lib/data/auditLog.ts` with a paginated read of
  `auditLog`, ordered by `occurredAt desc`. Filters: `entityType`,
  `actorEmail`, date range. Page size 50.
- Composite index in `firestore.indexes.json` for
  `(entityType ASC, occurredAt DESC)` (single-field `occurredAt`
  already covers the unfiltered read).
- New nav link "บันทึกการทำงาน" in `app/admin/layout.tsx` sub-nav,
  visible only to `isAdmin`.

**B2. Program lifecycle — three modes, ordered safest to most destructive.**

All three are admin-only and live in
`app/admin/programs/actions.ts`. Surfaced from
`app/admin/programs/[programId]/page.tsx` with progressively stronger
confirmations.

**Mode 1 — Soft-delete (reversible).**
- Server action `softDeleteProgram(programId)`.
- Marks `programs/{id}.isActive = false`.
- Cascades `isActive = false` to every `courses` doc with
  `programId == id`.
- **Untouched:** offerings (carry lifecycle `status`, not `isActive`;
  changing them would corrupt the AUN-QA history); AI reports,
  assessments, verifications, notifications, audit log, Storage
  PDFs; user role arrays (`directorOf/assessorOf/verifierOf`) —
  preserved so undelete restores the assignment graph cleanly.
- Action `auditLog` entry: `program_soft_deleted`.
- Symmetric `restoreProgram(programId)` action flips both back to
  `true` and records `program_restored`.
- This is the **default** path; the UI button labels it
  "ปิดใช้งานหลักสูตร".

**Mode 2 — Hard delete (cascade-guarded).**
- Server action `deleteProgram(programId)`.
- **Guard:** refuses if any of these reference the program — returns
  a structured error listing the blockers:
  - any `courses` with `programId == id`
  - any `offerings` with `programId == id`
  - any user whose `roles.{directorOf, assessorOf, verifierOf}`
    contains the program id
  - any `implementationReviews` with `programId == id`
- If the guard passes the program doc has no related records, so
  deleting just the program doc is enough — no cascade required.
- Action `auditLog` entry: `program_hard_deleted`.
- UI: confirm dialog. Labelled "ลบหลักสูตร" — only enabled when
  the guard would pass (the page can pre-check and grey out
  otherwise).

**Mode 3 — Purge (destructive cascading, danger zone).**
- Server action `purgeProgram(programId)`.
- **Irreversible.** Wipes every record tied to the program. The
  AUN-QA audit trail for those courses is lost — only the purge
  receipt in `auditLog` remains.
- Order of operations (Admin SDK, batched where possible):
  1. List every `offerings/{oid}` with `programId == id`.
  2. For each offering, delete every doc in its subcollections —
     `aiReports`, `assessments`, `verifications` — and delete any
     Storage objects referenced by those docs
     (`reportStoragePath`, `signedPdfStoragePath`,
     `finalPdfStoragePath`).
  3. Delete every `notifications` with `relatedOfferingId` in the
     offering set.
  4. Delete the offering docs themselves.
  5. Delete every `courses` with `programId == id`.
  6. Delete every `implementationReviews` with `programId == id`.
  7. For every user whose `roles.{directorOf, assessorOf,
     verifierOf}` contains the program id, remove it from those
     arrays.
  8. Delete the program doc.
  9. Write a single `auditLog` entry `program_purged` summarizing
     counts removed.
- This is heavy enough that it belongs in a Cloud Function callable
  (`purgeProgram`) rather than a Next route — Firestore needs
  per-doc deletes and Storage cleanup, and a callable can run
  longer than a serverless route. The callable verifies `isAdmin`
  via the Admin SDK + user doc.
- UI: a separate "ลบทั้งหมดถาวร" button in a red danger panel,
  hidden behind a disclosure. Two confirmations:
  - Typed: admin must type the program code exactly to enable
    the button.
  - Checkbox: "ฉันเข้าใจว่าการกระทำนี้ไม่สามารถย้อนกลับได้
    และจะลบประวัติการทวนสอบทั้งหมดของหลักสูตรนี้".
- The button only appears for `isAdmin`.

**UI hierarchy on the program detail page:**
1. Soft-delete button (calm, primary action).
2. Hard delete button (visible only if guard would pass, otherwise
   greyed with an explanation pointing to soft-delete).
3. Danger zone collapsible at the bottom containing the purge.

### A. Resolve the assessor/verifier sign-off asymmetry — strict (½ day)

The two signed acts authorize different role-sets today:

| Action | Current allowed callers (server route) |
|---|---|
| Sign assessment (`/api/assessor/submit`) | `assessorOf` only |
| Sign verification (`/api/verification/submit`) | `isAdmin` OR `directorOf` OR `verifierOf` |

**Decision: strict (Option 1).** A signed record carries the signer's
name and date; admins shouldn't sign on behalf of a committee.
Tighten verification submit to **`verifierOf` only** to match the
assessment path. Resolves finding D too.

- `app/api/verification/submit/route.ts`: change the `allowed` check
  to `(verifierOf ?? []).includes(programId)`. Remove the
  `isAdmin || directorOf` paths.
- `functions/src/generateFinalVerificationReport.ts`: same tightening
  (admin/director can no longer regenerate someone else's
  verification PDF).
- `app/verification/layout.tsx`: keep admin/director **read** access
  to the queue (visibility, no signing).
- Drop the explicit `isAdmin` short-circuit; document via the
  ROLE_MATRIX.md (finding D).
- Test by hand: an admin who isn't a verifier of the program attempts
  to sign — expect `not_authorized` (403).

Either option is a one-file edit on the server route plus the
matching Cloud Function. Tests by hand: attempt sign-off as the
non-role-holding admin; confirm 403.

## Sequence & risk

| Step | Risk | Notes |
|---|---|---|
| F. Rules comments | trivial | docs only |
| C. Last-admin guard | low | server-only logic; covered by hand-test |
| E. Admin → `/assessor` | low | layout + page widening |
| D. ROLE_MATRIX.md | trivial | docs only |
| B1. Audit log UI | medium | new index + page |
| B2. Program lifecycle (soft + hard + purge) | medium → high | the purge needs careful UI gating and Storage cleanup |
| A. Sign-off symmetry | medium | policy decision; touches sign-off paths |

## Prerequisites

- Node.js 20.6+ (the `seed` script uses `--env-file`)
- A Firebase project with **Authentication** (Google provider) and
  **Cloud Firestore** enabled
- The Firebase project on the **Blaze (pay-as-you-go) plan** — required to
  deploy Cloud Functions. The free monthly quota still covers this app's
  volume, but a billing account must be attached.
- A Firebase service account key (Project Settings → Service accounts)
- A Gemini API key — <https://aistudio.google.com/app/apikey>

## A note on OneDrive

If this folder lives inside OneDrive, **move it out before developing**
(e.g. `~/dev/Achv_Eval`). OneDrive will try to sync `node_modules` and
`.next` — hundreds of thousands of files — and lock build output. Everything
is on GitHub, so `git clone` into a non-OneDrive path is the clean fix.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the Firebase project

1. <https://console.firebase.google.com> → Add project
2. **Build → Authentication** → Get started → enable **Google** provider
3. **Build → Firestore Database** → Create database (production mode)
4. **Project Settings → General** → register a Web app → copy the config keys
5. **Project Settings → Service accounts** → Generate new private key (JSON)

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Web app config (step 2.4) |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Service account JSON (step 2.5) — keep the `\n` escapes in the private key |
| `GEMINI_API_KEY` | Google AI Studio |
| `ALLOWED_EMAIL_DOMAINS` | leave as `mfu.ac.th` |

Also set the project id in [`.firebaserc`](.firebaserc) (replace
`REPLACE_WITH_FIREBASE_PROJECT_ID`).

### 4. Restrict Google sign-in to MFU

In the Google Cloud Console for the Firebase project, OAuth consent screen
→ set **User type** appropriately. The app additionally enforces the domain
in three places: the login page (`hd` hint + client check), the
`/api/auth/session` route (server check before issuing the cookie), and the
Firestore rules (`isMfu()`).

### 5. Deploy Firestore rules and indexes

```bash
npx firebase login
npx firebase use <your-project-id>
npm run firebase:rules
npm run firebase:indexes
```

### 6. Deploy Cloud Functions, Storage, and report logging

One callable function, `analyzeCourse`: it runs the Gemini analysis, then
(inline, non-fatally) renders the report PDF, stores it in Firebase Storage,
and appends the log-Sheet row. PDF generation is in-process rather than a
Firestore trigger because the project's Firestore database is in
`asia-southeast3`, where Firestore-triggered functions are not available.

First-time setup:

1. **Enable Firebase Storage** — Firebase Console → Build → Storage → Get
   started. `generateReportPdf` writes report PDFs there.
2. **Create the log Google Sheet** with header row:
   `timestamp · course code · course name · academic year · semester · report link · lecturer · email`.
   Note its ID (the long string in the Sheet URL).
3. **Share that Sheet** (Editor) with the functions' service account —
   `<project-number>-compute@developer.gserviceaccount.com`
   (find it in Google Cloud Console → IAM).
4. **Enable the Google Sheets API** for the project (console.cloud.google.com
   → APIs & Services → Library → Google Sheets API).

Then deploy:

```bash
cd functions && npm install && cd ..
npx firebase functions:secrets:set GEMINI_API_KEY   # paste the key when prompted
echo "GOOGLE_LOG_SHEET_ID=<your-sheet-id>" >> functions/.env
npx firebase deploy --only functions,storage
```

Functions deploy to region `asia-southeast1`. If `GOOGLE_LOG_SHEET_ID` is
unset the PDF is still produced and stored — only the log-Sheet row is
skipped.

### 7. Seed the OHS program

```bash
npm run seed
```

Creates 1 program (6 TQF PLOs), 5 courses, 1 sample offering.

### 8. Run locally and promote yourself to admin

```bash
npm run dev    # → http://localhost:3000
```

Sign in with `saharat.arr@mfu.ac.th`. The `users/{uid}` profile is created
automatically by `/api/auth/session` on first sign-in.

Then, in the Firebase Console → Firestore → `users` → your document, set:

```
roles.isAdmin = true
```

(or run a one-off admin script). Re-sign-in to pick up the change.

## Project structure

```
app/
  layout.tsx, page.tsx, globals.css   App shell
  login/page.tsx                      Google sign-in
  api/auth/session/route.ts           Session-cookie mint/clear + profile upsert
  lecturer/                           Lecturer workspace (Phase 1)
  assessor/                           Assessor review and sign-off flow (Phase 2)
  admin/                              Program, course, offering, and user management (Phase 3)
  verification/                       Verification committee queue and detail shell (Phase 4)

components/                           Shared UI (StatusBadge, AnalyzeCoursePanel…)

lib/
  firebase/
    config.ts                         Client SDK (lazy init) + Functions
    admin.ts                          Admin SDK (lazy init)
    auth-server.ts                    Session verification helpers
  data/offerings.ts                   Firestore data-access layer
  data/verifications.ts               Final verification queue helpers
  types/models.ts                     Firestore document types + rubric scoring
  constants.ts                        Status labels, document slots
  data/                               Firestore data-access helpers

middleware.ts                         Session-cookie gate

functions/                            Firebase Cloud Functions (separate deploy)
  src/analyzeCourse.ts                Callable: run Gemini course analysis
  src/generateCombinedReport.ts       Callable: signed combined assessor report
  src/gemini.ts                       Gemini integration + result schema
  src/reportPdf.ts                    AI report PDF generation
  prompts/                            AI evaluation guidelines (authoritative)
    CLAUDE.master.md / CLAUDE.undergrad.md

docs/FIRESTORE_MODEL.md               Data model + design rationale

firestore.rules                       Four-role security rules
firestore.indexes.json                Composite indexes
firebase.json, .firebaserc            Firebase CLI config

scripts/seed.ts                       OHS seed
```

## Commands

```bash
npm run dev               # Dev server
npm run build             # Production build
npm run typecheck         # tsc --noEmit
npm run seed              # Seed Firestore with OHS data
npm run firebase:rules    # Deploy firestore.rules
npm run firebase:indexes  # Deploy firestore.indexes.json

# Cloud Functions (run inside functions/)
cd functions && npm run build    # Typecheck/compile
cd functions && npm run deploy   # Deploy functions
cd functions && npm run logs     # Tail function logs
```

## Security notes

- **Never commit `.env.local`** — gitignored. The service-account private key
  must never reach the browser or the repo.
- Firestore rules deny by default; every new collection needs an explicit
  `match` block. Test rule changes with the emulator before deploying.
- Server code (Admin SDK) bypasses rules — keep Admin SDK imports out of any
  `'use client'` file.
- The audit log is server-write-only and admin-read-only by rule.
