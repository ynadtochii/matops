# 142 · First release: approval-only booking

**Status:** accepted, code built · **Date:** 2026-09-26 · **Area:** `packages/db` (`provision.ts`, the pilot seed), `packages/api` (`member-booking.ts`, `booking`, `accessPlan`, `stats`, `entity`, `organization`), `packages/domain` (`organization-setup.ts`), `packages/validators` (`CreateEntitySchema`), `apps/nextjs` (the shell, `/start`, the landing rule, every payment reader) · **Supersedes in part:** [135](135-first-academy-fresh-install-contract.md) (a student needs a plan assignment to train), [128](128-registration-creates-the-organization-only.md) §1 (the owner lands on `/overview`), §3 (the owner picks the first branch type) and §6 (every new branch is enforced), [129](129-the-manager-runs-every-branch.md) §6 (`Gym management` beside the branch at one academy), [139](139-reception-permanent-link.md) §7 (no staff bypass) for the owner only · **Plan:** [first-release-plan.md](../first-release-plan.md)

## Context

The first release is one BJJ academy on the web. Before this change a new
branch started with payment admission on. A student needed an approved
membership, a plan assignment and good payment standing before a first booking.
Setup asked for a plan, bank details, an assignment and a separate instructor.
An owner met a gym overview and a "Gym management" menu before their first
class.

The pilot gyms collect money outside matops. They need to approve a student and
let them book. Payment admission comes back in a later release, through manual
plan assignment or a payment provider.

## Decision

These are the eleven decisions in the plan, as built.

1. **The model stays.** The organization is the owner group. A typed
   `bjj_academy` entity is the place. Entity URLs, `x-matops-entity`, tenant
   checks, and each academy's own schedule, roster and join code are unchanged.
2. **Approval is admission.** An approved, active student books with no plan,
   no payment claim and no payment standing. Pending, suspended, archived and
   removed students cannot book. The booking window, class state, capacity,
   cancellation and tenant checks stay.
3. **The weekly loop is the release.** Create the academy, set its time zone
   and classes, invite and approve a student, book and cancel, handle changed
   or cancelled classes, finish attendance, correct an error. Notice recovery
   and calendar extension stay.
4. **One academy opens directly.** An owner with one academy lands on it. There
   is no "Gym overview" item and no "Gym management" group. People and Gym
   settings stay in the menu, and "Add branch" reads "Add academy". With zero
   or two or more academies the owner lands on `/overview`, and the overview
   and grouped menu come back.
5. **Optional features use their existing flags.** Curriculum, referrals and
   public booking stay behind their flags, all off by default. Reception, walk-in
   leads, coaches, notifications, rank, notes, export, privacy and delete stay.
   `/linear-ds` stays as the design reference page (ADR 141). No new flag was
   needed, so nothing was removed.
6. **Data.** No migration. The dev data was read, not changed.
7. **Server and web change together.** Hiding a button is not the check. The
   server decides admission, warnings and verdicts from the same flag the
   screens read.
8. **Payment admission is off, not gone.** `entity.membership_enforced_at` is
   the one flag. `provisionOrganization` and `createEntity` now write null
   unless the caller passes a value. Null means approval-only booking.
   `bookingGate` in `packages/api/src/payments-gate.ts` and
   `entity.setMembershipEnforced` are unchanged, so switching the flag on in Gym
   settings restores payment admission with no code change. With the flag off,
   `accessPlan.mine` returns no warning and `stats.organizationMembers` returns
   no payment verdict for that branch. `entity.list` rows carry
   `membershipEnforced`. Branch screens read `academy.current().membershipEnforced`.
   Organization screens show payment UI only when some branch has the flag on
   (`useAnyBranchTakesPayment`). With it off there is no Membership menu item,
   no dues strip, no plan fields in import, no bulk assign, no membership
   section on a person and no claims queue on the overview.
   `/entities/<id>/payments` and `/memberships` show a plain "not in use"
   message. The pilot seed no longer enforces. The Alma beta demo seed still
   does, to show the flag-on path.
9. **Production is empty.** No backfill or data fill. Recheck it before the
   first real invitation.
10. **Web only.** The Expo app is not changed. It calls the same API, so the
    server changes reach it.
11. **The owner can override.** `booking.bookFor` passes `ownerOverride` when
    the caller's role is `owner`. The owner skips the booking window and the
    payment gate. The owner does not skip tenant checks, a deleted, cancelled
    or started class, strict capacity, or the active-member check. Managers
    and instructors keep the member's rules. A new owner-only
    `booking.cancelFor` cancels a named person's booking and frees the place.
    It is idempotent, like `booking.cancel`. The class roster shows it to the owner as "Cancel booking" before the class starts. The entrance reception screen never
    passes the override. Attendance rules do not change: within 14 days staff
    may correct, and older changes need an owner or manager and a reason.

### First academy setup

`/start` is one form: the academy name and a time zone, which defaults to the
browser's zone. It calls `organization.create`, then `entity.create` with type
`bjj_academy`, the same name and the time zone. `CreateEntitySchema` gained an
optional, validated `timeZone`. The owner then opens `/entities/<id>`. If the
gym exists with no academy, `/overview` shows the same form in resume mode and
writes only the academy, so a failed second write never makes a second gym. A
signed-in user who already runs a gym is sent away from `/start`.

### Setup checklist

`organizationSetup` lists: the academy, its address and time zone, a weekly
schedule, a shared join link, a first approved student, and a first booking.
There is no gym-name step and no instructor step, because a teaching owner is
the staff. Plan, bank, assign and ready steps appear only while some branch
requires payment. The checklist also shows at the top of the academy dashboard
for owners and managers, and hides when complete.

## Consequences

- A solo owner can finish setup and take bookings without touching payments.
- Turning payment on is one switch per branch in Gym settings, and every old
  payment screen returns.
- Known leftovers: the overview's branch order still counts old claims, and the
  server still accepts a CSV with plan columns.
- Tests were written and not run. Browser checks are open (first-release-plan
  S1b to S5).

## Addendum, 2026-09-27: features hidden after a manual check

The owner reviewed the app and asked to hide these from the web client: the venue check-in QR and drop-in check-in card; the staff Reception screen; the public `/reception` page, its link setup and the `/api/reception` route; the coach breakdown; the booking window and phone country settings; public booking (settings panel and link card); the Notifications page, menu item and header bell; the Optional features and Your account sections; the days-to-pay and deadline time zone rows; the per-branch payment switch; and every Add academy entry point. The web routes and components are deleted. The tRPC procedures stay, because the Expo app and a later release may call them, and stored values keep applying.

This changes three decisions above. Decision 5 said reception, notifications and optional-feature settings stay; they are now hidden. Decision 8 kept the per-branch payment switch as the way to turn payment back on; turning it on now needs a later release or a direct database change. Decision 11's owner booking past the window keeps its server rule, but its only web entry point was the Reception screen, so there is no web control for it now. Owner cancel stays in the class roster.

## Addendum, 2026-09-27: one academy, one set of screens

With one academy per gym, the owner saw two layers of screens for one place. The web client now merges them. Students (the old Roster) gains Add student, Import students and Export data, and drops its client-side CSV export. Settings (the old Branch settings) gains the bank details while payment is on, and its name field renames the academy and the gym together. People, Gym settings and Gym overview leave the sidebar while there is one academy, and their URLs redirect to the academy's own pages. No server code changes; the organization procedures are called from the merged screens. With a second academy the gym-wide screens come back as before, so Decision 1 (keep the organization and entity model) holds.

## Addendum, 2026-09-27: dead code removed

The hidden features and the multi-academy screens are now removed from the code, not only from the web client. This changes Decision 5 of the plan: an optional feature is removed, not hidden.

Removed, with their procedures, helpers, schemas and tests:

- The staff and entrance reception screens and every `reception.*` procedure.
- Public booking: the `/book/<code>` page and the `visitor` router.
- Referrals and curriculum, end to end.
- General spaces. The only entity type is `bjj_academy`, and every class is soft capacity.
- The Gym overview, People, Person and Gym settings screens, the academy selector, and their procedures (`stats.organization*`, `person.*`, `entity.addStudentToBranch/decideAtBranch`, the `accessPlan` plan-change procedures).
- The notification delivery retry procedures (`notification.deliveryIssues`, `sendRemaining`, `retryFailed`).
- `entity.setMembershipEnforced`. Turning payment on now needs a later release or a direct database change.
- `booking.bookFor` and the owner override. Nobody books for a student past the window. Owner cancel (`booking.cancelFor`) stays.

Kept: the payments code (`bookingGate`, `entity.membership_enforced_at`, plans, months and their screens behind the flag), drop-in leads and the wall-QR drop-in form at `/checkin/<id>`, the organization and entity model with entity URLs and `x-matops-entity`, and every procedure the Expo app calls. An owner lands on the first academy; a gym with no academy lands on `/start` in resume mode.

**Migration.** `packages/db/migrations/0004_first_release_drops.sql` is structure only. It drops the tables `reception_link`, `curriculum_track`, `curriculum_block_template`, `curriculum_block`, `member_referral` and `member_referral_audit` (their RLS policies and grants go with them) and the enum `referral_action`. It drops the columns `organization.curriculum_enabled`, `organization.referrals_enabled`, `organization.general_branches_enabled`, `academy_profile.curriculum_for_students`, `academy_profile.public_booking_enabled`, `class_template.curriculum_track_id`, `class_template.public_bookable`, `class.public_bookable`, and `drop_in_visit.cancel_token`, `cancel_token_expires_at` and `booked_class_starts_at` with the index `dv_uniq_cancel_token`. It is applied to dev.

**Production order.** A migration runs while the old code still serves. So the code changes ship first, and this migration ships in a later deploy, after no running code reads the dropped tables or columns.

## Addendum, 2026-09-27: further cleanup

Additional code and dependency cuts after the main dead-code batch.

- **Strict capacity removed.** `claimSeatIfStrict` and the `strict` capacity path are deleted. Every class is soft capacity. `claimSeat` always increments. `SESSION_FULL` is gone.
- **Branch copy removed.** `entity.create` no longer copies a branch (`copyFromEntityId`, `copyBranchSetup` removed). New entities always start from a clean provision.
- **NativeWind removed from Expo.** The Expo app no longer uses NativeWind, `react-native-css`, `tailwindcss`, `postcss` or `withNativewind`. It uses explicit React Native styles throughout (`apps/expo/src/components/ui.tsx`), as ADR 36 intended. `styles.css`, `postcss.config.mjs` and `nativewind-env.d.ts` are deleted.
- **Alma beta seed removed.** `seed up`, `seed reset`, `seed:health` and `src/seed.ts` are deleted. The default demo command is `seed pilot`. Root alias `pnpm db:seed` runs `seed pilot`; `db:seed:reset` is removed; `db:seed:down` stays.
- **Organization commercial columns removed from the Drizzle schema** (`offer`, `pilot_ends_on`, `agreed_price_minor`, `agreed_price_currency`, `billing_contact`, `account_status`). The columns still exist in the database. A new migration in a later deploy must drop them, following the same two-step rule as `0004`.
- **`tooling/tailwind` and `tooling/github` removed.** `theme.css` is now `apps/nextjs/src/app/theme.css`. The GitHub composite action is `.github/actions/setup/action.yml`. `tooling/eslint/nextjs.ts` is inlined into `apps/nextjs/eslint.config.ts`.
- **`packages/ui` trimmed.** `avatar`, `kbd`, `progress`, `radio-group`, `skeleton`, `switch`, `table`, `tabs`, `tooltip` and `logo.native.tsx` are removed. `button-variants.ts` is removed; `button.tsx` holds the one `cva` recipe. The `lg` spinner size and the `payment`, `membership` and `schedule` `useInvalidate` groups are removed.
