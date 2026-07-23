# 41 · Member rank & staff notes — per-discipline ranks the coach sets, private coaching notes

*(v1.4 "Rank & Notes". **Promotes** "belts/rank" out of the Parked "deferred domains" list — [roadmap.md](../roadmap.md#parked--next-iteration-do-not-build-in-v1), map "out of scope". Builds on attendance-derived stats and the tenant seam — [39](39-attendance-derived-stats.md), [33](33-tenant-seam-enforcement.md), [08](08-mvp-domain-model.md). Driven by competitor + practitioner research: rank is the loudest "not BJJ-native" owner gap and a student progress hook — but auto-progress prediction clashes with how grading actually works.)*

## Context

Spec §5 and the map list **belts & rank progression** as out of scope. Research across owner reviews (Gymdesk: *"No option to bulk upgrade student belt rankings"*; PushPress: *"no native belt support"*; Wodify: *"weak on belt/promotion workflows"*) and student trackers (belt timelines are named and loved) says the same thing from both sides: a BJJ tool without rank does not read as *for BJJ*, and students want to see where they stand. This is the first rank work, so it needs an explicit decision to un-park it (roadmap rule: *"promote to a slice only on purpose — an ADR or a new roadmap row"*).

The open questions were: is rank one field or many; who writes it; how "general" the model must be; whether to gamify progress; and what to do with the adjacent, much-hyped **student training journal**.

Two research findings shaped the answer against the obvious build:

1. **Auto-progress is culturally toxic.** BJJ grading is instructor-controlled and explicitly *not* earned by class count. A "you're 80% to blue belt" bar reads as McDojo and insults the exact coaches we need. So rank is a **judgment the coach records**, never a computation.
2. **A student training journal is the wrong product.** The love for logging comes from App-Store reviews of self-chosen trackers — survivorship bias; the median student journals for two weeks and quits. The market is crowded and free (Marune, BJJ Buddy, BJJ Notes), the buyer is the owner (a journal does nothing for running the gym), and it is a whole second product. We **reject** it — not defer it — and instead give staff a **private note** about a member (coaching memory), which is buyer-aligned and cannot decay from member disuse.

## Decision

### Rank is per-discipline, staff-set, and never automated
A member holds **zero or more ranks — one per discipline** (a judoka-and-jitser holds a Judo rank *and* a BJJ belt independently). The owner or instructor sets and changes rank on their own judgment, informed by the attendance stats already on the member panel ([39](39-attendance-derived-stats.md)). There is **no** attendance→promotion automation, **no** progress bar, **no** "next belt" prediction. That is a deliberate non-goal, not a missing feature — see *What stays out*.

### The rank model is general; BJJ is seeded; multi-discipline is progressive disclosure
A **rank system** = an ordered list of named levels + an optional sub-level count (stripes for BJJ, degree for Judo). Each rank a member holds names its discipline. BJJ (White · Blue · Purple · Brown · Black, stripes 0–4) is **seeded**, so a single-discipline gym configures nothing — it just sets belts. A gym that teaches more than one art adds a discipline and picks its rank system; a discipline with no ranks (boxing, MMA) simply shows no rank control. This keeps the common case zero-config and avoids the "over-powered admin panel / high learning curve" pain the research flagged.

**Rank systems ship as a seeded domain constant, not owner-editable tables (v1.4).** The discipline picker is populated from the gym's existing class disciplines (templates/classes already carry `discipline`) plus the seeded systems. A full owner-defined **custom rank-ladder editor** is later. This is the pragmatic reading of "BJJ now, generalise later": rank is stored as **data** (a discipline + a rank value + stripes), never a hard `Belt` enum threaded through the code, so a new discipline is additive config — no refactor — while v1.4 still avoids building a rank-system editor.

### Rank is staff-write, student-read; not at registration
Only owner/instructor writes rank. The student sees **their own** ranks + promotion history read-only in profile. Rank is **not** collected in the join flow — first touch stays light (spec §2 student-friction principle).

### Promotion records history
Changing a rank appends an **immutable promotion record** (discipline, from → to, stripes, when, by whom). The student-facing **promotion timeline** is this history — the one rank surface students actually enjoy, and it rides entirely on staff actions.

### Staff notes replace the student journal
Instead of a member-facing training log, the owner/instructor keeps **private notes about a member** — free-text coaching memory (injuries, goals, readiness, personality), timestamped and authored. Visible to **all staff at that academy** (shared coaching context — the next coach on the mat sees "recovering knee, no leglocks"), **never** to the member.

### Per-academy, on the RLS seam
All new tables carry `academy_id` + the standard policy `USING (academy_id = current_setting('app.academy_id'))`, matching the `drop_in`/payments pattern ([25](25-dropin-lead-form.md), [40](40-manual-transfer-payments.md)). Ranks and notes are **academy-local**: a member who trains at two gyms has independent ranks and notes per academy, same as dues and the v1.2 stats ([39](39-attendance-derived-stats.md)). Every read/write runs on the scoped `ctx.db`; the only base-connection reads are those that must join Better Auth's `member` table (the enumerated seam exception, same as `membership.ts`/payments).

### Schema (new migration, slice G.1)
Three tenant-scoped tables — no discipline/rank-system tables (ladders are the seeded constant):
- `member_rank` (id, academy_id, member_id, discipline, rank, stripes, updated_by, updated_at) — a member's **current** rank per discipline. `UNIQUE(academy_id, member_id, discipline)`.
- `rank_promotion` (id, academy_id, member_id, discipline, from_rank, from_stripes, to_rank, to_stripes, promoted_by, promoted_at) — **append-only** history; the student timeline reads this.
- `member_note` (id, academy_id, member_id, body, author_id, created_at) — one row per staff note.

### One shared pure engine — `packages/domain/src/rank.ts`
All rank math is pure (no I/O, no clock) and tested in isolation:
- `rankSystems` — the seeded ordered ladders (BJJ white→black + stripes 0–4; extensible by adding a key).
- `isValidRank(discipline, rank, stripes)` — a target must exist in that discipline's system; guards the set/promote mutation.
- `formatRank(discipline, rank, stripes)` → the display string (owner panel, student profile).
- `canManageRank(role)` / `canWriteNote(role)` — staff-only guards (owner + instructor).

### What stays out (still parked)
- **Attendance→promotion automation, progress bars, "% to next belt"** — the culturally-toxic part; deliberately never built this way.
- **Owner-defined custom rank ladders / a rank-system editor** — v1.4 seeds BJJ (+ a couple of common systems); custom ladders are a later wave.
- **Bulk promotion** (promote many at once) — per-student is right for a small gym (promotion is a ceremony); bulk is a kids-program / multi-location scale need, later.
- **Student-facing training journal / log** — submissions, rolls, competition résumé, per-session notes. **Rejected, not deferred**: crowded free market, wrong buyer, median student does not log. A different product.
- **Rank at registration, rank certificates/PDF, kids/parent multi-profile, curriculum.**

## Consequences

- matops becomes credibly BJJ **and** multi-discipline without gamifying grading — the demo checkbox owners expect, minus the McDojo culture clash.
- Students get a real progress surface (their rank + promotion timeline) with **zero** new logging burden — it rides on staff actions, so it can't decay from member disuse (the failure mode that kills journaling apps).
- Coaches get shared memory (notes) — the safe, buyer-aligned slice of "notes", never member-visible.
- New domain is additive: three schema files + one pure module + annotations to O4/O6/S7 — the tenant seam is untouched (architecture §8). A non-BJJ academy is config, not code.
- Verified by the `rank.ts` domain unit tests first (delivery.md §5) + a PGlite RLS leak test on the three tables; owner/student surfaces ride slices G.2–G.4.
- **Riskiest assumption:** owners promote in-app often enough to keep rank fresh — if they don't, ranks go stale and students stop trusting the timeline. Cheapest test: watch one real gym through a promotion cycle before investing further. If rank goes stale, the student surface (G.3) is the first thing to reconsider.
- Deferred: progress automation, custom ladders, bulk promote, the student journal, certificates, kids profiles.

## Addendum — rank only goes up (monotonic promotion)

The original G.2 `set` control accepted a rank change in **any** direction — a demotion was as valid as a promotion. That is wrong for how belts work: in BJJ (and Judo) a rank is **never taken away** as part of normal grading. A downward "set" is almost always a typo (wrong belt or one stripe too many), not an intended demotion.

**Decision:** `rank.set` is now **monotonic** — a rank may be **bumped, never lowered**. Two pure helpers in `rank.ts` enforce it:
- `compareRank(discipline, a, b)` — orders two ranks in one ladder. Belt position dominates; the stripe count only breaks a tie within one belt (so *White · 4 stripes* is still below *Blue · 0*). A belt not in the ladder sorts below every real belt, so a retired belt can't block a fresh valid one.
- `isRankRegression(discipline, current, next)` — true only when there is a current rank **and** `next` sits strictly below it. The `set` mutation throws `BAD_REQUEST` on a regression.

**Escape hatch for mistakes:** the correction path is **clear-then-set**, not demote. `rank.clear` removes the member's rank in a discipline (the append-only `rank_promotion` history is kept); with no current rank, the next `set` is unconstrained. The web O4 panel now surfaces a per-discipline **Clear** control (it existed in the router but was never wired into the UI), seeds the Set form to the member's current rank, and disables belt/stripe options below it — so the guard is a safety net, not the primary UX.

This is behavior hardening inside the existing G.2 slice — no schema change, no new domain, the tenant seam untouched. Covered by new `compareRank` / `isRankRegression` unit tests in `rank.test.ts`.
