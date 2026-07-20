# 23 — Pending-member capability (never block book/cancel/check-in)

Type: grilling
Status: resolved
Blocked by: —

## Question
Locked v1 said a pending member holds no role and cannot act (14/20). The low-friction scope needs pending members to see the schedule and book. What can a pending member do, safely?

## Answer (decided)
**A pending member can:** see **their own academy's** schedule, **book/cancel** their own (provisional — [22](22-provisional-booking-capacity.md)), and **self check-in** ([24](24-qr-self-checkin.md)). **Nothing else** — no roster, no other members' data, no staff/owner actions, and **no other academy's schedule** (must be registered at that academy to see it).

**Never blocked (#2):** even if the owner is slow or the class is full, the basic book/cancel/check-in mechanism always works for a registered (pending) user — because it's provisional, it can't harm capacity.

**Security (reconciles [14](14-better-auth-approval-feasibility.md)/[20](20-instructor-permissions-and-approval-gate.md)):** Better Auth still ignores `status`, so we **do not** grant the full `student` role at join. Instead a new **`enrolledProcedure`** tier permits *read-own-academy-schedule + provisional book/cancel + check-in* for any member row (status `pending` or `active`). The `student` role (and confirmed-booking priority) is still granted **only at approval**. Everything above student (staff/owner) is unchanged. So pending = minimal, safe capability; approval = upgrade to confirmed + roster member.

Refines [14](14-better-auth-approval-feasibility.md), [20](20-instructor-permissions-and-approval-gate.md).

## ⚠ Pressure-test refinement (session 12)
The `enrolledProcedure` (pending / view-only) tier now also covers **unapproved instructors** (finding E2) — identical view-only access until approval. Privacy (finding E1): pending users and drop-ins **see only counts, never member names**; only approved members see who's in a class.
