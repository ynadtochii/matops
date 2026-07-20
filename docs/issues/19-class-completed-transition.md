# 19 — Class `completed` status: what flips it

Type: grilling
Status: resolved
Blocked by: —

## Question

**Refines [08](08-mvp-domain-model.md) / [09](09-mvp-product-spec.md).** The schema has `class.status: scheduled | cancelled | completed`, but nothing defines what moves a class to `completed`. The attendance flow and any "past classes" history quietly depend on this.

Decide the transition rule:
1. **Passive by time** — a class is "completed" simply when `startsAt + duration < now`; no stored transition, computed on read. Simplest; but then the stored `completed` enum value is redundant (or only set lazily).
2. **On attendance submission** — the instructor marking attendance flips it to `completed`. Explicit, but classes with no attendance never complete.
3. **A sweep job** — the materialization/cron job also marks past `scheduled` classes `completed` (ties to [16](16-materialization-job-scaling.md)).

Also: is `completed` even needed as a stored status, or is `scheduled` + time enough, with `cancelled` the only real non-default state? Resolve the enum. Output: the transition rule (or "drop `completed`, derive from time"), and who/what performs it.

## Answer

**Drop `completed`. A class is "past/done" when `starts_at + duration < now()` — derived from time, never stored.** `class.status` becomes **`'scheduled' | 'cancelled'`**.

**Reasoning:** "completed" carries no information that time doesn't already give. The only real business state is *cancelled vs not*. Keeping a stored `completed` would force a mechanism to set it (option 2 misses classes with no attendance; option 3 adds a sweep job to [16](16-materialization-job-scaling.md) for zero benefit). Deriving from time removes that whole burden.

**How the app reads it:**
- **Upcoming** = `status='scheduled' AND deleted_at IS NULL AND starts_at > now()`.
- **Past / done** = `status='scheduled' AND deleted_at IS NULL AND starts_at + duration < now()`.
- **Cancelled** = `status='cancelled'`.
- **Markable for attendance** = past + not cancelled + within the ~14-day backfill window.

**Consequences:**
- Booking already rejects past classes via the `starts_at > now()` guard in the atomic `UPDATE` ([13](13-booking-write-atomicity.md)) — no `completed` check needed.
- No sweep job to mark completion → one less cron concern for [16](16-materialization-job-scaling.md).
- Updated the schema draft: `class_status` enum is now `['scheduled','cancelled']`.

**Refines** [08](08-mvp-domain-model.md): `class.status` is 2-value; "done" is a derived read, not a column.
