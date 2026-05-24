# Firestore Data Model

The system was originally designed on Postgres (relational, 13 tables, RLS).
This document records how that model maps onto Firestore, and the design
choices the NoSQL shape forces.

TypeScript interfaces for every document live in [`lib/types/models.ts`](../lib/types/models.ts).

## Collection layout

```
users/{uid}                                 UserDoc
programs/{programId}                         ProgramDoc   (PLOs embedded as array)
courses/{courseId}                           CourseDoc
offerings/{offeringId}                       OfferingDoc  ← core working entity
  └─ aiReports/{reportId}                    AiReportDoc
  └─ assessments/{assessmentId}              AssessmentDoc
  └─ verifications/{verificationId}           VerificationDoc
implementationReviews/{reviewId}             ImplementationReviewDoc
notifications/{notificationId}               NotificationDoc
auditLog/{logId}                             AuditLogDoc
```

## Files are NOT stored

Source documents (TQF3/4, TQF5/6, grade reports, supporting files) are
**transient**: the lecturer's browser sends them to a server action, which
streams them to Gemini and discards them. Nothing is written to Firestore or
Storage for the inputs — `AiReportDoc.inputFiles` keeps only filenames as an
audit record of what was analyzed.

The **only** stored artifact is the generated PDF report, which goes to
**Firebase Storage** (`reportStoragePath` / `reportDownloadUrl` on
`AiReportDoc`). This is also the link recorded in the lecturer-action log
Sheet.

## Key design decisions (and why they differ from the Postgres design)

### 1. Roles are denormalized onto the user document

Postgres used a `role_assignments` table joined at query time. Firestore
security rules **cannot join** — they can only `get()` one document. So each
user doc carries:

```
roles: {
  isAdmin: boolean,
  directorOf: [programId],
  assessorOf: [programId],
  verifierOf: [programId]
}
```

`verifierOf` is for verification committee members who can review
final-assessed offerings for selected programs.

Rules authorize by reading the caller's own `users/{uid}` doc. The
**lecturer** role is the exception: it is per-offering, so it lives on
`offerings/{id}.lecturerId` rather than in the user doc (a lecturer can be
assigned to dozens of offerings; an array would grow unbounded).

### 2. PLOs are embedded in the program document

There are only ~6 PLOs per program and they are always read together with
the program. An embedded array (`ProgramDoc.plos`) avoids an extra read.
A subcollection would be over-engineering.

### 3. AI reports, assessments, and verifications are subcollections of the offering

They are owned by exactly one offering and always queried within its scope.
Subcollections keep them naturally partitioned and let security rules
inherit the offering's `programId` via the parent path. (There is no
`uploads` subcollection — see "Files are NOT stored" above.)

Each offering allows at most 4 accepted AI-analysis attempts. The counter
lives on `OfferingDoc.analysisAttemptCount`; failed accepted runs still count.
Only the latest `aiReports/{reportId}` document is retained for the offering,
and it records the offering's `academicYear`, `semester`, and `createdAt`.

### 4. `programId` and course identity are denormalized onto offerings

Security rules and list views need the program and course code without a
join. `OfferingDoc` carries `programId`, `courseCode`, `courseNameTh/En`.
The cost: when a course is renamed, offerings must be updated too — handled
in the admin course-edit action.

### 5. No generated columns — rubric scoring is computed in code

Postgres computed `total_score` / `max_score` as generated columns. Firestore
has none. `computeRubricResult()` in `lib/types/models.ts` computes
total/max/percent/band; the server writes them as plain fields on the
`AssessmentDoc` whenever scores change. `na` items are excluded from both
numerator and denominator (denominator is 18 or 21 depending on
`hasExamAssessment`).

### 6. Audit log is written explicitly by server code

Postgres used triggers. Firestore triggers require Cloud Functions. For v1
without Cloud Functions, every server action that mutates data also appends
an `auditLog` document in the same logical operation. Security rules make
`auditLog` create-only and admin-read-only so it cannot be tampered with
from the client. **If we later add Cloud Functions, move audit writes into
an `onWrite` trigger for guaranteed coverage.**

### 7. Dashboards need denormalized counters

Firestore cannot do `GROUP BY` / aggregate across collections cheaply. For
Phase 5 dashboards (status distributions, score bands, recurring-weakness
counts), we will maintain counter documents (e.g.
`programs/{id}/stats/{year-semester}`) updated transactionally on offering
status changes and assessment sign-off. Designed when Phase 5 lands.

## Status lifecycle (`OfferingDoc.status`)

```
draft
  → documents_pending      (lecturer assigned, awaiting uploads)
  → ready_for_ai           (required files uploaded)
  → ai_in_progress
  → ai_complete            (AI report ready; lecturer may review/re-run)
  → pending_assessment     (lecturer sent result to assessor queue)
  → assessor_review        (assessor saved a draft)
  → assessed               (assessor signed off)
  → verification_review
  → verified | needs_follow_up   (committee final verification)
  → pending_review_next_semester
  → implemented | not_implemented   (verified next semester — advisory gate)
```

Phase 4B writes the final committee decision to
`offerings/{offeringId}/verifications/{verificationId}` and transitions the
offering to `verified` or `needs_follow_up`.

## Indexes

Composite indexes required by app queries are declared in
[`firestore.indexes.json`](../firestore.indexes.json). Notable ones:

- `offerings` by `programId` + `academicYear` + `semester`
- `offerings` by `lecturerId` + `updatedAt desc`
- `offerings` by `status` + `programId`
- `notifications` by `recipientId` + `readAt` + `createdAt desc`
- `auditLog` by `entityType` + `entityId` + `occurredAt desc`

## Security rules

[`firestore.rules`](../firestore.rules) ports the role permission matrix.
Because rules cannot join, they rely on the denormalized `programId` on
offerings and the `roles` map on user docs. The authoritative server checks
(`getSessionUser`, server actions) are the second line of defense.
