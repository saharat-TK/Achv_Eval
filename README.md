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

Late Phase 3 (stabilization) — **in progress**

- [x] Firebase Auth with Google SSO + `@mfu.ac.th` enforcement
- [x] Server session cookies + middleware gate
- [x] Firestore data model, security rules, indexes
- [x] OHS seed script
- [x] Phase 1A: lecturer workspace, dashboard, offering detail
- [x] Phase 1B: Gemini analysis pipeline (`analyzeCourse` Cloud Function)
- [x] Phase 1C: report PDF (`generateReportPdf`) → Firebase Storage + log Sheet
- [x] Phase 2: assessor flow · Phase 3: admin
- [x] Phase 4: verification — next-semester implementation review
- [ ] Phase 5: dashboard · Phase 6: notifications · Phase 7: hardening
- [x] Phase 2A: assessor workspace & inbox
- [x] Phase 2B: 7-item rubric evaluation form & sign-off
- [x] Phase 2C: combined report PDF (AI analysis + assessor form) on sign-off
- [x] Phase 3A: admin workspace & program management (PLO editor)
- [x] Phase 3B-1: course management & CSV batch upload
- [x] Phase 3B-2: offering management — lecturer assignment & clone-from-previous
- [x] Phase 3C: user & role management
- [ ] Phase 3D: end-to-end validation, lint/build gate, deployment checklist ([docs/PHASE3_VALIDATION.md](docs/PHASE3_VALIDATION.md))
- [x] Phase 4A: verification committee role, status model, read-only queue
- [ ] Phase 4B: verification decision form, final sign-off, final PDF
- [ ] Phase 5: executive dashboard (school-wide analytics)
- [ ] Phase 6: notifications (email & in-app alerts)
- [ ] Phase 7: hardening & load testing

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
