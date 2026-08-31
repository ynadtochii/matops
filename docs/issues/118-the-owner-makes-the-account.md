# 118 — The owner makes the account

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `packages/domain` (`src/leads.ts`, `src/dropin.ts`), `packages/db` (`src/membership.ts`), `packages/validators` (`src/checkin.ts`), `packages/api` (`src/members.ts`, `src/router/dropin.ts`, `src/router/membership.ts`), `apps/nextjs` (the leads screen and the wall-QR form). **Relates to:** [20](20-join-and-approval.md) and [29](29-seamless-registration.md) (the rule this note narrows), [25](25-dropin-lead-form.md), [35](35-google-sign-in.md) (one identity per email), [77](77-notification-center.md) (no gym message by email), [115](115-public-booking-api-and-the-lead-path.md) (the lead pipeline).

## Context

A lead who trained twice and wants to join has to do all the work. The owner
copies the academy-wide join link, sends it over WhatsApp themselves, and marks
the lead invited. The person then types their email, waits for a magic link,
opens it, retypes the name and phone they already gave the gym, and waits again
for the owner to approve. Six steps, two waits, for someone the owner has
already met in person.

Worse, the retyped phone is what links the lead to the member.
`linkLeadOnJoin` matches the last nine digits (ADR 115). Someone who writes
`+351 912 345 678` on the wall form and `912345678` at join still matches, but
someone who drops a digit does not, and the lead then sits at `invited` forever
while the person is an active member.

## 1. What was in the way, and was not

Nothing technical. Better Auth's magic-link verify
(`plugins/magic-link`) looks a user up **by email** and only creates one when
none is found; if the row exists it flips `email_verified` to true and opens a
session. So a `user` row written ahead of time is a working account the moment
its owner asks for a link.

Google is the same. The account-linking check reads
`isTrustedProvider || userInfo.emailVerified`, where `userInfo` is the **incoming
Google profile**, not the stored row. `google` is already a trusted provider
(ADR 35), so a pre-created user with `email_verified = false` links normally.

Writing `user` and `member` directly on the base connection is also not new:
`updateUserProfile`, `createPendingMembership` and `setMemberRoleStatus` all do
it. Both tables sit outside the RLS seam (ADR 66).

## 2. What actually changes: who proves the email

ADR 20 and ADR 29 made a membership follow proof of identity. Only the person
holding the inbox could create one. `dropIn.promote` breaks that, and it is the
whole cost of this note.

The failure it opens is real, not theoretical. An owner who types
`jon@gmail.com` for `john@gmail.com` creates an account that a stranger can sign
into, landing inside the gym as an active member carrying the lead's name,
phone, dues and attendance. Three things hold it down, and none of them is a
guarantee:

- The dialog shows the address back before anything is written, and asks the
  owner to check it with the person when they type one.
- The mutation refuses unless the email it is handed still equals the one stored
  on the lead, so a row edited in another tab cannot be promoted onto an address
  nobody confirmed.
- Removing a member already exists, and an unverified account holds nothing but
  what the gym put in it.

We take the trade because the alternative is not "safer", it is "the lead never
joins". At pilot size the owner knows every one of these people by face.

## 3. Two gates, in the domain

`canPromoteLead` refuses on three counts, in this order:

1. **Already joined.** Nothing to do.
2. **No consent.** The front desk writes `consent: false` by construction
   (`addVisitor`), because nobody asked that person anything. Making them an
   account is further than the gym is entitled to go, so this refusal is not
   fixable in the UI: the item does not appear.
3. **No email.** Fixable, so the item does appear and the dialog asks for one.
   `dropIn.setEmail` is its own mutation rather than a general lead edit: the
   address is the account identity, and it deserves a deliberate write.

Order matters. A front-desk lead has neither consent nor email, and the honest
answer is the consent one.

## 4. New account active, existing account pending

An address with **no** account becomes an active member at once. A second
approval step is ceremony: the owner just decided, in the same gesture that
would have been the approval.

An address that **already** has an account is a real person, possibly at another
gym, who never asked to join this one. That one lands `pending` and shows up on
the requests queue, where they keep their say. `createPendingMembership` is
already idempotent, so an existing **active** member of this academy is left
exactly as they are and only the lead moves to `joined`.

The lookup is case-insensitive. `user.email` is unique on the exact string, so
`Pat@Example.com` would otherwise fork a second account for the same person.

An existing user's `name` and `phone` are never touched. They own that profile.

## 4b. The wall QR form now asks for an email

This note first left the wall-poster form alone, on the grounds that a visitor
standing at a poster should not be blocked on typing an address. That was wrong
for the same reason the rest of this note exists: an email is the **only** thing
the gym cannot supply on that person's behalf, so a lead captured without one is
a lead the gym can reach only through a channel matops never sees.

`DropInSchema.email` is required, `canSubmitDropIn` gains a `no-email` refusal,
and the form's field loses its "(optional)" label. The public booking API
already required it (ADR 115), so after this the **front desk is the only path
that writes a lead with no email**, which is also the only path that writes one
with no consent. Both are true for the same reason: staff are recording a
person, not asking them anything.

Rows already in the database keep whatever they have, so `canPromoteLead`'s
email gate is not dead code, and `dropIn.setEmail` is how an owner fills one in.

## 5. One activation path

`approve` and `promote` both grant the role, flip the seat to active, put a
student on the single plan when the academy has exactly one, and send the
welcome notification. That was inline in `approve`. It now lives in
`activateMember` in `packages/api/src/members.ts`, so a promoted member cannot
land on dues differently from an approved one.

## 6. Still no email from matops

Promotion sends nothing. ADR 77's amendment holds: Resend carries the sign-in
magic link and nothing else. The owner tells the person themselves that they can
sign in now, exactly as they told them the join link before. The dialog says so.

Reversing that is a separate note. It is closer than it was, now that the wall
QR asks for an address, but the front desk still records leads without one.

## Out

- **Bulk promote.** One lead at a time. The gate is the owner checking an
  address, and a checkbox column defeats it.
- **A promoted member's own confirmation.** They find out when they sign in.
- **Promoting to instructor.** Students only (`CODE_JOIN_ROLE`). A coach seat is
  the Coaches screen's job (ADR 64).

## Consequences

- No migration. Every column already exists, and `drop_in.email` stays nullable
  because rows written before this note have none.
- The wall-QR drop-in form now requires an email, so the front desk is the last
  path that can write a lead without one.
- The leads menu gains "Make them a member", above the join-link items, which
  stay for the owner who would rather the person did it themselves.
- `dropIn.promote` is `ownerIdentityProcedure`: it writes `user` and `member` on
  the base connection and reads and writes the lead through a scoped
  transaction.
