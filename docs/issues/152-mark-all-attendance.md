# 152 · Mark all attendance: review every past class with one button

**Status:** accepted, built (tests written, not run; no migration) · **Date:** 2026-10-24 · **Area:** `packages/api` (`router/attendance.ts`), `apps/nextjs` (`attendance.tsx`) · **Changes in part:** [133](133-explicit-attendance-review.md) (a review is an explicit act per class), the O5 14-day editing limit for this button only

## Context

ADR 133 made every ended class wait for an explicit review. Staff who do not mark attendance after each class build a long queue. Clearing it means opening each class, pressing **Mark all present**, then **Finish**. Most gyms trust bookings: a student who booked came.

## Decision

1. **One button on Attendance: Mark all attendance.** It shows while any class needs review. There is no preview and no confirm step.
2. **It does what a review by hand does.** For each class it marks every booked, unmarked student present (`markAll`), marks every booked, unmarked drop-in visitor present, then finishes the review (`finish`) with the new roster fingerprint. A class where nobody is present finishes as **Nobody attended**. Explicit absents, cancelled bookings and walk-ins stay as they are. `markAll` and `finish` share the same helpers, so a single review is unchanged.
3. **All past classes, any age.** The button ignores the date filter and the 14-day editing limit, for every staff role, and asks for no reason. No `attendance_correction` rows are written. A review by hand of an older class still needs an owner or manager and a reason.
4. **200 classes per press, oldest first.** Each press runs in one request transaction. The reply gives `remaining`, and the toast tells staff to press again.
5. **A class with an unmarked walk-in is left for a review by hand.** Nobody booked that row, so the button cannot resolve it. It is not picked, so it never blocks the next 200. The toast counts these classes (`byHand`).
6. **A roster change while the button runs** fails that class's fingerprint check. That class is skipped and stays in the queue.

## Consequences

- No-shows on a booked class count as visits, attendance rates and coach classes led (ADR 39). Staff accept this by pressing the button.
- Empty classes are confirmed as Nobody attended, so a walk-in nobody recorded is lost.
- `attended_at` is the time of the press, as with **Mark all present** today. For an old class, a drop-in lead's last visit shows the press date.
- No batch undo. Staff fix a class by hand in its roster, which reopens its review.
- No migration, no new table, no Expo work (attendance is web and staff only).
