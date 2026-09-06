**The owner level: detailed implementation plan**

Date: 2026-09-04. Status: written from a full read of the code, not yet implemented. Companion to the run file, [owner-dashboard-plan.md](/Users/kuna/projects/matops/docs/owner-dashboard-plan.md), which holds the decisions, the seven slices and the checkboxes. This file holds the detail behind each box: the exact files, the schema and procedure signatures, the validator shapes, the UI states and copy, and the named test cases.

Read the run file first. It settles what is being built and why. This file never re-opens a decision; where the code contradicts the run file, the difference is in **Corrections** below with a recommendation.

**How to use it.** One box in the run file is one run of a loop. Each box below carries the same number. Work the box, tick it in the run file, add a Log line there. Static gates (`pnpm typecheck`, `pnpm lint`) after every step. Never run tests here: hand the commands at the end to the user.

---

## Corrections to the run file

Nine things the code says that the run file does not. Each is a smaller diff, not a bigger one.

| Step | The run file says                                                                              | The code says                                                                                                                                                                                   | Do this                                                                                                                                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.5  | `packages/db/src/reminder.ts` joins `entity` at `:76`                                          | `reminder.ts` is the CLASS reminder sweep. The dues sweep is `packages/db/src/dues-reminder.ts`, and its `entity` join is in the RESOLVE (`:103`), not the claim                                | Put the guard in the CLAIM subselect at `dues-reminder.ts:74-82`. The claim stamps the period and the resolve drops the row, so a filter in the resolve would silently burn the reminder for a branch that is later switched back |
| 4.1  | New `activationPreview(members, assignments, coverage)` in `packages/domain`                   | `loadRosterStanding` in `packages/api/src/membership-access.ts:160` already returns `covered` per person for one branch, built on the pure `membershipAccess`                                   | No new domain function. The preview is a scoped read plus a filter on `covered === false`                                                                                                                                         |
| 5.1  | New `packages/domain/src/staff-directory.ts`                                                   | `combineDirectory` in `member-directory.ts:57` already gives one row per person with a role per branch. Only `invitedRole` is missing, so a pending coach cannot be told from a pending student | Add `invitedRole` to `DirectoryEntry` and `DirectoryBranch`, add one pure `staffRows()` beside `combineDirectory`. No new file                                                                                                    |
| 5.2  | New `stats.organizationStaff` procedure                                                        | `stats.organizationMembers` already reads every branch in its own scope and returns exactly these rows                                                                                          | No new procedure. The staff screen and the badge read `stats.organizationMembers`                                                                                                                                                 |
| 2.3  | New `membershipReference(planName, assignmentId)` in `packages/domain/src/membership-month.ts` | `paymentReference(name, memberId)` in `payments.ts:111` is the same job and is what the owner already matches bank lines against                                                                | Reuse `paymentReference(user.name, assignmentId)`. No new function, no new test file. If the owner wants the plan named instead of the person, it is a one-line change later; a person's name is what a bank statement carries    |
| 2.5  | Remove `payments.getRequisites`                                                                | `booking-gate.tsx:22` reads it for `graceDays` and `enforced`, and `entities/[entityId]/settings/page.tsx:21` prefetches it                                                                     | Keep the procedure, drop only `bankDetails` from its payload. Renaming it to `bookingGate` is optional and out of scope (it would touch `freshness.ts`, the prefetch, two tests)                                                  |
| 3.2  | `claimableMonths(standing, now)` for the current month and a mid-month join                    | `monthOf(now, calendar.timeZone)` is already the one month a member is judged on, join month included                                                                                           | The claim input names no month. The server derives it. The domain rule shrinks to `canClaimMonth({ paid, claimedAt })`                                                                                                            |
| 2.4  | `setPolicy` carries `bankDetails`                                                              | The current form posts `{graceDays, calendarTimeZone}` only                                                                                                                                     | `MembershipPolicySchema` is a full replace, not a patch, so `bankDetails` is required and the Settings page saves all three from one form with one Save button. Two forms writing one procedure would wipe each other             |
| 2.7  | `membershipStanding` returns `bankDetails` and `reference` per assignment                      | `membershipStanding` has no user name and has a second caller, `accessPlan.forUser`                                                                                                             | Leave `membershipStanding` alone. `accessPlan.mine` returns `{ bankDetails, memberships: [...] }` and adds `reference` per row from the session name                                                                              |

---

## Contracts locked here

**Migrations.** Two, both additive, structure only.

| File                                                      | Statement                                                                             | Journal `when`  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------- |
| `packages/db/migrations/0057_membership_bank_details.sql` | `ALTER TABLE "membership_policy" ADD COLUMN "bank_details" text DEFAULT '' NOT NULL;` | `1790208000000` |
| `packages/db/migrations/0058_membership_claim.sql`        | `ALTER TABLE "membership_month" ADD COLUMN "claimed_at" timestamp with time zone;`    | `1790294400000` |

Neither needs a policy or a grant: both tables already carry `*_isolation` on `app.organization_id` and all four `matops_app` grants (`0052`, `0053`), and a new column inherits them. `0059` drops `payment_settings.bank_details` one deploy later (step 7.5). Numbering: `0056` is the last applied, `0051` was never used, so `0057` is next.

**New procedures.**

```ts
// packages/api/src/router/organization.ts  (new router, registered as `organization` in root.ts)
rename: organizationOwnerIdentityProcedure
  .input(CreateAcademySchema)                       // { name: lineText(2, 80) }
  .mutation(): Promise<{ ok: true }>

// packages/api/src/router/accessPlan.ts
claimMonth: enrolledProcedure
  .input(ClaimMembershipMonthSchema)                // { assignmentId: z.uuid() }
  .mutation(): Promise<{ claimed: boolean; month: MonthKey }>

claims: organizationOwnerProcedure
  .query(): Promise<{
    assignmentId: string; userId: string; name: string; email: string;
    planName: string; month: string; monthLabel: string; claimedAt: Date;
  }[]>

rejectClaim: organizationOwnerProcedure
  .input(RejectMembershipClaimSchema)               // { assignmentId, month }
  .mutation(): Promise<{ cleared: boolean }>

// packages/api/src/router/entity.ts
activationPreview: organizationOwnerIdentityProcedure
  .input(EntityIdSchema)                            // { entityId: IdSchema }
  .query(): Promise<{
    entityId: string; entityName: string; enforced: boolean;
    activeMembers: number; uncovered: { userId: string; name: string; role: string }[];
  }>

setMembershipEnforced: organizationOwnerIdentityProcedure
  .input(SetMembershipEnforcedSchema)               // { entityId: IdSchema, enforced: z.boolean() }
  .mutation(): Promise<{ enforced: boolean }>

// packages/api/src/router/notification.ts
announceAll: organizationOwnerIdentityProcedure
  .input(AnnounceAllSchema)                         // AnnounceSchema + BranchSelectionSchema
  .mutation(): Promise<{ ok: true; rows: number; pushed: number }>

audienceCountsAll: organizationOwnerIdentityProcedure
  .input(BranchSelectionSchema.optional())
  .query(): Promise<{ all: number; students: number; staff: number }>
```

**Changed procedures.**

```ts
accessPlan.policy    → adds `bankDetails: string`
accessPlan.setPolicy → input adds `bankDetails` (required; full replace)
accessPlan.mine      → was MembershipStanding[]; becomes
                       { bankDetails: string; memberships: (MembershipStanding & { reference: string; claimedAt: Date | null })[] }
accessPlan.markMonth → clears `claimed_at` on every real change
payments.myDues      → `requisites.bankDetails` reads `membership_policy`, not `payment_settings`
payments.getRequisites → drops `bankDetails`; keeps `{ graceDays, enforced }`
stats.organizationMembers → each branch row adds `invitedRole: string | null`
```

**Deleted.** `payments.updateRequisites`, `apps/nextjs/src/app/_components/payment-requisites.tsx`, `BranchMemberships` in `payments-screen.tsx`, the `PolicyCard` grace form in `memberships-screen.tsx` (it moves).

**New validators** (`packages/validators/src/access-plan.ts` unless noted):

```ts
ClaimMembershipMonthSchema  = z.object({ assignmentId: z.uuid() })
RejectMembershipClaimSchema = MarkMembershipMonthSchema.omit({ paid: true })
MembershipPolicySchema      += bankDetails: blockText(0, 2000)     // same sanitizer as UpdatePaymentRequisitesSchema
// packages/validators/src/fields.ts
EntityIdSchema             = z.object({ entityId: IdSchema })
SetMembershipEnforcedSchema= z.object({ entityId: IdSchema, enforced: z.boolean() })
// packages/validators/src/notifications.ts
BranchSelectionSchema      = z.object({ entityIds: z.array(IdSchema).max(50).optional() })
AnnounceAllSchema          = AnnounceSchema.extend(BranchSelectionSchema.shape)
```

**New pure rules.**

```ts
// packages/domain/src/membership-month.ts
export function canClaimMonth(m: {
  paid: boolean;
  claimedAt: Date | null;
}): boolean;

// packages/domain/src/member-directory.ts
export function staffRows(rows: DirectoryRow[]): DirectoryRow[];
export function pendingCoachCount(rows: DirectoryRow[]): number;

// packages/domain/src/notify.ts
export function announcementFanOut(
  perEntity: { entityId: string; userIds: string[] }[],
): { rows: { entityId: string; userId: string }[]; push: string[] };
```

**New web files.**

```
apps/nextjs/src/app/_components/shell-frame.tsx                 slice 1.1
apps/nextjs/src/app/(app)/(organization)/layout.tsx             slice 1.2
apps/nextjs/src/app/(app)/(organization)/staff/page.tsx         slice 1.2
apps/nextjs/src/app/(app)/(organization)/settings/page.tsx      slice 1.2
apps/nextjs/src/app/_components/organization-shell.tsx          slice 1.2
apps/nextjs/src/app/_components/organization-settings-screen.tsx slice 2.6
apps/nextjs/src/app/_components/staff-screen.tsx                slice 5.3
apps/nextjs/src/app/_components/announce-dialog.tsx             slice 6.3
```

`overview/`, `people/` and `memberships/` move under `(organization)/`. A route group adds no path segment, so every existing link keeps working.

---

## Slice 0. Lock contracts

### 0.1 ADR 127

File `docs/issues/127-the-owner-level.md`. Header line in the house style:

> **Status:** accepted · **Date:** 2026-09-04 · **Area:** `packages/db` (migrations `0057`-`0058`), `packages/domain` (the claim rule, the staff filter, the announcement fan-out), `packages/api` (organization procedures, activation), `apps/nextjs`, `apps/expo`. **Amends:** [126](126-a-branch-is-not-always-a-mat.md) §3 (bank details were per branch) and §7 (activation was a hand-run script). **Relates to:** [124](124-the-organization-owns-typed-entities.md) (the tenant model), [40](40-manual-transfer-payments.md) (the legacy branch dues), [82](82-membership-booking-gate.md) (the legacy gate).

Sections, each already decided so none needs research:

1. **Why.** Three organization pages exist with no shell and no way to reach each other except two buttons hand-placed on the overview. The gym's bank account is stored once per branch, so a shared membership covering two branches has two accounts and the member is shown neither. A member on shared memberships has no way to say they paid, which the legacy dues path has had since ADR 40. Activation is a script somebody runs with psql.
2. **One shell.** A route group, not a second app. Same frame, two item lists. A non-owner sees Overview only. Why the frame is shared: the entity shell already holds the badge, tab-overflow and safe-area behaviour, and two copies would drift.
3. **One bank account.** `membership_policy.bank_details` for the organization. Both readers, the shared standing and the legacy `payments.myDues`, read that one row. Why not per branch: one membership covering a mat and a gym is paid once, into one account, so two accounts is a question with no right answer. `payment_settings.bank_details` is dead and dropped a deploy later.
4. **The claim.** `membership_month.claimed_at`. A member says they paid; the owner confirms or rejects. No amount is stored: the tracker records that somebody said they paid, not money. Claiming twice is one claim. Rejecting clears the flag and writes no audit row, because nothing about `paid` changed.
5. **Activation as a procedure.** `entity.setMembershipEnforced`, owner only, organization-scoped, with a preview naming who loses booking access. Off is allowed and is ADR 126's rollback level 2. Why a preview: the flip is the one action in the product that can stop a paying member booking tomorrow.
6. **Staff and announcements as organization reads.** The same shape ADR 124 fixed for `stats.organization`: owner check first, one scoped transaction per entity, combined by a pure function. No organization-wide query over tenant tables, no relaxed policy.
7. **What this does not authorize.** Logo upload (no file storage in the stack). Deleting an organization (the branch danger zone stays). Referrals across branches. A leads roll-up. A shared curriculum library. An organization-level invite list. Any money movement. Curriculum stays per branch.
8. **Rollout.** Two additive migrations, one hand-run fill with a dry run, no feature flag. Every slice is additive until 4.4, and 4.4 changes only branches an owner has flipped. Rollback of a flip is the same switch off. Rollback of the shell is a revert, since no data moved for it.

Then add the line to `docs/map.md` beside 126.

### 0.2 Spec, roadmap, architecture

`docs/spec.md`: a new block at the top, in the shape of the GB block at `:3-16`, headed **The owner level (v7.5)** with status **planned**.

- **OD1: One organization shell.** Overview, Members, Memberships, Staff and Settings share one frame with the branch screens. URLs do not change. A non-owner sees Overview only and learns nothing about a sibling branch.
- **OD2: One bank account.** The gym's bank details belong to the organization. Every screen that shows where to pay reads that one record, on shared memberships and on legacy branch dues alike. Each membership carries a reference the member adds to the transfer.
- **OD3: A member says "I paid".** A member marks the month they are being judged on as sent. Claiming twice is one claim. The owner confirms it, which marks the month paid, or rejects it, which clears it and lets them claim again. No amount is recorded.
- **OD4: Activation from Settings.** The owner switches a branch onto shared memberships from organization Settings, after a preview naming how many active members hold nothing that covers them. The switch turns off again and hands the branch back to the legacy gate.
- **OD5: Branch Payments retires at activation.** An activated branch shows the owner no Payments item. Its students see their membership standing, with the bank details and the claim, instead of a dues line they do not owe.
- **OD6: Staff across branches.** One row per person, with a role badge per branch and a marker for a pending coach request. Approving, promoting and setting a role stay on that branch's Coaches page.
- **OD7: Announce to every branch.** One post reaches the branches the owner picks. A person at two branches gets one inbox row per branch and one push.

`docs/roadmap.md`: a block above the v7.4 one, same table shape, six rows for slices 1 to 6, every cell `todo`, linking to ADR 127, the run file and this file.

`docs/architecture.md` §0: one paragraph saying the organization level has a shell of its own, that `membership_policy` holds the gym's bank account, and that activation is a procedure.

### 0.3 Caller inventory

Done. Recorded here rather than in the run file's Log, because it is reference, not a diary.

**`payment_settings.bank_details`.** Schema `packages/db/src/payments-schema.ts:181`. One reader helper, `readPaymentSettings` in `packages/api/src/payments-read.ts:11`, called from five places: `payments-gate.ts:55`, `router/payments.ts:197` (`getRequisites`), `:208` (`updateBookingGate`), `:426` (`myDues`), `router/membership.ts:331` (the roster's dues column). Only `getRequisites` and `myDues` read `bankDetails`; the other three want `graceDays` and `enforcedAt`. Written by `router/payments.ts:227` (`updateRequisites`) and seeded at `packages/db/src/seed/data.ts:597`.

**`getRequisites` / `updateRequisites` / `PaymentRequisites`.** `payment-requisites.tsx:26,31`; `booking-gate.tsx:22` (gate fields only); `payments-screen.tsx:25,106,147`; prefetched at `apps/nextjs/src/app/(app)/entities/[entityId]/settings/page.tsx:21`; freshness entry `packages/domain/src/freshness.ts:16`. Tests: `payments.test.ts:130`, `booking-gate.test.ts:260`, `second-academy-empty.test.ts:75,109`, `validators/test/sanitize.test.ts:215`.

**`membershipEnforcedAt`.** Written only by `provision.ts:85` (a general space is enforced from birth). Read by `payments-gate.ts:52,119`, `router/booking.ts:127`, `router/membership.ts:317,330`, `router/payments.ts:439,447`, `router/academy.ts:151` (surfaced to the client as `membershipEnforced`), and on the client by `payments-screen.tsx:36` and `settings-screen.tsx:44`. Carried on every request by `ScopedEntity` (`packages/db/src/membership.ts:172`). Tests: `booking-gate.test.ts:324`, `general-space-booking.test.ts:347`, `provision.test.ts:238`.

**Links to the organization pages.** `/overview`: `entity-selector.tsx:101`, `memberships-screen.tsx:72`, `(app)/page.tsx:23`, and the ADR docs. `/people` and `/memberships`: `overview-screen.tsx:58-61`, plus `payments-screen.tsx:97` linking to `/memberships`. `people-screen.tsx` links back into a branch with `entityHref`.

**`accessPlan.mine`.** Two callers: `apps/nextjs/src/app/_components/membership-notice.tsx:21` and `apps/expo/src/app/(tabs)/profile.tsx:176`. `MembershipNotice` is mounted in one place on web, `my-dues.tsx:47`, and one place in the app, `profile.tsx:651`.

---

## Slice 1. Organization shell

### 1.1 Extract the frame

New `apps/nextjs/src/app/_components/shell-frame.tsx`. Move out of `app-shell.tsx` unchanged: the `NavItem` interface, all eleven icon components, `iconClass`, `MAX_TABS`, `initials`, `tabClass`, `TabFace`, `NavLink`. Export the icons, `NavItem` and `ShellFrame`.

```ts
export interface ShellFrameProps {
  items: NavItem[]; // already filtered by `show` and given `href`
  isCurrent: (path: string) => boolean;
  homeHref: string;
  profileHref: string;
  selector: ReactNode;
  user: { name: string; email: string };
  roleLabel: string; // "owner", "pending", "gym"
  columnClass: string;
  sidebarExtra?: ReactNode; // the share-links dialog, entity only
  headerExtra?: ReactNode; // the bell and the share button, entity only
  banners?: ReactNode; // the pending strip and the dues strip
  children: ReactNode;
}
```

`ShellFrame` holds the whole `return` of `ShellChrome` (`app-shell.tsx:426-635`) with those props substituted. What stays in `app-shell.tsx`: the `academy.current` gate, `EntityProvider`, the four badge queries, the dues strip, the item list, `contentWidth`, and the `canVisit(within, academy) ? children : <NoAccessState />` guard, which is entity-specific and stays around `children` before they are passed down.

No behaviour change on the entity side. This step is a pure move: `pnpm typecheck` and `pnpm lint`, and the diff should read as cut and paste.

### 1.2 Route group and the organization shell

Move three directories, no file edits inside them yet:

```
(app)/overview     → (app)/(organization)/overview
(app)/people       → (app)/(organization)/people
(app)/memberships  → (app)/(organization)/memberships
```

`(app)/page.tsx`, `(app)/profile/page.tsx` and `(app)/entities/` stay outside the group. The group must not wrap them: `/` redirects and `/profile` forwards into a branch, and neither wants chrome.

New `(app)/(organization)/layout.tsx`:

```tsx
export default async function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) return null;
  return (
    <OrganizationShell
      user={{ name: session.user.name, email: session.user.email }}
    >
      {children}
    </OrganizationShell>
  );
}
```

New `apps/nextjs/src/app/_components/organization-shell.tsx`, a client component:

```tsx
const { entities, canAdd } = useOrganization(); // canAdd is the owner signal already on the wire
const claims = useQuery({
  ...trpc.accessPlan.claims.queryOptions(),
  enabled: canAdd,
});
const directory = useQuery({
  ...trpc.stats.organizationMembers.queryOptions(),
  enabled: canAdd,
});

const items = [
  { path: "/overview", label: "Overview", icon: <DashboardIcon />, show: true },
  { path: "/people", label: "Members", icon: <MembersIcon />, show: canAdd },
  {
    path: "/memberships",
    label: "Memberships",
    icon: <PaymentsIcon />,
    show: canAdd,
    badge: claims.data?.length ?? 0,
  },
  {
    path: "/staff",
    label: "Staff",
    icon: <CoachesIcon />,
    show: canAdd,
    badge: pendingCoachCount(directory.data?.rows ?? []),
  },
  {
    path: "/settings",
    label: "Settings",
    icon: <SettingsIcon />,
    show: canAdd,
  },
];
```

`isCurrent = (path) => pathname === path || pathname.startsWith(`${path}/`)`. `homeHref` and `profileHref` are `/overview` and `/profile`. `roleLabel` is `canAdd ? "owner" : "member"`. `columnClass` is the shared `mx-auto w-full max-w-6xl px-6 md:px-8`. No `sidebarExtra`, no `headerExtra`, no banners: the share dialog, the bell and the dues strip all belong to a branch.

The two badges arrive with slices 3 and 5. Until then both queries return what they return today and the badges read zero, so this step ships with the badge wiring already in place and nothing to show.

Stubs, so the two new nav items lead somewhere:

```tsx
// (organization)/staff/page.tsx     → <PageHeader title="Staff" subtitle="Everyone who runs a branch." />
// (organization)/settings/page.tsx  → <PageHeader title="Settings" subtitle="Your gym: its name, where members pay, and which branches run on memberships." />
```

Both wrapped in `Suspense` with `PageLoader`, following `(organization)/people/page.tsx`.

A non-owner opening `/staff` or `/settings` gets a page whose only query is owner-only, so the screen shows `NoAccessState`. The procedures refuse them first: that is the real guard.

### 1.3 Screens lose their own page furniture

Three screens currently draw their own page: a `Logo`, a centred column and their own padding, because nothing framed them.

- `overview-screen.tsx`: drop `<Logo size={30} />` and the `mx-auto flex w-full max-w-4xl flex-col gap-10 p-6 py-12` wrapper (`:42-43`), keep the inner `flex flex-col gap-10`. Delete the two buttons at `:58-61`. Keep `AddBranchButton`. Change the heading from `Your academies` to `Your gym`, and the subtitle from `Pick a mat to run, or add another.` / `Pick a mat to open.` to `Pick a branch to run, or add another.` / `Pick a branch to open.`, because a branch may be a gym (ADR 126). The `entities.length === 0` early return keeps its own centred `JoinByCode` layout.
- `memberships-screen.tsx`: same treatment at `:61-63`, and delete the `All branches` button at `:71-73`, which the selector now carries.
- `people-screen.tsx`: same treatment, drop the `Logo` import at `:11`.

Each screen keeps its `PageHeader`-shaped title block. Do not convert them to `PageHeader`: their subtitles carry an action row and the component takes one.

### 1.4 The selector marks "All branches"

`entity-selector.tsx`. Make `activeId` optional:

```ts
export function EntitySelector({
  organization,
  activeId,
}: {
  organization: Organization;
  activeId?: string;
});
```

- `const active = activeId ? entities.find((e) => e.id === activeId) : undefined;`
- Trigger label: `active?.name ?? "All branches"`.
- The `All branches` item gets `aria-current="true"` and the `<Check />` when `activeId` is undefined.
- The `alone` early return stays, guarded on `activeId` being present, so an organization with one branch and no add rights still gets plain text on a branch page and the dropdown on the organization pages.

`app-shell.tsx` keeps passing `activeId`; `organization-shell.tsx` passes none.

**Slice 1 is done when** every existing link still resolves, an owner can walk Overview, Members, Memberships, Staff and Settings from the sidebar without touching the URL, a non-owner sees one item, and `pnpm typecheck` and `pnpm lint` are green.

---

## Slice 2. One bank account and organization Settings

### 2.1 Migration 0057

`packages/db/migrations/0057_membership_bank_details.sql`:

```sql
-- The gym's bank account belongs to the ORGANIZATION (ADR 127). One shared
-- membership covering a mat and a gym is paid once, into one account, so a
-- per-branch account is a question with no right answer.
ALTER TABLE "membership_policy" ADD COLUMN "bank_details" text DEFAULT '' NOT NULL;
```

`packages/db/src/access-schema.ts`, inside `membershipPolicy`, after `calendarTimeZone`:

```ts
bankDetails: t.text().notNull().default(""),
```

Journal entry `{ "idx": 57, "version": "7", "when": 1790208000000, "tag": "0057_membership_bank_details", "breakpoints": true }`. Stamp it by hand after `drizzle-kit generate`, then check `select count(*) from drizzle.__drizzle_migrations` reads 58.

### 2.2 The fill

`packages/db/scripts/2026-09-04-bank-details-to-organization.sql`. A script, never a migration: it is right once, on one database.

Dry run first:

```sql
SELECT o.id AS organization_id, o.name, e.id AS default_entity, ps.bank_details
FROM organization o
JOIN entity e ON e.organization_id = o.id AND e.is_default AND e.deleted_at IS NULL
JOIN payment_settings ps ON ps.academy_id = e.id
LEFT JOIN membership_policy mp ON mp.organization_id = o.id
WHERE ps.bank_details <> '' AND coalesce(mp.bank_details, '') = '';
```

Then the fill:

```sql
INSERT INTO membership_policy (organization_id, bank_details)
SELECT o.id, ps.bank_details
FROM organization o
JOIN entity e ON e.organization_id = o.id AND e.is_default AND e.deleted_at IS NULL
JOIN payment_settings ps ON ps.academy_id = e.id
WHERE ps.bank_details <> ''
ON CONFLICT (organization_id) DO UPDATE
  SET bank_details = EXCLUDED.bank_details
  WHERE membership_policy.bank_details = '';
```

The `WHERE` on the conflict clause is what makes a second run write nothing. `is_default` is the authority on which branch is the main one, not the id equality, even though ADR 124 makes them the same value.

Run with `psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/scripts/2026-09-04-bank-details-to-organization.sql` against dev. Production has no organizations; run it there only if one appears before the deploy.

### 2.3 The reference

No new code. `paymentReference(name, id)` in `packages/domain/src/payments.ts:111` already produces `"SAM LEE 5T6U"` from a name and an id tail. The membership reference is `paymentReference(user.name, assignmentId)`, computed at read time in `accessPlan.mine` (2.4), never stored. Its test already exists in `packages/domain/test`.

### 2.4 The policy carries the account

`packages/validators/src/access-plan.ts`:

```ts
export const MembershipPolicySchema = z.object({
  graceDays: z.number().int().min(0).max(28),
  calendarTimeZone: z
    .union([
      lineText(1, 64).refine(isValidTimeZone, "Pick a zone from the list"),
      z.null(),
    ])
    .optional(),
  bankDetails: blockText(0, 2000),
});
```

`blockText` is the same sanitizer `UpdatePaymentRequisitesSchema` uses, so the invisible-character and blank-run rules are identical and `packages/validators/test/sanitize.test.ts` keeps covering the shape.

`packages/api/src/router/accessPlan.ts`:

- `policy` selects `bankDetails` too and returns `bankDetails: row?.bankDetails ?? ""`.
- `setPolicy` writes `bankDetails: input.bankDetails` in both the `values` and the `onConflictDoUpdate.set`. It is a full replace, which is why the form posts all three fields.

`packages/api/src/membership-status.ts`, one new reader beside `membershipCalendar`:

```ts
/** The gym's bank account. One row for the organization, "" before anybody sets it. */
export async function membershipBankDetails(db: TenantTx): Promise<string> {
  const [row] = await db
    .select({ bankDetails: membershipPolicy.bankDetails })
    .from(membershipPolicy);
  return row?.bankDetails ?? "";
}
```

`accessPlan.mine` changes shape:

```ts
mine: enrolledProcedure.query(async ({ ctx }) => {
  const memberships = await membershipStanding(ctx.db, ctx.session.user.id, new Date());
  return {
    bankDetails: await membershipBankDetails(ctx.db),
    memberships: memberships.map((m) => ({
      ...m,
      reference: paymentReference(ctx.session.user.name, m.assignmentId),
    })),
  };
}),
```

`membershipStanding` itself is untouched, so `accessPlan.forUser` keeps working.

**Tests** in `packages/api/test/membership-assignment.test.ts`, in the existing `describe("the membership policy")`:

- `it("saves the gym's bank account with the rest of the policy")`
- `it("hands a member the account and their own reference")`: `mine.bankDetails` matches what the owner saved, and `memberships[0].reference` contains the member's name.
- `it("gives two members of one gym different references")`
- `it("keeps another gym's bank account out of sight")`: a second organization reads `""`.

### 2.5 The legacy path reads the same row

`packages/api/src/router/payments.ts`:

- `myDues` at `:426`: keep `readPaymentSettings` for the gate fields, and build `requisites` as `{ bankDetails: await membershipBankDetails(ctx.db), reference }`. The reference stays `paymentReference(ctx.session.user.name, memberId)`: this is the branch dues path and the member id is what its claims are keyed by.
- `getRequisites` at `:196`: drop `bankDetails` from the return. It becomes the booking-gate read.
- Delete `updateRequisites` at `:227` and its `UpdatePaymentRequisitesSchema` import. Leave the schema in `packages/validators`: `sanitize.test.ts` covers it and it costs nothing.

Delete `apps/nextjs/src/app/_components/payment-requisites.tsx` and both its uses in `payments-screen.tsx` (`:106` inside `BranchMemberships`, which slice 4.4 deletes wholesale, and `:147` the Bank details tab). Drop the `bank` tab from the `OwnerPayments` tab list at `:127-137` and from the `tab` union at `:117`; step 4.4 adds the line that points at organization Settings instead.

**Tests:**

- `packages/api/test/payments.test.ts:128` `it("a gym with no settings row reads the shared defaults")`: the expected object loses `bankDetails`, and the `myDues` assertion below it becomes "reads the organization's account, empty until it is set".
- New in the same file: `it("shows the student the gym's account, not the branch's")`: write `membership_policy.bank_details`, leave a different value on `payment_settings`, and assert `myDues().requisites.bankDetails` is the organization one.
- `packages/api/test/second-academy-empty.test.ts:75,109`: `it("carries no plans, dues or bank details")` loses its bank-details line, because bank details are no longer a per-branch thing to be empty. Replace the `updateRequisites` call in `beforeAll` with nothing; the plan and dues writes above it already prove the branch starts empty.
- `packages/api/test/booking-gate.test.ts:260` `it("the gate toggle round-trips through getRequisites")` keeps working unchanged.

### 2.6 Organization Settings

New `apps/nextjs/src/app/_components/organization-settings-screen.tsx`, rendered by `(organization)/settings/page.tsx`, which prefetches `accessPlan.policy` when `myEntities().canAdd`.

Three sections in one column, `flex flex-col gap-8`:

**1. Your gym.** `PageHeader title="Settings" subtitle="Your gym: its name, where members pay, and which branches run on memberships."`, then a card with the organization name. Display-then-edit, the `academy-identity.tsx` pattern: the saved name as text with an `Edit` button, then an `Input` plus `Save` and `Cancel`. Submit calls `organization.rename`. The button is disabled only while the request is in flight (ADR 120). One line under it: `This is the gym as a whole. Each branch keeps its own name.`

**2. Memberships.** One card, one form, one Save, three fields:

- `Grace days`, number, 0 to 28, the block moved verbatim from `memberships-screen.tsx:273` including the sentence `With 7 days, an unpaid September lets somebody in until the 8th at midnight in Europe/Lisbon.` and the `That zone comes from your main branch until you pick one here.` tail.
- `Time zone for deadlines`, the same `timeZoneOptions` select.
- `Bank details`, a `Textarea` rows={4}, placeholder `Bank: …\nIBAN / Card: …\nRecipient: …`, label `Bank details`, helper `Members see this wherever they are told to pay, at every branch. They add the reference shown on their own screen to the transfer.`

Submit parses `MembershipPolicySchema` and calls `setPolicy` with all three. On success invalidate `trpc.accessPlan.policy.pathFilter()` and `trpc.accessPlan.mine.pathFilter()`. Error copy: `Give a number of days from 0 to 28.` on the grace field through `FieldError`.

**3. Branches.** Slice 4.3 fills it. Ship 2.6 with the section heading and the branch names only.

`memberships-screen.tsx` loses `PolicyCard` entirely and gains one line under the month board: `Grace, the deadline time zone and your bank details live in Settings.` with a `Link` to `/settings`.

`organization.rename`, new file `packages/api/src/router/organization.ts`:

```ts
export const organizationRouter = {
  /**
   * Rename the gym. Writes `organization.name` only: each branch keeps its own
   * name, which is the one every screen shows (ADR 124).
   */
  rename: organizationOwnerIdentityProcedure
    .input(CreateAcademySchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.baseDb
        .update(organization)
        .set({ name: input.name.trim() })
        .where(eq(organization.id, ctx.organizationId));
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
```

Base connection on purpose: `organization` carries no RLS policy and migration `0020` revoked `matops_app`'s write access, which is exactly why the identity tier exists. Register it in `packages/api/src/root.ts` as `organization`.

**Tests** in `packages/api/test/entity-authorization.test.ts`, a new `describe("renaming the gym")`:

- `it("is owner only")`: a coach and a student both get `FORBIDDEN`.
- `it("renames the gym and leaves every branch name alone")`
- `it("never reaches another gym")`: a second organization's name is unchanged.

### 2.7 Both clients show where to pay

Web, `membership-notice.tsx`. The query result is now an object:

```tsx
const standing = useQuery(trpc.accessPlan.mine.queryOptions());
const warned = (standing.data?.memberships ?? []).filter((m) => m.warning);
```

Under the warning cards, when `warned.length > 0` and `standing.data.bankDetails` is set, a `How to pay` block copying `my-dues.tsx:142-168`: one card with `Eyebrow` `Bank details` and a `CopyButton`, one card with `Eyebrow` `Reference — add this to your transfer` and the reference in `font-mono`, and the line `Pay in your own bank app, then tell your gym here.` When the account is empty: `Ask your gym for their bank details to pay.`

One reference per membership. Two unpaid memberships means two reference cards, each under its own warning, because the two are different payments.

Expo, `apps/expo/src/app/(tabs)/profile.tsx:174`. Same change to the query read, and under the `Banner`s a `CopyField label="Bank details"` and `CopyField label="Reference (add to your transfer)" data`, the two components `MembershipDues` already uses at `:250-255`.

**Slice 2 is done when** an owner sets one account in Settings and both a legacy branch student and a shared-membership member see the same account with their own reference.

---

## Slice 3. The claim

### 3.1 Migration 0058

`packages/db/migrations/0058_membership_claim.sql`:

```sql
-- A member says they paid (ADR 127). The flag is the whole record: no amount,
-- because the tracker records that somebody said they paid, not money.
ALTER TABLE "membership_month" ADD COLUMN "claimed_at" timestamp with time zone;
```

`access-schema.ts`, in `membershipMonth` after `remindedAt`:

```ts
claimedAt: t.timestamp({ withTimezone: true }),
```

Journal `when` `1790294400000`. Note in the column comment that `claimed_at` is the second reason an UNPAID row exists, beside `reminded_at`, and that `paid` false with no row still means the same thing to every rule.

### 3.2 The pure rule

`packages/domain/src/membership-month.ts`:

```ts
/**
 * Can this month take a claim? Only one that is neither paid nor already
 * claimed. A second claim is not an error and not a new record: the member
 * pressed a button twice, or the gym has not looked yet.
 */
export function canClaimMonth(month: {
  paid: boolean;
  claimedAt: Date | null;
}): boolean {
  return !month.paid && month.claimedAt === null;
}
```

**Test** in `packages/domain/test/membership-month.test.ts`, a new `describe("claiming a month")`:

- `it("takes a claim on an unpaid month nobody has claimed")`
- `it("refuses a second claim")`
- `it("refuses a claim on a month already ticked paid")`

### 3.3 The API

`packages/api/src/router/accessPlan.ts`.

```ts
/**
 * A member says they sent the transfer for the month they are being judged on.
 *
 * The server picks the month, never the caller: it is `monthOf(now)` in the
 * organization's own calendar zone, which is the same month `mine` shows them,
 * join month included. Idempotent: a second press finds the claim and reports
 * `claimed: false`.
 */
claimMonth: enrolledProcedure
  .input(ClaimMembershipMonthSchema)
  .mutation(async ({ ctx, input }) => {
    const [assignment] = await ctx.db
      .select({ id: accessAssignment.id, status: accessAssignment.status })
      .from(accessAssignment)
      .where(and(
        eq(accessAssignment.id, input.assignmentId),
        eq(accessAssignment.userId, ctx.session.user.id),   // own membership only
      ));
    if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: ASSIGNMENT_NOT_FOUND });
    if (assignment.status !== "active") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: MEMBERSHIP_NOT_ACTIVE });
    }

    const calendar = await membershipCalendar(ctx.db);
    const month = monthOf(new Date(), calendar.timeZone);
    const [held] = await ctx.db
      .select({ paid: membershipMonth.paid, claimedAt: membershipMonth.claimedAt })
      .from(membershipMonth)
      .where(and(eq(membershipMonth.assignmentId, input.assignmentId), eq(membershipMonth.month, month)));
    if (held && !canClaimMonth(held)) return { claimed: false, month };

    const now = new Date();
    await ctx.db
      .insert(membershipMonth)
      .values({ organizationId: ctx.organizationId, assignmentId: input.assignmentId, month, paid: false, claimedAt: now })
      .onConflictDoUpdate({
        target: [membershipMonth.assignmentId, membershipMonth.month],
        set: { claimedAt: now },          // never touches `paid`
      });
    return { claimed: true, month };
  }),
```

The user-id filter in the first select is the guard, not a `where` on the update: RLS scopes the table to the organization, so another member's assignment is visible and only this filter makes it unreachable. Message constants beside the existing ones: `const MEMBERSHIP_NOT_ACTIVE = "That membership is not active, so there is nothing to pay for.";`

```ts
/** Claims waiting for the owner, oldest first: the queue is a to-do list. */
claims: organizationOwnerProcedure.query(async ({ ctx }) => {
  const calendar = await membershipCalendar(ctx.db);
  const rows = await ctx.db
    .select({
      assignmentId: membershipMonth.assignmentId,
      month: membershipMonth.month,
      claimedAt: membershipMonth.claimedAt,
      userId: accessAssignment.userId,
      name: user.name,
      email: user.email,
      planName: accessPlan.name,
    })
    .from(membershipMonth)
    .innerJoin(accessAssignment, eq(accessAssignment.id, membershipMonth.assignmentId))
    .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
    .innerJoin(user, eq(user.id, accessAssignment.userId))
    .where(and(isNotNull(membershipMonth.claimedAt), eq(membershipMonth.paid, false)))
    .orderBy(asc(membershipMonth.claimedAt));
  return rows.map((r) => ({ ...r, monthLabel: formatMonth(r.month, calendar.timeZone) }));
}),

/**
 * Clear a claim without marking the month paid. No audit row: `paid` did not
 * change, and the audit is the history of that flag. The member may claim again.
 */
rejectClaim: organizationOwnerProcedure
  .input(RejectMembershipClaimSchema)
  .mutation(async ({ ctx, input }) => {
    const cleared = await ctx.db
      .update(membershipMonth)
      .set({ claimedAt: null })
      .where(and(
        eq(membershipMonth.assignmentId, input.assignmentId),
        eq(membershipMonth.month, input.month),
        isNotNull(membershipMonth.claimedAt),
      ))
      .returning({ id: membershipMonth.id });
    return { cleared: cleared.length > 0 };
  }),
```

`markMonth` gains `claimedAt: null` in both the `values` and the `set` of its upsert, in both directions. Confirming a claim clears it because it is answered; un-marking a month clears it because there is no claim left to restore.

`mine` (already reshaped in 2.4) adds `claimedAt` per row, which the button reads. `membershipStanding` therefore selects `claimedAt` alongside `paid` at `membership-status.ts:105-112` and carries it on `MembershipStanding`.

**Tests** in `packages/api/test/membership-assignment.test.ts`, a new `describe("a member says they paid")`:

- `it("records one claim on the month the member is judged on")`
- `it("takes a second press as the same claim")`
- `it("refuses a claim on somebody else's membership")`: `NOT_FOUND`.
- `it("refuses a claim on a cancelled membership")`: `PRECONDITION_FAILED`.
- `it("shows the owner every open claim with the person, plan and month")`
- `it("keeps another gym's claims out of the queue")`
- `it("clears the claim and marks the month paid when the owner confirms")`
- `it("clears the claim and nothing else when the owner rejects, and the member can claim again")`
- `it("leaves no claim behind when a paid month is corrected back to unpaid")`
- `it("writes no audit row for a rejection")`
- `it("keeps the queue owner only")`

### 3.4 Web

`memberships-screen.tsx`, a new `ClaimsWaiting` section rendered above `<MonthBoard />`:

- Heading `Eyebrow` `Waiting for you`. Hidden entirely when the list is empty: an empty queue is not news on this screen, the month board below already says who has not paid.
- One row per claim in the `cardClass()` row shape the month board uses: the person's name, then `{planName} · {monthLabel}` muted, then `Said they paid {relative day}` in `text-xs`.
- Two buttons: `Confirm` (primary) calling `markMonth({ assignmentId, month, paid: true })`, and `Reject` (outline) calling `rejectClaim({ assignmentId, month })`. Each disabled only while its own mutation is in flight, matched on `variables.assignmentId` the way `ClaimsToConfirm` in `payments-screen.tsx:170-200` does.
- On success invalidate `accessPlan.claims`, `accessPlan.monthBoard` and `accessPlan.forUser`. Toasts: `Payment confirmed` and `Claim rejected`, the same two words the legacy screen uses.

The Memberships badge in `organization-shell.tsx` is already wired to `accessPlan.claims` from 1.2 and starts showing a number here.

### 3.5 Expo

`profile.tsx`, in `MembershipNotice`. Under each warning whose membership has `paid === false`:

```tsx
claimedAt ? (
  <Txt size={14} tone="muted">
    Payment submitted — waiting for your gym to confirm.
  </Txt>
) : (
  <Button
    label={claim.isPending ? "Submitting…" : "I paid"}
    loading={claim.isPending}
    onPress={() =>
      confirm({
        title: "Mark this as paid?",
        message:
          "This tells your gym you sent the transfer. They'll confirm it once the money arrives.",
        confirmLabel: "I paid",
        destructive: false,
        onConfirm: () => claim.mutate({ assignmentId }),
      })
    }
  />
);
```

`claim` is `useMutation(trpc.accessPlan.claimMonth.mutationOptions({ onSuccess: () => void standing.refetch() }))`, the pattern `MembershipDues` uses at `:203`. The same block, in the web's own components, goes on `membership-notice.tsx` beside the reference card from 2.7.

**Slice 3 is done when** a member claims from either client, the owner sees one row, confirming ticks the month and clears the claim, and rejecting puts the button back.

---

## Slice 4. Activation and retirement

### 4.1 The preview rule

No new domain function. The preview is `loadRosterStanding` read in one branch's scope and filtered:

```ts
const uncovered = members
  .filter((m) => m.status === "active")
  .filter((m) => !standing.get(m.userId)?.covered);
```

`covered` is already computed from `coveringAssignments`, the pure rule the gate itself uses, so the preview and the gate cannot disagree. Every active member counts, whatever their role: `booking.ts:127` runs the gate for any member who books and gives staff no bypass.

Tick 4.1 with a Log line saying the rule was already there.

### 4.2 The API

`packages/validators/src/fields.ts`:

```ts
export const EntityIdSchema = z.object({ entityId: IdSchema });
export const SetMembershipEnforcedSchema = z.object({
  entityId: IdSchema,
  enforced: z.boolean(),
});
```

`packages/api/src/router/entity.ts`, one shared guard:

```ts
/**
 * The branch this call names, or FORBIDDEN. Runs BEFORE any scope is opened, so
 * an id belonging to another gym never reaches a read (ADR 124).
 */
async function requireOwnEntity(
  ctx: { organizationId: string; baseDb: DbExec },
  entityId: string,
) {
  const found = await getEntityInOrganization(
    entityId,
    ctx.organizationId,
    ctx.baseDb,
  );
  if (!found)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "That branch is not yours",
    });
  return found;
}
```

```ts
/**
 * Who stops being able to book if this branch is switched onto shared
 * memberships. The names are the point: a count alone does not tell an owner
 * whether the switch is safe.
 */
activationPreview: organizationOwnerIdentityProcedure
  .input(EntityIdSchema)
  .query(async ({ ctx, input }) => {
    const branch = await requireOwnEntity(ctx, input.entityId);
    return withScope({ organizationId: ctx.organizationId, entityId: branch.id }, async (db) => {
      const members = await rosterOf({ academyId: branch.id, db });
      const active = members.filter((m) => m.status === "active");
      const standing = await loadRosterStanding(db, {
        entityId: branch.id,
        people: active.map((m) => ({ userId: m.userId, status: m.status })),
        now: new Date(),
      });
      const uncovered = active.filter((m) => !standing.get(m.userId)?.covered);
      return {
        entityId: branch.id,
        entityName: branch.name,
        enforced: branch.membershipEnforcedAt !== null,
        activeMembers: active.length,
        uncovered: uncovered.map((m) => ({ userId: m.userId, name: m.name, role: m.role })),
      };
    }, ctx.baseDb);
  }),

/**
 * Switch one branch between the two gates (ADR 126 §3, ADR 127). Turning it on
 * stamps the moment; turning it off hands the branch back to the legacy dues
 * gate, which is rollback level 2 and is meant to be reachable.
 */
setMembershipEnforced: organizationOwnerIdentityProcedure
  .input(SetMembershipEnforcedSchema)
  .mutation(async ({ ctx, input }) => {
    const branch = await requireOwnEntity(ctx, input.entityId);
    const enforcedAt = input.enforced ? (branch.membershipEnforcedAt ?? new Date()) : null;
    await withScope({ organizationId: ctx.organizationId }, (db) =>
      db.update(entity).set({ membershipEnforcedAt: enforcedAt }).where(eq(entity.id, branch.id)),
      ctx.baseDb);
    return { enforced: enforcedAt !== null };
  }),
```

The write runs inside `withScope` rather than straight on `baseDb`, because `entity` carries an RLS policy on `app.organization_id` (migration `0043`) and ADR 125 put entity writes back under it. Turning it on twice keeps the first timestamp, the same idempotence `updateBookingGate` has at `payments.ts:208`.

**Tests** in `packages/api/test/entity-authorization.test.ts`, a new `describe("switching a branch onto memberships")`:

- `it("refuses a coach and a student")`
- `it("refuses an entity of another organization before it reads anything")`: `FORBIDDEN`.
- `it("gives an entity that does not exist the same answer as a foreign one")`
- `it("names the active members no membership covers")`
- `it("counts nobody once a plan covers the branch")`
- `it("keeps the first timestamp when switched on twice")`
- `it("hands the branch back to the legacy gate when switched off")`

And in `packages/api/test/general-space-booking.test.ts`, beside `it("answers for whichever gate the branch runs on")`:

- `it("moves the branch onto the shared resolver when the owner flips it")`: flip with the procedure instead of the direct update at `booking-gate.test.ts:324`, then assert booking is decided by coverage.
- `it("restores the legacy gate when the owner flips it back")`

### 4.3 The branch list on Settings

The third section of `organization-settings-screen.tsx`, one row per branch from `useOrganization().entities`:

- Name, then a muted line: `Runs on shared memberships` or `Runs on branch dues`.
- A `Switch` (or a `Button` reading `Switch on` / `Switch off`, whichever the UI package already has) on the right.
- Turning ON opens a `ConfirmDialog` fed by `entity.activationPreview` for that branch. While it loads, the confirm button is busy. Copy, with the count in the title:
  - Zero uncovered: title `Switch Second Mat onto memberships?`, body `Every active member there is covered by a membership. Their branch dues stop deciding access from now on, and the Payments screen for this branch goes away.`
  - Some uncovered: title `3 members would stop being able to book`, body `Ana Silva, Bruno Costa and Chen Wei are active at Second Mat and hold no membership covering it. Switching on stops them booking until you give them one. You can switch back at any time.` List the first five names, then `and 4 more`.
  - Confirm label `Switch on`, destructive styling when the count is above zero.
- Turning OFF is one line of confirmation: title `Hand this branch back to branch dues?`, body `Its own dues, plans and claims decide access again. Nothing about the memberships covering it is deleted.` Confirm label `Switch off`.
- On success invalidate everything (`queryClient.invalidateQueries()`), the same blunt call `AddEntityDialog` makes at `entity-selector.tsx:169`. The branch's gate is carried on `academy.current`, which every entity screen reads, so a targeted invalidation would leave a stale shell in another tab.

### 4.4 Retire the branch screen

`payments-screen.tsx`:

- Delete `BranchMemberships` (`:39-111`) and its imports (`useEntity` stays if `PaymentsScreen` still needs it, `cn`, `Link`, `SkeletonRows` may become unused; let `lint` say).
- `PaymentsScreen` becomes: `if (!isOwner(academy)) return <MyDues />; return <OwnerPayments />;` The owner never reaches it at an activated branch because the nav item is gone, and typing the URL gives them the legacy screen for a gate the server ignores, which is why 4.4 also does the nav.
- `OwnerPayments` gains one line under its `PageHeader`: `Your bank details live in Settings for the whole gym now.` with a `Link` to `/settings`.

`app-shell.tsx`, the Payments item at `:379-385`:

```ts
{
  path: "/payments",
  label: isOwner ? "Payments" : academy.membershipEnforced ? "Membership" : "Dues",
  icon: <PaymentsIcon />,
  show: (isOwner && !academy.membershipEnforced) || (!isStaff && !isPending),
  badge: isOwner ? claimsCount : 0,
},
```

The `payments.claims` badge query at `:315-319` gains `enabled: isOwner && !academy.membershipEnforced`, so an activated branch stops asking for legacy claims.

`my-dues.tsx` is what a student sees at `/payments`. At an activated branch `myDues` already returns `dues: null, canChoosePlan: false`, so the screen shows the `MembershipNotice` at `:47` plus the `How to pay` block from 2.7. Add the guard so the empty dues card is not drawn: when `academy.membershipEnforced`, render the notice, the bank details and the claim button, and skip the `Your dues` section entirely. Title `Membership`, subtitle `What you owe on your memberships, and where to send it.`

`settings-screen.tsx` needs no change: `:44` already hides the legacy gate at an activated branch.

The dues strip in `app-shell.tsx:328-338` reads `myDues().access`, which `loadBookingAccess` fills from whichever gate the branch runs on, so it keeps warning correctly with no edit.

### 4.5 The dues reminder skips an activated branch

`packages/db/src/dues-reminder.ts`, in the CLAIM subselect at `:74-82`:

```sql
      SELECT md2."id" FROM "member_dues" md2
      JOIN "entity_membership" em ON em."id" = md2."member_id" AND em."status" = 'active'
      JOIN "entity" e ON e."id" = md2."academy_id"
                     AND e."deleted_at" IS NULL
                     AND e."membership_enforced_at" IS NULL
      WHERE ...
```

In the claim, not the resolve, and for the reason the comment above it already gives: claiming stamps the period, so a row filtered later would be silently skipped forever. Add one line to that comment saying the second join is the gate, and that a branch on shared memberships is warned by the membership sweep instead.

**Tests** in `packages/api/test/reminder-sweep.test.ts`, in `describe("dues reminder sweep")`:

- `it("never reminds a member at a branch on shared memberships")`
- `it("leaves the period unstamped there, so switching back still reminds them")`: flip the branch off after a sweep and assert the next sweep claims the row.

### 4.6 Expo

`profile.tsx`. `MembershipDues` at `:199` and `ChoosePlanCard` at `:293` already render nothing useful at an activated branch, because `myDues` returns `dues: null` and `canChoosePlan: false`. Two edits:

- The `!d && !requisites.bankDetails` early return at `:218` now fires with the organization account present, so it says `Your gym hasn't set up membership dues yet.` when it should say nothing at all. Guard the whole `MembershipDues` block on `!academy.membershipEnforced` and let `MembershipNotice` with its 2.7 bank details be the whole membership section there.
- The section heading around `:651` reads `Membership dues`. At an activated branch it should read `Membership`.

Whether `academy.membershipEnforced` is on hand in the app: it comes from `academy.current`, which the app already queries for the profile header. If it is not in scope there, read it from the same query rather than adding one.

**Slice 4 is done when** an owner flips a branch from Settings, sees the preview, and the branch's Payments item and student dues line both disappear, and flipping back restores them.

---

## Slice 5. Staff across branches

### 5.1 The pure grouping

`packages/domain/src/member-directory.ts`, not a new file.

```ts
export interface DirectoryEntry {
  ...
  /** The role a pending seat was invited to hold. Null for everyone else. */
  invitedRole: string | null;
}

export interface DirectoryBranch {
  ...
  invitedRole: string | null;
}

/**
 * The people who RUN a branch, from the same rows the member directory is built
 * from. Anyone who is an owner or an instructor somewhere, plus anyone waiting
 * on a coach seat, one row per person.
 */
export function staffRows(rows: DirectoryRow[]): DirectoryRow[] {
  return rows.filter((r) =>
    r.branches.some((b) => isStaff(b) || isPendingCoach(b)),
  );
}

/** Coach requests waiting anywhere in the gym: the Staff nav badge. */
export function pendingCoachCount(rows: DirectoryRow[]): number {
  return rows.reduce((n, r) => n + r.branches.filter(isPendingCoach).length, 0);
}
```

`isStaff` from `./access` and `isPendingCoach` from `./membership` both already take a `{ role, status, invitedRole }` shape, so `DirectoryBranch` satisfies them once `invitedRole` is on it. A pending coach is counted per branch, not per person: two branches waiting on the same person is two decisions.

**Tests** in `packages/domain/test/member-directory.test.ts`:

- `it("keeps an owner at one branch and a student at another")`
- `it("drops somebody who is only ever a student")`
- `it("keeps a pending coach request")`
- `it("counts one badge per waiting branch, not per person")`
- `it("gives one row two branch badges for one person")`

### 5.2 The API

No new procedure. `readEntityDirectory` in `packages/api/src/router/stats.ts:378-388` adds one field to the object it maps: `invitedRole: m.invitedRole`. `rosterOf` already selects it (`packages/db/src/membership.ts:448`) and already includes pending rows.

**Test** in `packages/api/test/general-space-booking.test.ts`, beside `it("gives the owner one directory row per person across branches")`:

- `it("says which pending seats are coach requests")`

### 5.3 The web screen

New `apps/nextjs/src/app/_components/staff-screen.tsx`, rendered by `(organization)/staff/page.tsx`, which prefetches `stats.organizationMembers` when `canAdd`, exactly as `people/page.tsx` does.

```tsx
const directory = useQuery(trpc.stats.organizationMembers.queryOptions());
const rows = staffRows(directory.data?.rows ?? []);
```

- `PageHeader title="Staff" subtitle="Everyone who runs a branch, and who is waiting to."`
- A branch `Select` filter, the one `people-screen.tsx` already draws, reusing `matchesDirectoryFilter`.
- One row per person: name, email muted, then one badge per branch. The badge reads `{branch name} · {role}` and links to `entityHref(branch.entityId, "/coaches")`. A pending coach badge reads `{branch name} · waiting` in the warning tone.
- Under the list, one line: `Approving, promoting and setting a role happen on that branch's Coaches page.` The badge is the way there. This is GB5's rule applied to staff: the organization level shows, the branch level acts.
- Empty state: `Only you so far.` with `Invite a coach from a branch's Coaches page.`
- Errors and loading: `SkeletonRows` and `ErrorState label="your staff"`, like `people-screen.tsx`.

The Staff badge in `organization-shell.tsx` reads `pendingCoachCount(directory.data?.rows ?? [])` from the same query, which is already wired from 1.2.

**Slice 5 is done when** a person who owns one branch and coaches another is one row with two badges, and a waiting coach shows a badge on the nav.

---

## Slice 6. Announce to every branch

### 6.1 The pure rule

`packages/domain/src/notify.ts`:

```ts
/**
 * One announcement, several branches. A person at two branches gets an inbox
 * row at each, because the feed is per branch and a message they cannot find
 * where they are looking is a message they did not get. They get ONE push,
 * because a phone buzzing twice for one announcement is the gym shouting.
 */
export function announcementFanOut(
  perEntity: { entityId: string; userIds: string[] }[],
): { rows: { entityId: string; userId: string }[]; push: string[] } {
  const rows = perEntity.flatMap((e) =>
    [...new Set(e.userIds)].map((userId) => ({ entityId: e.entityId, userId })),
  );
  return { rows, push: [...new Set(rows.map((r) => r.userId))] };
}
```

**Tests** in `packages/domain/test/notify.test.ts`:

- `it("gives one person at two branches two rows and one push")`
- `it("gives one person at one branch one row and one push")`
- `it("counts nobody twice when a branch lists them twice")`
- `it("returns nothing for no branches")`

### 6.2 The API

`packages/api/src/router/notification.ts`. `announcementTargets` at `:15` takes `ctx: MemberScope`, which is `{ academyId, db }`, so it already works for any scoped read. Change nothing about it; call it once per branch with a `MemberScope` built from that branch's transaction.

```ts
/**
 * Post to several branches at once (ADR 127). Owner only, and every branch is
 * read in its OWN scope, one transaction each, exactly as the organization
 * dashboard reads are. No organization-wide query over the tenant tables.
 */
announceAll: organizationOwnerIdentityProcedure
  .input(AnnounceAllSchema)
  .mutation(async ({ ctx, input }) => {
    const branches = await readOrganizationEntities(ctx.organizationId, ctx.baseDb);
    const chosen = input.entityIds
      ? branches.filter((b) => input.entityIds.includes(b.id))
      : branches;

    const perEntity: { entityId: string; userIds: string[] }[] = [];
    for (const branch of chosen) {
      const userIds = await withScope(
        { organizationId: ctx.organizationId, entityId: branch.id },
        (db) => announcementTargets({ academyId: branch.id, db }, input.audience),
        ctx.baseDb,
      );
      perEntity.push({ entityId: branch.id, userIds });
    }

    const { rows, push } = announcementFanOut(perEntity);
    if (rows.length === 0) return { ok: true as const, rows: 0, pushed: 0 };
    await notifyAnnouncementAcross(
      { rows, push, title: input.title, body: input.body, sentBy: ctx.session.user.name },
      ctx.baseDb,
    );
    return { ok: true as const, rows: rows.length, pushed: push.length };
  }),
```

`readOrganizationEntities` is private to `stats.ts` today. Move it to `packages/api/src/organization-read.ts` and import it in both, rather than writing a second copy.

`packages/api/src/notify.ts` gains one function beside `notifyAnnouncement`. The existing `deliver` pushes once per delivery item, so a person in two branches would be pushed twice. Rather than teach `deliver` a new mode, write the inbox rows with the helper it already uses and send the push once:

```ts
/**
 * One announcement across branches. The inbox row is per branch, the push is
 * per person, which is why this does not go through `deliver`: that pushes once
 * per row, and one message must buzz one phone once.
 */
export async function notifyAnnouncementAcross(
  input: {
    rows: { entityId: string; userId: string }[];
    push: string[];
    title: string;
    body: string;
    sentBy: string;
  },
  exec: DbExec,
): Promise<void> {
  const message = buildAnnouncementMessage({
    title: input.title,
    body: input.body,
  });
  try {
    await insertNotifications(
      input.rows.map((r) => ({
        academyId: r.entityId,
        userId: r.userId,
        kind: "announcement" as const,
        title: message.title,
        body: message.body,
        sentBy: input.sentBy,
      })),
      exec,
    );
  } catch (err) {
    console.error("[notify] inbox write failed", err);
  }
  try {
    const targets = await getPushTargets(input.push, exec);
    await sendPush(
      targets.flatMap((t) =>
        t.tokens.map((to) => ({
          to,
          ...message,
          data: { type: "announcement" },
        })),
      ),
    );
  } catch (err) {
    console.error("[notify] delivery failed", err);
  }
}
```

Both halves swallow their own errors, end to end, like every other function in that file: an announcement must never fail the mutation.

```ts
/** How many people the post would reach, for the button label. */
audienceCountsAll: organizationOwnerIdentityProcedure
  .input(BranchSelectionSchema.optional())
  .query(...)   // same loop, returns { all, students, staff } deduplicated by user id
```

`AnnounceAllSchema` and `BranchSelectionSchema` in `packages/validators/src/notifications.ts`. `AnnounceAllSchema` extends the existing `AnnounceSchema`, so title and body keep their sanitizers and bounds. Leaving `entityIds` out means every branch.

**Tests** in `packages/api/test/notification.test.ts`, a new `describe("announcing to every branch")`:

- `it("writes one inbox row per branch and pushes once per person")`: two branches, one person at both.
- `it("reaches only the branches the owner picked")`
- `it("counts the audience without the inactive members, across branches")`
- `it("is owner only")`: an instructor gets `FORBIDDEN`, which is where it differs from `announce`.
- `it("never reaches another gym's branch")`: an entity id from a second organization is dropped, not honoured.
- `it("posts nothing when the audience is empty")`

### 6.3 The composer

Extract `ComposeAnnouncement` from `notifications-screen.tsx` into `apps/nextjs/src/app/_components/announce-dialog.tsx`, taking:

```ts
{ mode: "branch" } | { mode: "organization"; branches: { id: string; name: string }[] }
```

In branch mode it calls `notification.announce` and `audienceCounts`, exactly as today. In organization mode it adds a branch multi-select (checkbox list, all ticked by default, one line reading `All branches` when every box is ticked) and calls `announceAll` and `audienceCountsAll`. The button label stays `Post to {n}`, now counting people across the chosen branches, so nobody posts blind.

Open it from the organization shell header. Ponytail note: the shell frame has no header action slot for the organization list, so put the trigger on the Overview screen as a header button reading `Post an update`, beside `Add branch`. One button, no new slot in the frame.

**Slice 6 is done when** one post reaches two branches, a person at both has two feed rows and one push, and the button counted them once.

---

## Slice 7. Release

### 7.1 Static gates

`pnpm typecheck` and `pnpm lint` at the root. Both must be green before 7.2.

### 7.2 Migrations on dev

```
pnpm -F @matops/db migrate
pnpm -F @matops/db verify
```

Expect 59 applied rows against `_journal.json`. Then the 2.2 fill: dry run first, apply, run it a second time and confirm it writes nothing.

### 7.3 The walkthrough on dev

One pass on the pilot organization, in order:

1. Sign in as the owner. The five organization items are in the sidebar and every one opens.
2. Settings: rename the gym, set grace, set the bank details. Reload and they are all still there.
3. As a member with a shared membership: the bank details and a reference are on the profile, and `I paid` sends.
4. As the owner: the claim is in `Waiting for you`, Confirm ticks the month, the badge drops to zero.
5. Reject a second claim and confirm the member can claim again.
6. Flip a branch on from Settings, read the preview, confirm the Payments item disappears there. Flip it back and confirm it returns.
7. Staff: one person owning one branch and coaching another is one row with two badges.
8. Post one announcement to two branches. One person at both has two feed rows and one push.

### 7.4 Definition of done

Flip `docs/spec.md` OD1-OD7 to as-built with a paragraph of as-built notes in the shape of the GB block's. Update `docs/architecture.md` §0. Flip the roadmap cells. One `CHANGELOG.md` block under a `## v7.5 — the owner level` heading. Append an Outcome section to ADR 127 saying what moved: the corrections above, anything found during the build, and anything promised here that is not built.

### 7.5 The later deploy

After 7.4 is on production, migration `0059_drop_branch_bank_details.sql`:

```sql
ALTER TABLE "payment_settings" DROP COLUMN "bank_details";
```

Not before. A migration lands while the OLD code is still serving, for the length of a build, and that code still selects the column.

---

## Test commands to hand the user

Never run here.

```
pnpm -F @matops/domain test test/membership-month.test.ts test/member-directory.test.ts test/notify.test.ts
pnpm -F @matops/api test test/membership-assignment.test.ts test/entity-authorization.test.ts test/general-space-booking.test.ts test/payments.test.ts test/notification.test.ts test/reminder-sweep.test.ts test/second-academy-empty.test.ts test/booking-gate.test.ts
pnpm -F @matops/validators test
pnpm -F @matops/db test
```
