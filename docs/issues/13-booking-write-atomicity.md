# 13 — Booking write: atomicity pattern + capacity guard

Type: grilling
Status: resolved
Blocked by: 15, 21

## Question

**Refines [08](08-mvp-domain-model.md) / [04](04-realtime-strategy.md).** The review found the specified booking write — "lock the class row (`SELECT … FOR UPDATE`), check capacity, insert, increment, all in one transaction" — needs an **interactive transaction**, which the stateless `neon-http` driver cannot do (it would force the WebSocket/pooled-TCP driver — see [21](21-neon-connection-model.md)).

Decide the write pattern that is correct AND fits the chosen host ([15](15-api-deployment-shape.md)):
- **Preferred (portable):** a single atomic conditional statement — `UPDATE class SET booking_count = booking_count + 1 WHERE id = ? AND booking_count < capacity RETURNING id` — succeeds only if a spot was free; then insert the `class_participation` row (the `UNIQUE(classId, studentId)` handles duplicates / re-book). No `FOR UPDATE`, no interactive transaction, works on the HTTP driver.
- **Alternative:** interactive transaction with row lock (needs a session/WebSocket connection).
- Handle re-book (cancelled → booked must not double-increment) and cancel (decrement, floored at 0) with the same atomicity discipline.

Output: the exact write sequence for book / re-book / cancel, the driver/connection requirement it implies, and confirmation it holds under concurrency without persistent connections.

## Answer

**Atomic conditional `UPDATE` for the capacity claim + transition-detected participation upsert, all inside the RLS per-request transaction.**

**Setting:** every request already runs inside one transaction that does `SET LOCAL app.academy_id` (RLS, [12](12-tenant-isolation-mechanism.md)), on the `pg` driver ([15](15-api-deployment-shape.md)). So we have a real transaction to group the two statements — but capacity safety comes from the atomic `UPDATE`'s row lock, **not** from `SELECT … FOR UPDATE`. RLS + the `WITH CHECK`/`USING` policies also confine every statement to the caller's academy.

**v1 booking policy is small** (no memberships/payments/class-type/frequency in standard scope): the member is `active` (enforced via Better Auth status, [14](14-better-auth-approval-feasibility.md)) and the class is bookable (`status='scheduled'`, not deleted, `starts_at > now()`, `booking_count < capacity`).

### BOOK
1. **Pre-read for friendly errors** (not the guard): `SELECT` the class; if missing/cancelled/completed/past → reject with the precise reason. (The atomic step below is the real race guard.)
2. **Transition the participation to booked, only if not already booked** (idempotent):
   ```sql
   INSERT INTO class_participation (academy_id, class_id, student_id, booking_status, booked_at)
   VALUES (:academy, :class, :me, 'booked', now())
   ON CONFLICT (class_id, student_id)
   DO UPDATE SET booking_status='booked', booked_at=now(), cancelled_at=NULL
   WHERE class_participation.booking_status <> 'booked'
   RETURNING id;   -- row ⇒ a real transition (new insert OR cancelled→booked); 0 rows ⇒ already booked
   ```
   0 rows → already booked → return success, **do not** touch the count (idempotent double-tap).
3. **Claim capacity atomically** (only if step 2 was a real transition):
   ```sql
   UPDATE class SET booking_count = booking_count + 1, updated_at = now()
   WHERE id = :class AND status='scheduled' AND deleted_at IS NULL
         AND starts_at > now() AND booking_count < capacity
   RETURNING id;   -- 0 rows ⇒ full/unavailable
   ```
   0 rows → **throw** `CLASS_FULL` → the surrounding transaction **rolls back** step 2 (the participation change is undone). Row → commit.

### RE-BOOK
No special path — step 2's `ON CONFLICT` flips a `cancelled` row back to `booked` and step 3 re-claims the spot. Same code as BOOK.

### CANCEL
1. Transition only if currently booked (idempotent + ownership via `student_id=:me`; RLS gives academy scope):
   ```sql
   UPDATE class_participation SET booking_status='cancelled', cancelled_at=now()
   WHERE class_id=:class AND student_id=:me AND booking_status='booked'
   RETURNING id;   -- 0 rows ⇒ wasn't booked → idempotent no-op
   ```
2. If a row transitioned, decrement (floored):
   ```sql
   UPDATE class SET booking_count = GREATEST(booking_count - 1, 0), updated_at=now()
   WHERE id=:class;
   ```

### Why it's correct under concurrency
- **Capacity never exceeded:** the `UPDATE … WHERE booking_count < capacity` takes a row lock on the class row; concurrent claims serialize, and the loser sees the updated count and gets 0 rows → `CLASS_FULL`. No `FOR UPDATE` needed.
- **No duplicate booking:** `UNIQUE(class_id, student_id)`.
- **No miscount on re-tap / re-book:** the count changes **only** when the participation actually transitions (RETURNING gates it).
- **Atomic rollback:** a failed capacity claim rolls back the participation change because both run in the one RLS transaction.

### Notes
- **Portability bonus:** the pattern needs no interactive `FOR UPDATE`, so it also works on `neon-http` if the driver ever changes.
- **Denormalized `booking_count`** is maintained in-transaction; a periodic **reconciliation job** (recompute from participations) is a cheap safety net — add to the cron work in [16](16-materialization-job-scaling.md). (optional)
- **Corrects** architecture.md §7 (drop the `SELECT … FOR UPDATE` phrasing → atomic conditional `UPDATE`).

## ⚠ Refined by the low-friction wave (session 11)
Booking is now **two-tier** ([22](22-provisional-booking-capacity.md)): the atomic capacity `UPDATE` applies to **confirmed** bookings only (active members). **Provisional** bookings (pending members / drop-ins) insert a participation row but do **not** touch `booking_count`. On approval, provisional → confirmed via the same atomic claim (else stay provisional + notify).

## ⚠ Pressure-test refinement (session 12)
**No hard capacity cap in v1.** Booking is never blocked. The atomic `UPDATE` **drops the `booking_count < capacity` guard** — it just increments the count (still atomic, `UNIQUE(classId,studentId)` still prevents double-book). At/over capacity the UI shows red "may be busy" + confirm; the owner manages the room. Hard cap / priority / waitlist / no-show → next iteration.
