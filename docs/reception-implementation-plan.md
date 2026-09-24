# Reception: technical implementation plan

Date: 2026-09-12

Status: implemented 2026-09-12 as [ADR 139](issues/139-reception-permanent-link.md). Supersedes the daily activation design in reception-checkin-plan.md. Lint (15/15) and typecheck (17/17) pass on the built code. Focused tests are written and have not run. Migration `0001_reception_link` is applied to dev and verified live. Migration `0002_loose_machine_man` remains to be applied. A real tablet and a busy-class pilot remain.

## 1. Scope and decision gate

Build two screens over the same attendance records:

- Entrance tablet: permanent coded link, member search first, then the closest class already chosen with the rest one tap away.
- Staff reception: signed-in owner, manager, or staff already authorized to take attendance. Same order, same default class, repeated person after person.

Keep walk-in forms and the owner's Walk-in leads workflow unchanged.

Resolved 2026-09-12: the user chose the recommended contract. A class shows Book until 60 minutes before start, then Check in until class end. The list includes every scheduled class that has not ended, from today through `RECEPTION_LOOKAHEAD_DAYS` (3) days ahead, widened from today and tomorrow at the user's request. The staff screen offers the same days and the same actions, booking through `booking.bookFor` for a class the staff walk-in write cannot reach. A class the branch booking window does not reach is listed and refused rather than hidden.

The date range uses the branch time zone. A class already running remains selectable until its exact end. Cancelled and deleted classes never appear.

## 2. Current code to reuse

| File | Existing behavior and planned change |
| --- | --- |
| `packages/api/src/router/reception.ts:45` | Daily start/revoke, bounded search, member check-in and visitor submission. Replace daily start with permanent link management. Move classes out of the initial screen response. |
| `packages/api/src/reception.ts:18` | Validates a cookie against expiring verification records. Replace storage lookup with a dedicated reception link lookup. Keep branch-scoped transactions and rate limits. |
| `packages/api/src/member-checkin.ts:21` | Shared self-check-in write with member admission rules and schedule locking. Preserve account self-check-in behavior. |
| `packages/api/src/router/attendance.ts:388` | Staff-selected member attendance. Reuse its authority, capacity rules, and correction behavior. |
| `packages/api/src/router/booking.ts:98` | Existing booking transition and capacity accounting. If future selection means booking, extract only the shared transition needed for a selected person. |
| `apps/nextjs/src/app/reception/reception-screen.tsx:14` | Current class-first screen and shared-device reset. Replace the interaction order; retain reset and failure handling. |
| `apps/nextjs/src/app/checkin/[academyId]/drop-in-form.tsx:44` | Existing public visitor form with a reception mode. Preserve fields, acknowledgements, and outcomes. |
| `apps/nextjs/src/app/_components/reception-setup.tsx:10` | Current activation controls. Replace with link creation, copy, disable, and replacement. |

The current member and staff paths differ in admission policy. Sharing records must not turn self-service into a staff override.

## 3. Routes and account protection

| Route | Access and job |
| --- | --- |
| `/reception#key=<random-secret>` | Permanent entrance link. The fragment keeps the secret out of ordinary server request URLs. |
| `/reception` | Entrance screen after the link is exchanged for a cookie. Refresh works with that cookie. |
| `/entities/[entityId]/reception` | Staff reception inside the existing management shell. |
| `POST /api/reception` | Same-origin link exchange and safe browser handover. |

The entrance link must never create a Better Auth account session. Its credential is valid only for reception procedures.

On first opening, exchange the secret through a POST body for an HttpOnly, Secure-in-production, SameSite=Strict cookie. Remove the fragment after successful exchange and perform a full navigation. Exclude this page from indexing, session replay, and payload logging. Do not save the secret in localStorage. Copy the full original link for the iPad bookmark; the clean URL relies on its browser cookie.

If this browser already has an account session, show one explicit handover action: Sign out and open reception. Invalidate that session on the server, clear account cookies including the signed session cache, and only then install reception access. A failed handover must not report readiness. This step is conditional, not a daily activation requirement.

The browser used at the entrance must not retain management pages with personal data in application caches. Clear query and mutation caches and navigate fully after handover. Verify Back, reload, old tabs, and cached pages during the browser check. Do not claim that a web page can lock the browser or remove unrelated saved passwords.

After handover, opening a dashboard URL requires staff sign-in. Reception credentials cannot satisfy protected API procedures. If someone deliberately signs in again, the device is no longer ready for unattended use; reception must require handover again. Staff use their own controlled browser or device.

## 4. Persistent link storage

Add a dedicated `reception_link` table. Permanent credentials do not belong in the expiring Better Auth verification table or in membership invitations.

Fields: `id`, `academy_id`, `token_hash`, `created_by`, `created_at`, `revoked_at`. Use a unique hash and a partial unique index allowing one live link per branch. Use the existing entity foreign-key convention and explicit deletion order. Include this table in branch erasure and storage coverage checks.

Generate 32 random bytes. Store only the SHA-256 hash. Show the full link once after creation or replacement, with Copy and Open controls. Existing-link status does not recover the secret. If the owner loses it, Replace link creates a new one. This avoids adding secret encryption solely to redisplay a URL.

No server-side expiry for the link. The browser cookie may have a renewable lifetime, for example 30 days. Reopening the permanent bookmark always exchanges it again without staff login. Every reception request rechecks the live link and branch. Disable or replace invalidates old cookies on subsequent requests.

Creation, replacement, and disable require owner or manager authority for that branch. Replacement revokes the old row and creates its successor atomically under the branch lock. Link resolution is a narrowly scoped base-database lookup, like the existing public link resolver. Member data access then uses `withScope` with the resolved branch. Never accept scope from a member-supplied branch ID.

Migration: generate an additive migration against the current baseline. Do not rewrite a baseline that may already be applied. There is no member-data backfill. Old daily credentials remain invalid for the new resolver; owners create a permanent link during rollout.

## 5. API contracts

Proposed operations, following existing tRPC patterns:

| Operation | Authority | Input and result |
| --- | --- | --- |
| `reception.linkStatus` | Branch manager | Returns enabled state and creation date, never the secret. |
| `reception.createLink` | Branch manager | Creates only if none is active; returns the new full link once. |
| `reception.replaceLink` | Branch manager | Replaces atomically; returns the new link once. |
| `reception.disableLink` | Branch manager | Revokes the active link. |
| `reception.info` | Reception cookie | Minimal gym identity and visitor availability. |
| `reception.search` | Reception cookie | Query of 2-80 characters; at most five `{id, name, ambiguous}` results. |
| `reception.classes` | Reception cookie | Selected person ID; returns today's and tomorrow's available class cards. |
| `reception.checkIn` | Reception cookie | Person and class IDs; returns recorded or already-present status. |
| `reception.book` | Reception cookie | Only if the future-booking decision is approved. Uses member admission rules. |
| `reception.submitVisitor` | Reception cookie | Existing walk-in schema and lead outcome. |
| `attendance.searchMembers` | Staff | Bounded branch search using existing staff-visible identity fields. |
| Existing attendance operations | Staff | Reuse selected-member marking and corrections. |

Public class cards contain ID, title, start, end, day group, and permitted action. Do not return attendee names, contacts, balances, or notes. Revalidate the selected person on reads and writes, including ambiguous names. Never trust the action or eligibility previously displayed by the browser.

Use literal substring search with case and accent normalization. Escape wildcard characters. Preserve separate device/link, branch, and IP rate limits. Invalid secrets receive a generic unavailable-link response.

## 6. Shared rules and writes

In `packages/domain/src/reception.ts`, replace the daily credential-expiry helper with pure class-window and action helpers:

- Resolve local midnight today through local midnight after tomorrow using existing local-date functions.
- Include classes whose start falls inside that range and whose end is strictly after now.
- Derive end from start plus duration. Handle midnight and daylight-saving boundaries in the branch zone.
- Derive Book versus Check in only after the decision in section 1.

Keep the ordinary account QR window unchanged unless the user explicitly changes it. If reception allows immediate attendance tomorrow, give reception its own explicit window policy passed into the shared writer. Do not globally widen `canCheckIn`.

Attendance and booking continue to use `class_participation`. Do not add a second attendance table. Keep one record per person and class. A duplicate click or uncertain-network retry returns the existing result without changing the original attendance timestamp or consuming capacity again.

Use the existing branch schedule lock before class/participation changes. Align lock order across account booking, self-check-in, and staff reception writes. Reserve capacity, change participation, and update schedule revision in the same transaction. Inspect staff attendance locking before claiming cross-flow concurrency safety.

Add nullable `check_in_source` to participation for `reception_self` and `staff`. Keep `marked_by` for the staff account. Existing rows remain null rather than guessing their origin. Repeated check-ins do not replace the original actor or source. Later corrections retain the existing correction history.

## 7. Frontend state and design

Entrance states: loading link, search, selected member/classes, submitting, success, unavailable link. Walk-in entry is a secondary state using the existing form.

Design: one large search field, clear name rows, then the chosen class as one large button with the day list behind Choose a different class. Keep the selected member and Not you visible above it. Use existing type and color tokens, 48px minimum controls, and restrained transitions. Do not show class selection before member selection.

Debounce search by about 200ms. Render results only for the current query. Cancel and remove search queries on reset. Reset personal state after three seconds of success, 60 seconds of inactivity with a warning at 45 seconds, and background return. Keep input during retryable failures until reset. No optimistic attendance success or offline queue.

Staff states: member search, the chosen class, marking, and roster. Preserve the selected class after success; clear only the member search. Show Already checked in when appropriate. Keep staff signed in. Use current roster polling and invalidate the selected class after writes. Do not add WebSockets.

Add the staff route to the existing route-permission and navigation definitions. Public reception stays outside the management shell. Reuse search and class-row presentation where useful, but keep separate page state so staff persistence cannot leak into the entrance flow.

## 8. Implementation order

- [x] Inspect existing reception, booking, attendance, storage, and frontend entry points.
- [x] Define separate member and staff access boundaries.
- [x] Resolve future-class action before implementing its write.
- [x] Add link storage, attendance source, migration, deletion coverage, and domain rules.
- [x] Implement link management and secure browser handover. Verify management API refusal first.
- [x] Implement selected-person class reads and shared write changes with focused regression tests.
- [x] Replace entrance page with search-first flow and existing walk-in entry.
- [x] Add staff reception route, navigation, bounded search, and roster refresh.
- [x] Remove obsolete daily activation code, expiry tests, and misleading access-ended copy.
- [x] Run lint and typecheck; inspect the final diff and document remaining runtime checks.
- [x] Apply migration to the target development environment and verify schema before pilot.
- [ ] Check a real iPad and pilot both screens on one branch before release.

Spec (RC1-RC7), architecture, roadmap, changelog and [ADR 139](issues/139-reception-permanent-link.md) are updated. ADR 138 is kept as history and superseded rather than rewritten.

## 9. Verification and release

Write focused tests for permanent-link reuse, replacement and disable, missing credentials, cross-branch requests, account-session refusal, search privacy, duplicate names, and visitors reaching the existing lead list.

Cover today/tomorrow in the branch zone, a running class, exact class end, cancelled/deleted classes, and exclusion of the day after tomorrow. Cover admission rules separately for member and staff access. Verify duplicate requests and concurrent self/staff operations preserve one participation, correct capacity, and the original actor.

Browser checks: open a fresh link without login, hand over a browser previously signed in as owner, navigate to management routes, try Back/reload/old tabs, reopen after midnight, disable the link remotely, and check privacy after reset. Check iPad keyboard, touch targets, portrait/landscape, screen-reader status, and network failure recovery.

Do not run tests without the user's explicit request. Planned commands after implementation:

```sh
pnpm lint
pnpm typecheck
pnpm --filter @matops/domain test test/reception.test.ts
pnpm --filter @matops/api test test/reception.test.ts test/checkin-window.test.ts test/attendance-writes.test.ts
```

Release only after migration and the required verification. Staff attendance remains the fallback. Disabling the permanent link must leave staff reception and existing member login flows usable.

## Lessons learned

- Design unattended and staff-operated screens as separate access modes before choosing session storage.
- A permanent reception link must not depend on recurring owner activation.
- Keep member search first when the user asks for member-first check-in.
- Resolve future booking versus recorded attendance before changing write rules.
