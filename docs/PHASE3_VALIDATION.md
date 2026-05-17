# Phase 3D Validation Checklist

Use this checklist before starting Phase 4 verification committee work.

## Automated Gate

Run these from the project root:

```bash
npm run lint
npm run typecheck
npm run build
cd functions && npm run build
```

All four commands should pass without warnings or TypeScript errors.

## Role Setup

Confirm at least three test users exist in `users/{uid}`:

- Admin: `roles.isAdmin = true`
- Lecturer: assigned as `lecturerId` or `correspondingLecturerId` on a test offering
- Assessor: `roles.assessorOf` includes the test offering's `programId`

## Admin Flow

- Create or edit a program from `/admin`.
- Add or edit courses under a program.
- Upload courses by CSV and confirm rows appear.
- Create or edit an offering.
- Assign the lecturer for the offering.
- Clone offerings from a previous semester and confirm duplicated records.
- Update a user's admin, director, and assessor roles from `/admin/users`.
- Deactivate and reactivate a non-current user.

Expected Firestore outcomes:

- Program, course, offering, and user updates persist.
- `auditLog` receives role and account-management entries.
- Non-admin users cannot access admin-only actions.

## Lecturer Flow

- Sign in as the assigned lecturer.
- Open `/lecturer` and confirm only assigned offerings appear.
- Open the offering detail page.
- Confirm required TQF/document fields are visible.
- Run AI analysis when the required data is available.

Expected Firestore outcomes:

- Offering status advances through the lecturer/AI states.
- `latestAiReportId` is set after analysis.
- AI report PDF metadata is stored when generation succeeds.

## Assessor Flow

- Sign in as an assessor for the offering's program.
- Open `/assessor` and confirm AI-complete offerings appear.
- Open an offering detail page.
- Save a draft assessment.
- Reopen the assessment and confirm draft values reload.
- Sign off the assessment.
- Generate or download the combined signed PDF.

Expected Firestore outcomes:

- Draft save changes offering status to `assessor_review`.
- Sign-off changes offering status to `assessed`.
- Assessment document has `isLocked = true`, `signedAt`, score totals, and follow-up status.
- Combined report URL/path is saved on the assessment.
- Locked assessments cannot be edited.

## Deployment Readiness

- Firestore rules and indexes deploy successfully.
- Cloud Functions deploy successfully in `asia-southeast1`.
- Firebase Storage is enabled and writable by functions.
- `GEMINI_API_KEY` function secret is set.
- `GOOGLE_LOG_SHEET_ID` is set when Sheet logging is required.
- The log Sheet is shared with the functions service account.

When this checklist is complete, Phase 3D can be marked done and Phase 4 can begin.
