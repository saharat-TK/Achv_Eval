# AGENTS.md — Achv Evaluation App

Course Evaluation & Monitoring System, School of Health Science, MFU.
Per-semester flow: lecturers upload TQF docs → Gemini analyzes them →
assessors score with the official 7-item rubric and sign off. Thai-language UI.

This file is the orientation for the app. The full evaluation *methodology*
lives in `functions/prompts/Codex.master.md` / `Codex.undergrad.md` — read
those only when changing the AI analysis behavior.

## Stack

Next.js 14 (App Router, TypeScript) · Firebase Auth (Google SSO, `@mfu.ac.th`) ·
Cloud Firestore · Cloud Functions (Gemini 2.5 Pro) · Firebase Storage ·
Tailwind CSS. Repo: github.com/saharat-TK/Achv_Eval · Firebase project:
`achv-evaluation-ohs`.

## Commands

- `npm run dev` — dev server (port 3000)
- `npm run build` — production build; **must pass before every commit**
- `npm run typecheck` — `tsc --noEmit`
- `npm run seed` — seed OHS demo data
- Functions: `cd functions && npm run build` (typecheck) · `npm run deploy`
- `npx firebase deploy --only firestore:indexes` — after adding a composite query

## Layout

- `app/lecturer|assessor|admin/` — the three role workspaces
- `app/**/actions.ts` — server actions (all writes)
- `app/api/` — route handlers (`auth/session`, `assessor/submit`)
- `lib/data/*.ts` — server-side reads (Admin SDK); each has `import 'server-only'`
- `lib/firebase/` — `config.ts` (client SDK, lazy) · `admin.ts` (Admin SDK, lazy) ·
  `auth-server.ts` (`getSessionUser`, `getCurrentProfile`)
- `lib/types/models.ts` — all Firestore document types
- `functions/src/` — Cloud Functions: `analyzeCourse`, `generateCombinedReport`
- `firestore.rules` · `firestore.indexes.json`

## Conventions

- **Reads:** server components call `lib/data/*` (Admin SDK); live lists use a
  client component with Firestore `onSnapshot`.
- **Writes:** server actions or API routes — Admin SDK, explicit role check,
  an `auditLog` entry, then `revalidatePath`.
- **Roles:** on `users/{uid}.roles` — `isAdmin`, `directorOf[]`, `assessorOf[]`.
  The lecturer role is per-offering (`offerings.lecturerId`), not in `roles`.
- **Auth:** Firebase httpOnly session cookie; `@mfu.ac.th` only. Deactivated
  users (`isActive: false`) are blocked at sign-in and by `getCurrentProfile`.

## Gotchas

- The Firestore database is in **`asia-southeast3`**, where Firestore-triggered
  (Eventarc) functions are **not** available — that's why PDF generation runs
  inline inside the `analyzeCourse` callable, not as a trigger.
- Cloud Functions deploy to region **`asia-southeast1`**.
- Any new `where(...) + orderBy(...)` query needs an entry in
  `firestore.indexes.json`, then a deploy — otherwise it fails at runtime.
- This folder may sit inside OneDrive — keep `node_modules` / `.next` out of sync.

## Status

Phases 0–3 complete: foundation, lecturer flow, assessor flow, admin/director
workspace. Next: **Phase 4** — cross-semester verification. Work on feature
branches named `phase-N-...`; build must pass before committing.
