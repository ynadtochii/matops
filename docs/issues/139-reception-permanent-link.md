# 139: Reception permanent link and staff reception

Date: 2026-09-12

Status: implemented. Migration `0001_reception_link` applied to dev. Tests written, not run. Real tablet and pilot remain.

Supersedes [ADR 138](138-reception-class-checkin.md)'s daily-activation decision. ADR 138 stays as history; its walk-in, privacy, and rate-limit decisions still hold.

## What changed and why

ADR 138 gave the tablet an expiring token that an owner re-issued every day. A gym that opens at 07:00 does not want the owner's first job to be signing in to hand the door a new credential. Reception is now a permanent link per branch.

The old design also asked the class question first. Two mats running at once made that question unanswerable before anybody knew who was asking, and a person who arrives between classes had nothing to pick. The order is reversed: find your name, then choose from today and tomorrow.

## Decisions

**1. One permanent link per branch, stored as a hash.** `reception_link` holds the SHA-256 of a 32-byte secret, the branch, who made it, and when it was revoked. A partial unique index keeps one live row per branch. There is no server-side expiry; the browser cookie renews on every reopen of the bookmark, and every request re-resolves the live link, so disabling or replacing stops an old cookie on its next call.

A permanent credential does not belong in the Better Auth `verification` table, whose rows expire, nor in `academy_invite`, which grants membership.

**2. The secret is shown once.** Storing only the hash means there is nothing to display twice. Losing the link means Replace link. That is cheaper than adding secret encryption so a URL can be shown a second time.

**3. The fragment carries it, a cookie keeps it.** `#key=` is never sent to a server, so it stays out of ordinary request logs. One same-origin POST exchanges it for an HttpOnly cookie, the page strips the fragment, and a full navigation starts the screen with an empty client cache. It is never written to storage.

**4. Handover is asked for, not assumed.** A browser signed in to a staff account is refused until somebody presses "Sign out and open reception". Signing a person out of a device they may be about to carry away is not ours to decide, and a failed sign-out must never report the device ready.

**5. Book until an hour before, then check in.** This was the open question in the plan and the user chose it. Attendance keeps its meaning: `present` is somebody who was on the mat. Picking tomorrow's class reserves a place instead, using the member's own booking window and admission rules.

The list shows every scheduled class that has not ended, from today through `RECEPTION_LOOKAHEAD_DAYS` (3) days ahead, in the branch zone. Somebody at the door can reserve a place for the rest of the week without opening the app. A class outside the branch booking window is shown and refused, rather than hidden, so the tablet does not appear to have forgotten it.

Each card carries a `dayOffset` counted in local days rather than a fixed today/tomorrow pair, so the screen draws one heading per day the server actually returned and a longer or shorter list needs no new field.

**5b. The closest class is already chosen.** Picking a name offers the class running or about to run, and otherwise the soonest bookable one, as a single large button with the full list one tap away. A class that has already started is the right default rather than one to skip past: somebody at the desk at 18:10 is there for the class that began at 18:00.

The exception is two classes open for check-in at once. `defaultReceptionClass` returns null there and the screen asks, because guessing between overlapping mats is the bug ADR 117 fixed for visitors and a default must not bring it back.

Both screens read this way. The staff desk asked for the class first in the first cut, which made a Saturday at a gym closed on Sunday a dead end: the Saturday class had ended, so the screen said there were no classes before anybody could type a name.

**6. The browser's action is a hint.** The server re-derives the action from the class row before writing, so a card left on screen for an hour cannot check somebody into tomorrow, and a class that has come inside the check-in window stops being bookable.

**7. One write path per job.** `bookForMember` is extracted out of the booking router, so the student on their phone and the tablet at the door take the same booking write. `checkInMember` already did that for attendance. Sharing a record must not turn self-service into a staff override, so both keep the member's admission rules and neither gains a staff bypass.

**8. `check_in_source`, written once.** A nullable column on `class_participation` records `reception_self` or `staff`. Every writer uses `coalesce`, so a repeat check-in or a later staff mark never replaces whoever recorded it first. Existing rows stay null rather than being guessed at.

**9. Staff reception is an ordinary staff route.** `/entities/[entityId]/reception` sits in the management shell, in the route-permission table and the sidebar. It is the existing staff attendance write with a class picker and a bounded roster search, so authority, capacity, the 14-day window, and correction history are the Attendance screen's.

It offers the same days as the entrance screen and follows the same action rule, and since 5b it asks for the name first like the entrance screen too. A first cut limited the desk to one day ahead, on the grounds that `attendanceWriteAccess` closes about a day out. That was wrong in practice: a gym closed on Sunday met an empty desk screen on Saturday, with its next class two days away. So the desk books as well, through `booking.bookFor`, a staff-tier procedure over the same shared `bookForMember` write.

`findBranchPerson` resolves the named person for both screens. The duplicate-name refusal stays on the reception side only: staff pick a row from a search result and know which person they mean. Its page state is separate from the entrance flow, so staff persistence cannot leak into an unattended screen.

## What is not built

Rate limits stay per process, as ADR 116 decided for the public surface. No offline queue, no optimistic success, no identity check on a name, no undo on the shared screen, and no cancel action for a place booked at the door: a member cancels in the app, and staff correct in Attendance.

## Verification

Focused tests cover link reuse, replacement, disable, missing and malformed credentials, cross-branch requests, refusal of account sessions and management APIs, search privacy and duplicate names, day grouping by local offset, a running class at its exact end, the far edge of the window, both write refusals when the action has moved on, duplicate writes, and the source column. They are written and have not run.

Lint (15/15) and typecheck (17/17) pass. A real tablet and a busy-class pilot on one branch remain release checks, along with the browser checks in [the implementation plan](../reception-implementation-plan.md) §9.
