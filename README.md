# Course Evaluation & Monitoring System

ระบบประเมินและทวนสอบรายวิชา สำนักวิชาวิทยาศาสตร์สุขภาพ มหาวิทยาลัยแม่ฟ้าหลวง

Per-semester workflow: lecturers upload TQF documents → Gemini analyzes them
against the school's evaluation guideline → assessors review the AI output,
score with the 7-item rubric, sign off → status carries forward to next
semester for verification.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Auth & DB:** Supabase (Postgres + Auth + RLS), Google SSO restricted to `@mfu.ac.th`
- **AI:** Google Gemini 2.5 Pro (single-shot, with deterministic grade-stats hybrid)
- **File storage:** Google Drive (owned by Academic & QA Department)
- **Visibility mirror:** Google Sheets nightly export for QA department
- **Notifications:** Gmail API (in-app inbox + email)
- **Hosting:** Vercel

See `prompts/CLAUDE.master.md` and `prompts/CLAUDE.undergrad.md` for the
evaluation framework the AI follows.

## Project status

Phase 0 (foundation) — **in progress**

- [x] Schema + RLS migrations
- [x] OHS seed data
- [x] Next.js scaffold + Google SSO callback
- [x] Domain-restriction middleware
- [ ] First end-to-end test in the linked Supabase project
- [ ] Phase 1: lecturer flow
- [ ] Phase 2: assessor flow
- [ ] Phase 3: admin/director management
- [ ] Phase 4: cross-semester verification
- [ ] Phase 5: dashboard
- [ ] Phase 6: notifications
- [ ] Phase 7: hardening + audit-log UI

## Prerequisites

- Node.js 20+
- A Supabase project (already provisioned — `msyvlbdyynbesfkpdpip`)
- A Google Cloud project with:
  - OAuth 2.0 client for Supabase Auth
  - Drive API, Sheets API, Gmail API enabled
  - A service account JSON key for backend access
- A Gemini API key from <https://aistudio.google.com/app/apikey>

## A note on OneDrive

This folder lives inside OneDrive. **Do not let OneDrive sync `node_modules`
or `.next`** — it will sync hundreds of thousands of files and lock build
output. Two options:

1. **Right-click `node_modules` and `.next` after first install → "Always
   keep on this device" then "Free up space"** so OneDrive marks them as
   local-only.
2. **Develop in a non-OneDrive directory** (e.g. `~/dev/Achv_Evaluation_app`)
   and sync only your source changes back via git.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
# Fill in the values
```

Required for Phase 0 sign-in:

- `NEXT_PUBLIC_SUPABASE_URL` — already filled to `msyvlbdyynbesfkpdpip`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — copy from Supabase dashboard → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — same dashboard, for privileged ops
- `SUPABASE_DB_URL` — Postgres connection string for the `supabase` CLI

### 3. Apply database migrations

```bash
# Link to the remote project
npx supabase login
npx supabase link --project-ref msyvlbdyynbesfkpdpip

# Push migrations
npx supabase db push

# Apply seed (one-time, dev only)
psql "$SUPABASE_DB_URL" -f supabase/seed.sql

# Generate TypeScript types from the schema
npm run db:types
```

### 4. Configure Google OAuth in Supabase

1. Supabase Dashboard → **Authentication** → **Providers** → **Google** → Enable
2. Paste your Google OAuth Client ID and Secret
3. Set the authorized redirect URI in Google Cloud Console:
   ```
   https://msyvlbdyynbesfkpdpip.supabase.co/auth/v1/callback
   ```
4. Under **Authentication → URL Configuration** add to **Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   https://<your-vercel-domain>/auth/callback
   ```

The login screen passes `hd=mfu.ac.th` as a Google consent-screen hint, and
the app's `/auth/callback` route plus middleware enforce the domain server-
side. A CHECK constraint on `profiles.email` is the final defense.

### 5. Run locally

```bash
npm run dev
# → http://localhost:3000
```

You should land on `/login` → sign in with an `@mfu.ac.th` account → land
on the home page showing your email. The `profiles` row is created
automatically by the `handle_new_user` trigger.

To grant yourself admin (until the admin UI ships in Phase 3):

```sql
-- Run in Supabase SQL Editor
insert into role_assignments (user_id, role)
values ((select id from profiles where email = 'saharat.arr@mfu.ac.th'), 'admin');
```

## Project structure

```
app/
  layout.tsx, page.tsx, globals.css   App shell
  login/page.tsx                      Google sign-in
  auth/callback/route.ts              OAuth callback + domain guard
  (lecturer)/                         Phase 1
  (assessor)/                         Phase 2
  (admin)/                            Phase 3
  api/                                Server route handlers

lib/
  supabase/
    client.ts                         Browser client
    server.ts                         Server client + service-role helper
    middleware.ts                     Session refresh + domain guard
  types/database.ts                   Generated from schema

middleware.ts                         Next.js middleware entry

prompts/                              AI evaluation guidelines (authoritative)
  CLAUDE.master.md                    For master/doctoral programs
  CLAUDE.undergrad.md                 For undergraduate programs

supabase/
  config.toml
  migrations/
    20260515000001_initial_schema.sql Tables, enums, triggers, audit
    20260515000002_rls_policies.sql   RLS policies + auto-profile
  seed.sql                            OHS program seed
```

## Useful commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run typecheck    # tsc --noEmit
npm run db:push      # Push migrations to remote Supabase
npm run db:reset     # Reset local DB and re-apply migrations + seed
npm run db:types     # Regenerate lib/types/database.ts
```

## Security notes

- **Never commit `.env.local`.** It's gitignored.
- **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.** It bypasses RLS.
- **Rotate the database password** before pointing production at it. The
  initial password may have been exposed during setup.
- RLS is enabled on every public table. Test new tables with `SET ROLE` to
  verify policies before deploying.
