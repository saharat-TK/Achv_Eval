# Offering deletion model: no soft-delete, two destructive ops shared by both surfaces

We manage offerings from two surfaces — the **Offering Course Manager**
(whole-group batch planning) and a per-offering panel on the curriculum
offerings page. Both expose exactly two destructive operations with identical
rules: **safe-delete** (removes only no-data offerings — status `draft` /
`documents_pending` — allowed for program directors and admins) and **purge**
(destructive cascade removal regardless of status, admin / super-admin only;
directors never purge). Both gate behind typing the fixed keyword `ยืนยัน`.

We deliberately **rejected per-offering soft-delete** (the originally-planned
"Mode 1", toggling `offering.isActive`). `isActive` on an offering is set
**only** by cascade from its parent course/curriculum. The reason: an
individually soft-deleted offering would be silently re-activated the next time
a parent course or curriculum is restored (`cascadeOfferingsActive` re-runs
blindly), making the "hidden" state unreliable. With no soft-delete, an offering
is either present or gone — no ambiguous middle state and no cascade footgun.

Consequences: there is intentionally no way to temporarily hide a single
offering — if you want it gone, safe-delete (no data) or purge (admin). A future
change that reintroduces per-offering `isActive` toggling must first solve the
blind-cascade re-activation, or it will recreate the bug this decision avoids.
