# 20 — Instructor permissions + keep-or-drop the approval gate

Type: grilling
Status: resolved
Blocked by: —

## Question

**Refines [09](09-mvp-product-spec.md).** Two product/authorization decisions the spec left implicit:

**A. Instructor scope.** The spec says instructors "manage classes/templates" but never bounds it:
- Can an instructor create/edit/cancel *any* class, or only classes where they are the assigned instructor?
- Can they edit recurring templates, or only concrete class instances?
- Are instructors themselves subject to the pending→approved gate, or do owners add them directly (per-role invite link)?
Define the instructor permission set precisely (it becomes the role checks in the tRPC procedures / [12](12-tenant-isolation-mechanism.md)).

**B. Keep the approval gate?** The self-join → `pending` → owner-approves gate was kept only because "roster + approval" was in scope, but its original purpose (enforce plan caps at approval) is gone (billing is out). For flawless-simple UX, invite-link = **immediate active membership** may be better. Decide: keep the approval gate, or drop it (invite link grants access directly)? If kept, justify the friction; if dropped, note owners can still remove/suspend. Interacts with [14](14-better-auth-approval-feasibility.md) (if Better Auth can't model pending cleanly, dropping the gate also removes that risk).

Output: the instructor permission matrix + the keep/drop decision on approval with rationale.

## Answer

### A. Instructor permissions — "run the whole schedule"
Three roles, simple split (fits 1–5 trusted staff):

| Capability | Owner | Instructor | Student |
|---|---|---|---|
| Academy settings (name, tz) | ✅ | — | — |
| Invite links (create/rotate) | ✅ | — | — |
| Roster: approve / remove / suspend members | ✅ | — | — |
| Classes + recurring templates: create/edit/cancel (**any**, not just own) | ✅ | ✅ | — |
| Take attendance (any class) | ✅ | ✅ | — |
| Book / cancel own bookings, view schedule | ✅* | ✅* | ✅ |

\*owner/instructor can also be students of their own gym if desired (role is per-membership).

**tRPC procedure tiers** (built on the tenant middleware, which sets `app.academy_id` and requires an **active** membership): `ownerProcedure` (settings, invites, roster) · `staffProcedure` = owner **or** instructor (classes, templates, attendance) · `memberProcedure` = any active member (book/cancel, read). Instructor scope is **not** narrowed to "own classes" in v1 (avoids per-class ownership checks; revisit only if a gym with many independent coaches needs it).

### B. Approval gate — keep for students, add staff directly
- **Owner:** creating an academy → immediately an **active owner**.
- **Student:** opens the **student invite link** → authenticates → a `member` row is created **`status='pending'` with NO role granted yet** → sees the "waiting" screen (S3) → owner approves → **role `student` is assigned + `status='active'`** → access. The "waiting" screen auto-advances (poll).
- **Instructor:** owner shares the **instructor invite link** (or adds directly) → on join the member is created **active with role `instructor`** — no approval step (staff are trusted; the owner controls that link).

**Why this is safe (from [14](14-better-auth-approval-feasibility.md)):** Better Auth's access checks are **role-based and ignore our `status` field**. So we grant the **role only at approval** — a pending student holds no role and therefore passes no check, even if a status guard is ever missed. Defense-in-depth: the tenant middleware also rejects `status !== 'active'`.

**Invite links:** owner-managed, **per-role**. The link's role decides both the granted role and whether approval applies (student link → pending+approve; instructor link → immediate active). Note the instructor link grants active staff on use, so the owner shares it deliberately.

**Refines** the product spec ([09](09-mvp-product-spec.md)): fills in the instructor permission set and the exact join/approve flow for each role.

## ⚠ Refined by the low-friction wave (session 11)
The approval gate is now **soft**: pending students can already see the schedule and provisionally book/check-in ([23](23-pending-capability-never-block.md)); approval **confirms** them (provisional → confirmed spot + roster membership), it no longer blocks all access. Instructor permissions here are unchanged.

## ⚠ Pressure-test refinement (session 12) — approval is now UNIFORM
Reverses "staff added directly." **Instructors also join pending / view-only** (same as an unapproved student: browse + book + check-in, no names, no tools) and get schedule/attendance write tools **only after owner approval**. The instructor link carries the intended role but grants nothing until approved — closes the leaked-link risk (finding E2). Instructor *capabilities once approved* are unchanged (whole schedule + attendance).
