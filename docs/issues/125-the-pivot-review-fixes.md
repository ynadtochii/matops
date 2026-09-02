# 125 — The v7.2 review fixes

**Status:** accepted, 2026-09-02.
**Supersedes nothing. Amends** ADR [124](124-the-organization-owns-typed-entities.md) §2 and the I10 rule of ADR [92](92-identity-writes-leave-the-tenant-transaction.md).
**Source:** `docs/reviews/v7.2-pivot-review-findings.md` (0 blockers, 5 serious, 18 notes).

An architecture and security review of the pivot found no way for one academy to
read or write another's rows. What it did find was a set of holes on either side
of the tenant seam. This note records the ones that are now fixed and the two
that are deliberately not.

## 1. Organization ownership wins at every entity

ADR 124 §2 says "an active organization owner reaches every entity of that
organization". The code only applied that when the owner held **no**
`entity_membership`, so a co-owner archiving or suspending the founder at mat B
locked them out of mat B with no way back: `membership.restore` is owner-tier
**at** that entity.

`resolveEntity` now reads organization ownership first. An active owner gets
`role: "owner", status: "active"` at every entity of the organization, whatever
their entity membership says. `listMembershipsForUser` applies the same rule, so
`academy.current` and the shell can no longer answer differently from the API:
before this, an owner with no membership at mat B was refused by the screen while
every procedure would have served them.

This is a widening. An owner who also coaches at one mat now sees that mat's
owner screens. They could already have reached them by deleting their own entity
membership, so it grants nothing new, and it puts one rule in one place.

## 2. `memberId` is null when there is no entity membership

The synthetic owner membership was built by spreading the Better Auth
`orgMembership`, which carried `memberId` — a `member.id`, not an
`entity_membership.id`. Twelve columns key on the second id space, and after
migration `0046` the composite foreign keys reject the first. `payments.choosePlan`
would have 500'd for an organization owner, and the booking gate read them as
having no dues.

`ctx.membership.memberId` is now `string | null`, so writing it without checking
is a typecheck failure. `choosePlan` refuses with `PRECONDITION_FAILED` and
`loadBookingAccess` treats a null as open access, which it already did for every
non-student.

## 3. `purge` can no longer delete the founder's organization

`membership.purge` protected the target with the never-ownerless guard, which
counts owners of **one entity**. The deletion that followed was organization-wide:
the Better Auth `member` row, and then the `user` row. So an owner of mat X could
erase the founder who ran the organization but coached at X as an instructor, and
nothing in the codebase can write `member.role = 'owner'` back.

`purge` now reads the target's organization role and keeps the `member` row (and
therefore the account) when it says `owner`. The entity membership still goes, so
the mat is cleared; the founder keeps the gym.

`hasOtherMemberships` was also being passed an entity id for a parameter compared
against `member.organization_id`. Right on the default mat by accident, wrong on a
second one. It takes `organizationId` now and the parameter says so.

## 4. The browser cache is keyed by the entity

The entity travels in a header, so two academies produce identical tRPC query
keys, and the selector switches with a `<Link>`, which keeps the browser cache.
Server prefetch hid most of it. What it did not hide was every query no page
prefetches: mat A's six-digit code, join QR, `/book/<code>` link and public
booking API key could appear on mat B's screens for the length of their stale
time.

An `EntityCacheBoundary` in the entity layout drops every cached query when the
URL names a different academy. It runs during render and **above** the hydration
boundary, so the old academy's rows are gone before the new one's prefetched rows
land. The layout mounts it because the layout already knows the id: keying the
`QueryClient` in `TRPCReactProvider` would need `usePathname`, and reading the
path in the root provider makes the static shell dynamic, which ADR
[91](91-cache-components-and-the-static-shell.md) exists to prevent (`next build`
fails on it outright). The last id is held per tab in a module variable rather
than a ref, because a navigation between two values of `[entityId]` may remount
the component. This is what the mobile switcher already did with
`invalidateQueries`.

The duplicate `entityFromPath` in `trpc/react.tsx` is gone; the tested one in
`@matops/domain` is the only copy.

## 5. Provisioning repairs itself at the gate

`provisionOrganization` was idempotent but both callers sat on the create path,
so an organization whose provisioning died half way had no repair: the owner's
only route back was "Start a gym", which makes a second organization.

`academy.memberships`, the post-login gate, now looks for organizations the
caller **owns** that hold no live entity and re-runs the provisioner over them.
It only fires when the caller's academy list is empty, so it costs one extra
query on a screen that is already deciding where to send them.

## 6. Smaller fixes in the same pass

- `entity` inserts name their conflict target. `onConflictDoNothing()` with no
  target swallowed a public-code or slug collision as "already provisioned", and
  the failure surfaced two statements later as a foreign key on a table the
  caller never named.
- `listEntitiesForUser` filters on `canEnroll`'s statuses. The selector was
  offering academies the caller had been removed from, which the entity tier then
  refused.
- `entity.status` is read beside `deleted_at` in `getEntityInOrganization`,
  `listEntitiesOf` and `listEntitiesForUser`. It defaulted to `active` and
  nothing read it, so it looked like an access control and was not one. Now it is.
- Seed teardown resolves the seed organizations' **entity** ids and scopes the
  tenant deletes by those; `seed fill` / `clear` take the organization id for the
  `member` table. Both broke on a dev gym with a second academy, which is the
  feature the pivot exists for.
- Mobile: the check-in deep link stores the entity in `onSuccess`, so secure
  store only ever holds an id the server accepted. The entry gate picks from the
  student's own academy list, treating the stored id as a preference inside that
  list, so a phone remembering a mat they were removed from falls back to one
  they still train at instead of the join screen. It no longer depends on the
  order two hooks are declared in, and `academy.current` is dropped from that
  screen because `listMineStudent` already answers the question.

## 7. I10, restated

ADR 92's rule was "the base connection writes only the Better Auth identity
tables and the two enumerated seam exceptions". The pivot moved academy settings
onto `entity` and `academy_profile` and the roster onto `entity_membership`, all
three of which carry an RLS policy, and left the writes on the base connection.
Nothing was exploitable — every write already passed an id `resolveEntity` had
proved — but Postgres had stopped being the second line of defence for the three
newest tenant tables.

`entity` and `academy_profile` writes move back under the seam. The owner router
hands `updateAcademySettings`, `setPublicApiEnabled`, `rotatePublicApiKey` and
`setPublicApiOrigins` a scoped transaction, and their signatures take a
`DbWriter` (`DbExec | TenantTx`) to say so. Their policies match on the two GUCs
`withScope` sets, so the writes are unchanged and RLS applies again.

Two writers stay on the base connection, and this is the whole exception list:

- `softDeleteAcademy`, because it also stamps `organization`, which migration
  `0020` revoked `matops_app`'s write access to.
- `entity_membership`, because `setMemberStatusIfNotLastOwner` and its sibling
  open their own transaction with `FOR UPDATE` to make the never-ownerless check
  and the write atomic. Nesting that inside the request transaction is a savepoint
  with different locking, which is a change to the guard, not to the connection.
  Isolation for those writes is `writeMembership`'s filter on both `id` and
  `entity_id`.

## 8. Left alone, deliberately

- **`entity_membership` and `entity` RLS match on the organization, not the
  entity.** Inside an entity transaction for mat A, a bare select of either table
  returns mat B's rows. That is ADR 124 §4 and it is what lets an entity
  transaction join to an organization-shared table. Neither table carries product
  data, and every reader carries its own entity filter. Stated here so it is
  written down rather than assumed.
- **The invite-link join still resets a suspended or archived person to pending.**
  Identical to the pre-pivot behaviour on the Better Auth row. An older hole, and
  its own slice.
- **The organization is still session state.** The URL names the entity; the
  organization above it comes from `session.activeOrganizationId`, so two tabs on
  two different GYMS still fight. Deriving the organization from the entity id
  deletes `activeOrganizationId` from the request path and is the natural end of
  this pivot, but it is a slice, not a patch.
- **Branded `EntityId` / `OrganizationId` types.** The review counted four places
  where an entity id was handed to a parameter meaning an organization id, safe
  only because the default entity's id equals the organization's. Three are fixed
  above. Branded types would turn the class into typecheck failures for about
  twenty lines. Scheduled, not done here.
- **Migration `0047`.** It drops eleven columns while the old deployment is still
  serving, which breaks the rolling-deploy rule in
  [beta-launch-plan.md](../beta-launch-plan.md) §1.2 and makes the deploy a
  one-way door. Production is empty, so the cost is zero and it ships as-is. A
  deliberate exception, not a precedent.
