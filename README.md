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

Phase 0 (foundation) — **in progress**

- [x] Firebase Auth with Google SSO + `@mfu.ac.th` enforcement
- [x] Server session cookies + middleware gate
- [x] Firestore data model, security rules, indexes
- [x] OHS seed script
- [ ] First end-to-end sign-in test against a live Firebase project
- [ ] Phase 1: lecturer flow · Phase 2: assessor flow · Phase 3: admin
- [ ] Phase 4: verification · Phase 5: dashboard · Phase 6: notifications · Phase 7: hardening

## Prerequisites

- Node.js 20.6+ (the `seed` script uses `--env-file`)
- A Firebase project with **Authentication** (Google provider) and
  **Cloud Firestore** enabled
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

### 6. Seed the OHS program

```bash
npm run seed
```

Creates 1 program (6 TQF PLOs), 5 courses, 1 sample offering.

### 7. Run locally and promote yourself to admin

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
  (lecturer)/ (assessor)/ (admin)/    Phases 1–3

lib/
  firebase/
    config.ts                         Client SDK (lazy init)
    admin.ts                          Admin SDK (lazy init)
    auth-server.ts                    Session verification helpers
  types/models.ts                     Firestore document types + rubric scoring

middleware.ts                         Session-cookie gate

prompts/                              AI evaluation guidelines (authoritative)
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
```

## Security notes

- **Never commit `.env.local`** — gitignored. The service-account private key
  must never reach the browser or the repo.
- Firestore rules deny by default; every new collection needs an explicit
  `match` block. Test rule changes with the emulator before deploying.
- Server code (Admin SDK) bypasses rules — keep Admin SDK imports out of any
  `'use client'` file.
- The audit log is server-write-only and admin-read-only by rule.
