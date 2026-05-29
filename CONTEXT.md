# Achv Evaluation — Context

Course evaluation & monitoring for the School of Health Science, MFU. This
glossary fixes the language for the offering hierarchy and the deletion model
shared by the Offering Course Manager and the per-offering lifecycle panel.

## Language

### Hierarchy

**Academic Program**:
The top-level credential a student enrols in (`academicPrograms`). Owns one or
more curricula.
_Avoid_: Faculty, department (those are higher still).

**Curriculum**:
A specific curriculum revision under an academic program (`programs`, linked up
via `parentProgramId`). The unit a course belongs to.
_Avoid_: "Program" unqualified — in code the collection is `programs`, but in
conversation always say **curriculum** so it is not confused with Academic
Program.

**Course**:
A subject within a curriculum (`courses`, `programId` = its curriculum).

**Offering**:
One course taught in one (academic year, semester, section) — the unit that gets
TQF docs, AI analysis, assessment, and verification. An offering's `programId`
is the **curriculum** id, so "offerings of an academic program" is a two-hop
query.
_Avoid_: Class, section (a section is just one field of an offering).

### Offering deletion model

There are exactly **two** destructive operations on an offering, with identical
rules whether triggered from the Course Manager (whole group) or the per-offering
panel (single). There is **no soft-delete for offerings** — `isActive` is set
only by cascade from a parent course/curriculum.

**Safe-delete** (a.k.a. guarded hard-delete):
Deletes an offering only when it holds **no data** — status `draft` (ร่าง) or
`documents_pending` (รอเอกสาร), i.e. no `aiReports` / `assessments` /
`verifications`. Allowed for **program directors** and admins. Offerings that
hold data are skipped and reported as needing a purge.
_Avoid_: "Delete" unqualified.

**Purge**:
Destructive cascade removal of an offering **regardless of status** — drops its
subcollections, Storage PDFs, linked notifications, and `implementationReviews`,
and nulls `previousOfferingId` on any successor. **Admin / super-admin only**;
program directors never purge.
_Avoid_: "Hard-delete" (reserve that for safe-delete's guarded form).

### Flagged ambiguities

- **"Program"** is overloaded: the Firestore collection `programs` holds
  *curricula*. Always disambiguate **Academic Program** vs **Curriculum** in
  prose.
- **"Delete"** is overloaded: always say **safe-delete** (no-data, director-ok)
  or **purge** (any-status, admin-only).

## Example dialogue

> **Dev:** A director wants to remove an offering that's already been assessed.
> **Domain:** They can't. A director only gets **safe-delete**, which refuses
> anything past `documents_pending`. That offering holds assessment data, so it
> needs a **purge** — admin only.
> **Dev:** And if the offering was just created with no docs yet?
> **Domain:** Then it's `draft`, no data, so safe-delete removes it. Same rule
> from the Course Manager group view or the single-offering panel.
