# 133: Explicit attendance review

Date: 2026-09-07. Status: built, historical correction policy pending.

## Problem

The dashboard only flagged booked classes from the last seven days with no attendance marks.
One mark removed a partly finished class. Empty classes and older omissions disappeared from the queue.
The owner could not tell whether staff had checked every past class.

## Decision

Give each class an explicit attendance review. A mark on one person does not complete the class.
Owners, managers and instructors can finish attendance through the existing staff roster.
Every non-cancelled member and visitor on that roster must have a resolved attendance mark.
When nobody is present, staff must explicitly confirm **Nobody attended**. Empty classes use the same confirmation.
Only ended, live, non-cancelled classes enter the review list or accept completion.

Attendance defaults to **Needs review** and also offers **All**.
Show all past classes in the current branch, oldest first, with 50-row pages.
Optional date filters use the branch time zone. The existing branch picker supplies branch selection.
The dashboard links to that queue and counts all outstanding classes, without a date limit.
Keep **All past classes reviewed** visible when the count is zero.

Store a nullable review timestamp, reviewer user ID and roster signature on the class.
The signature is a stable value from sorted row IDs, booking states and attendance states for members and visitors.
Read the displayed roster and its signature in the same SQL statement snapshot.
Completion compares the submitted signature with the current roster and rejects a stale submission.
Save the reviewer, time and matching signature together.
A later roster or attendance change makes the class need review again by signature comparison.
No trigger, separate task table or worker is needed.

Existing classes start unreviewed. Do not infer a historical review from existing marks or fill review fields automatically.
The migration adds structure only. Old code remains compatible while deployment runs.
Attendance marks continue to drive visits, attendance rates and coach workload. Review status changes none of those calculations.

## Pending decision

The user has not yet chosen the correction policy for attendance older than 14 days.
The existing 14-day limit applies to both marking and finishing until the user decides. Older unfinished classes stay visible.

## Replaced rules

This supersedes O1's seven-day, booked-only, no-marks heuristic.
It supersedes ADR 62's claim that the existing dashboard queue fully covers missing attendance.
It replaces ADR 96's attendance-picker window restriction with an all-time review list.
Other check-in, booking and coach statistics rules from those records remain unchanged.

## Verification

Workspace typecheck passed 17/17 and lint passed 15/15. Migration 0068 is applied to dev. Database verification passed 67/67 migration entries and branch data permissions. Browser acceptance remains open.
No tests have run for this feature. Run them only when the user explicitly requests them.
Acceptance must cover empty classes, partly marked rosters, visitors, older classes, date boundaries and multiple pages.
It must also cover stale completion, roster changes after completion and unauthorized branch access.
