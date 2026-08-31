# 122 — The link is two taps away, from every screen

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `apps/nextjs` (`_components/share-links-dialog.tsx`, `_components/app-shell.tsx`, `_components/invite-link-card.tsx`), `packages/api` (`router/academy.ts`, `router/invite.ts`). **No migration.** **Relates to:** [20](20-invite-links.md), [63](63-settings-splits-by-job.md), [115](115-public-booking-api-and-the-lead-path.md).

## Context

Someone messages the gym: "do you have a trial class?" or "how do I sign up?".
Whoever is holding the phone wants to paste a link and get back to the mat.
Before this wave they could not.

**The trial link was owner-only and four steps deep.** `/book/<code>` lived in
one block on Settings, under the academy name, the code, the address and the
booking rule. Settings is owner-only, so the instructor who actually reads the
gym's messages had no path to it at all.

**The other two links were on a third screen.** `/join/<token>` and the wall
check-in form `/checkin/<id>` both sit on Members. Three links for three
different people, never side by side, so the wrong one gets sent. The check-in
form is drawn there as a printable poster, which is the right shape for the
wall and the wrong one for a reply to a message.

**`invite.list` was owner-only while `/members` is a staff route.** An
instructor opening Members hit a refused query and got an error card where the
invite belonged. That was a bug, not a policy.

**Two gates were silent.** The booking page is dead unless the master switch is
on, and shows an empty week unless a class is ticked as shared. Both default
off. Staff could copy a perfectly formed URL that led nowhere and only find out
when the prospect said so.

## Decision

### 1. One share surface, in the shell

`ShareLinksDialog`, reachable from the sidebar on desktop and the header on
mobile, on every screen, for all staff. Three rows, one per link, each with a
line saying who it is for, and Copy / Share / QR: the booking page, the wall
check-in form and the student join link. Answering is two taps from
wherever the person already was.

It **copies** the links rather than moving them. Settings keeps the public
booking setup, and Members keeps the invite card and the check-in poster, because that is where an owner
configures them, with the key and the origin allowlist beside them. The dialog
is the place you reach with someone waiting for a reply. Two surfaces onto one
link is the right trade when the two jobs are that far apart.

### 2. `academy.shareLinks`, staff, three fields

A new query returning `bookingEnabled`, `publicCode` and `hasSharedClass`. It
is deliberately not `academy.publicApi`: that one is owner-only and carries the
publishable key, which an instructor has no use for and should not hold. The
narrow shape is the guard, so the tier change costs nothing.

It runs only when the dialog opens, so `academy.current` and the shell boot
path are untouched.

### 3. `hasSharedClass` asks the visitor's own question

It reads the same seven-day window `/book/<code>` asks for, through the same
`listPublicClasses` the public endpoint uses, with a limit of one. A boolean,
not a count, because the only thing worth saying is "this link opens an empty
page". Reusing the visitor's own query means the answer cannot drift from what
the visitor sees.

### 4. Activation lives next to the failure

Booking off and the reader is an owner → the row offers **Turn on public
booking**. No class shared → the row says so and names Schedule → Templates.
No join link yet and the reader is an owner → **Create link**. The moment
someone needs the link is the moment they will accept the one tap that makes it
work; sending them to Settings to find out loses both the tap and the prospect.

An instructor is told what is missing and who can fix it, never given a button
that would be refused.

### 5. `invite.list` drops to staff, minting stays owner

Reading a link grants nothing: an owner still approves every join. Creating and
rotating stay owner-only, and `InviteLinkCard` now hides those two buttons from
a non-owner, so the Members card works for an instructor instead of erroring
and never offers a control the server would refuse.

## Consequences

- An instructor can hand out all three links. They cannot mint, rotate or
  revoke one, and cannot read the publishable key.
- Each of the three links is now rendered in two places. A change to any URL
  shape touches both. Accepted: they are built from one code, one academy id
  and one token, so the drift risk is cosmetic.
- The check-in row carries no gate, because `/checkin/<id>` has none: it is
  live for every academy and needs neither a switch nor a shared class.
- The dialog costs two queries on open, both already cached by React Query
  wherever Members or Settings was visited first.

## Out

- **A ready-made reply message.** Copy puts the bare URL on the clipboard.
  The OS share sheet already carries a sentence; staff writing their own in
  WhatsApp is not the friction.
- **A speakable link.** `/book/100001` is not something you say down a phone.
  A per-academy slug is a separate slice.
- **Mobile.** The Expo app is student-only; it has no staff surface to put
  this on.
