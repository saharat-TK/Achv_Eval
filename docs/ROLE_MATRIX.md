# Role × Capability Matrix

Canonical reference for what each role can do. Source of truth for both
`firestore.rules` and the server actions / API routes. Keep this in sync
when role behaviour changes.

## Roles

- **Super Admin** — `users/{uid}.roles.isSuperAdmin = true` (always also
  `isAdmin = true`). The only role that can manage admin accounts:
  grant/revoke admin or super-admin, and edit or deactivate an admin.
  Strict superset of Admin.
- **Admin** — `users/{uid}.roles.isAdmin = true`. System-wide management
  of programs, courses, offerings, and non-admin users. Cannot touch
  admin or super-admin accounts.
- **Program Admin** — `directorOf` contains the program id. Per-program;
  also referred to as ประธานหลักสูตร / program director.
- **Assessor** — `assessorOf` contains the program id. Per-program.
- **Verifier** — `verifierOf` contains the program id. Per-program;
  member of the verification committee.
- **Lecturer** — `offerings/{id}.lecturerId == uid` decides *which*
  offerings a user owns (per-offering). A `users/{uid}.roles.isLecturer`
  flag (auto-granted one-way on offering assignment, also settable
  manually) drives whether the "รายวิชาที่รับผิดชอบ" workspace appears in
  the cross-workspace switcher. The `/lecturer` workspace itself stays
  open to any signed-in user.

A user can hold more than one role; checks short-circuit on the first
matching role.

## Capability matrix

Legend: ● allowed · ◐ read-only · ○ denied.

"Admin" column below = both Admin and Super Admin (Super Admin is a
superset). Capabilities unique to Super Admin are listed separately
under **Users & roles**.

| Capability | Admin | Program Admin | Verifier | Assessor | Lecturer |
|---|:-:|:-:|:-:|:-:|:-:|
| **Programs** |
| List programs (scope) | all | own | own (read) | own (read) | own offering's |
| Create program | ● | ○ | ○ | ○ | ○ |
| Edit program (PLOs, …) | ● | ● (own) | ○ | ○ | ○ |
| Soft-delete / restore | ● | ○ | ○ | ○ | ○ |
| Hard delete (guarded) | ● | ○ | ○ | ○ | ○ |
| Purge (destructive) | ● | ○ | ○ | ○ | ○ |
| **Courses & offerings** |
| Manage courses (create / edit / CSV) | ● | ● (own program) | ○ | ○ | ○ |
| Course soft-delete / restore | ● | ○ | ○ | ○ | ○ |
| Course hard delete (cascade-guarded) | ● | ○ | ○ | ○ | ○ |
| Course purge (destructive) | ● | ○ | ○ | ○ | ○ |
| Create / edit offering | ● | ● (own program) | ○ | ○ | ○ |
| Assign lecturer | ● | ● (own program) | ○ | ○ | ○ |
| Clone offering from previous | ● | ● (own program) | ○ | ○ | ○ |
| Edit own offering | ● | ● | ○ | ○ | ● (own) |
| **AI analysis** |
| Trigger `analyzeCourse` | ○ | ○ | ○ | ○ | ● (own offering) |
| Read AI report | ◐ | ◐ (own program) | ◐ (own program) | ◐ (own program) | ◐ (own offering) |
| **Assessment (sign-off)** |
| Draft / sign assessment | ○ | ○ | ○ | ● (own program) | ○ |
| Read assessment | ◐ | ◐ (own program) | ◐ (own program) | ◐ (own program) | ◐ (own offering) |
| Generate combined PDF | ● | ○ | ○ | ● (own program) | ○ |
| **Verification (final sign-off)** |
| Sign final verification | ○ | ○ | ● (own program) | ○ | ○ |
| Generate final-verification PDF | ○ | ○ | ● (own program) | ○ | ○ |
| Read verification queue / record | ◐ | ◐ (own program) | ◐ (own program) | ◐ (own program) | ◐ (own offering) |
| **Implementation review** (next-semester loop) |
| Create review | ○ | ○ | ● (own program) | ● (own program) | ○ |
| Read review | ◐ | ◐ (own program) | ◐ (own program) | ◐ (own program) | ○ |
| **Users & roles** |
| Read user profiles | ● | ● | ● | ● | ● |
| Edit own profile (no roles) | ● | ● | ● | ● | ● |
| Change roles / activate / deactivate (non-admin targets) | ● | ○ | ○ | ○ | ○ |
| Manage admin accounts (grant/revoke admin or super-admin, edit/deactivate an admin) | Super Admin only | ○ | ○ | ○ | ○ |
| **Dashboards & exports** |
| Executive dashboard | ● (all) | ● (own) | ○ | ○ | ○ |
| CSV / print PDF export | ● | ● (own) | ○ | ○ | ○ |
| **Notifications** |
| Read own notifications | ● | ● | ● | ● | ● |
| Mark as read | ● | ● | ● | ● | ● |
| **Audit log** |
| Read `auditLog` | ● | ○ | ○ | ○ | ○ |

## Notes on design intent

1. **Sign-off is strictly role-bound.** Signing an assessment requires
   `assessorOf`; signing a final verification requires `verifierOf`.
   The signature carries the signer's name and date — admins do not
   sign on behalf of a committee. This is enforced by the server
   routes (`/api/assessor/submit`, `/api/verification/submit`) and by
   `firestore.rules` (which deliberately exclude `isAdmin()` from
   those write paths).
2. **Read access is broad.** Anyone with a stake in the program
   (admin, director, assessor, verifier, lecturer) can read offerings,
   assessments, and verifications for that program. Visibility is not
   gated by the specific role that wrote the record.
3. **Lecturer is per-offering.** Lecturer status lives on
   `offerings.lecturerId`, not on `users.roles` — a person can be a
   lecturer for one offering and not another.
4. **Verifier ⊃ committee.** Directors of a program are not
   implicitly on the verification committee. To sit on it, the
   director must also be added to `verifierOf` for their program.
5. **Admin viewing.** An admin without `assessorOf` may still enter
   `/assessor` to view offerings — but cannot sign. Useful for support.
6. **Audit log is read-only and admin-only.** The collection is
   write-disabled for clients; server actions append. Admins (and
   super admins) can read it.
7. **Super Admin gates admin management.** A plain admin can manage
   directors, assessors, verifiers, lecturers, and non-admin user
   accounts — but cannot grant/revoke admin or super-admin, nor edit
   or deactivate an admin account. Only a super admin can. Enforced in
   `updateUserRoles` / `setUserActive` (server actions) with a
   `firestore.rules` backstop, and guarded by a last-active-super-admin
   safeguard. Super admin is a strict superset: granting it also sets
   `isAdmin = true`. Bootstrap the first super admin with
   `npm run assign-role -- <email> superadmin`.

## When to update this file

Any time you change:
- a role check in `firestore.rules`,
- an authorization guard in an API route or server action,
- a role gate on a layout or page,
- the role data model (`users.roles`),

update the matrix above in the same commit.
