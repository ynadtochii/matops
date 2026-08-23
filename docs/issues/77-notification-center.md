# 77 — The notification center: every message gets a durable copy, and the owner gets a voice

**Status:** accepted · **Date:** 2026-08-22 · **Area:** `@matops/db`, `@matops/domain`, `@matops/api`, web client (`apps/nextjs`), mobile client (`apps/expo`) · **Extends:** [17](17-class-cancellation-notification.md), [34](34-notifications-layering.md), [40](40-manual-transfer-payments.md), [75](75-daily-cron-on-github-actions.md)

## Context

Phase 4 built a sending engine and stopped there. `packages/notifications` moves
a message to Expo Push or Resend, `@matops/domain/notify.ts` writes the text, and
`packages/api/src/notify.ts` resolves who gets it. Since ADR 75 a daily tick
actually fires the dues sweep. Five kinds of message go out today and not one of
them is stored.

- **A notification exists for a few seconds and then does not.** A student with
  push turned off, or one who reads mail on a laptop they left at home, has no
  way to find out that Tuesday's class was cancelled. The product holds no
  record that it ever told them.
- **The owner has no way to say anything.** "Mats being replaced on Friday",
  "grading on the 14th", "the door code changed" — none of it fits a class edit
  or a dues reminder, so it happens on WhatsApp, outside the product, and the
  owner has no idea who saw it. `docs/roadmap.md` had announcements parked as
  out of scope, alongside DMs.
- **The engine is invisible.** Five kinds of message are wired, tested and
  scheduled, and a gym owner evaluating matops during the pilot cannot see that
  any of it exists.

## Decision

**One table of per-recipient rows, written by the same choke point that sends,
plus an owner compose box and one delivery switch.**

- **`notification` — one row per recipient per event.** Academy-scoped and
  inside the tenant seam, so a member of two gyms gets one feed per gym.
  Fan-out on write, not an announcement table plus read receipts: unread count
  is one indexed count and the feed is one flat query. At gym scale the rows
  saved by normalizing are worth less than the joins avoided.
- **The grant is what migration `0001` already decided.** Both tables name
  `SELECT, INSERT, UPDATE` for `matops_app`, but `0001` set
  `ALTER DEFAULT PRIVILEGES … GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES`,
  so every new table carries `DELETE` whatever a later migration writes. What
  keeps a notification from being deleted is that no procedure deletes one —
  not the grant. Revoking it here alone would make these two tables the only
  ones in the schema without it, which is a surprise for the next reader and
  buys nothing while the router has no delete path.
- **`deliver()` writes the row before it sends.** The inbox write sits in its
  own `try` ahead of push and email, so a dead Expo token or a Resend outage
  cannot cost the member the message. Every existing kind — cancelled, changed,
  reminder, dues, approved — became an inbox entry with no new call sites.
- **`link` is a path, not a payload.** The push `data` blob stays for the phone's
  tap router; the row stores `/class/<id>` or `/payments`, because a feed row
  only ever needs somewhere to go.
- **`announce` on `ownerProcedure`, fanned out through `announcementRecipients`.**
  Three audiences — everyone, students, coaches — resolved by a pure domain
  function over the roster. Only **active** members receive one: a pending
  person has not been approved into the gym, and a suspended one has lost access
  while keeping their history. The owner's own copy is included, which is the
  proof the post went out.
- **`notification_pref` — one switch, gym news by email.** Class and dues
  messages are transactional and always send. Announcements are not, and an
  owner posting weekly to 200 people with no way out is how a sending domain
  gets marked as spam. A missing row means opted in, so the table only records
  the explicit no.

### Why the compose box lives on the feed

An owner posting an update wants to see the feed they are posting into, and the
button that says `Post to 34` is the whole safety mechanism — the count comes
from the same pure function that picks the recipients, so nobody posts blind.
A separate `/announcements` screen would add a route, a nav item and a second
place to look, for a feature whose entire history fits in the feed it writes to.

### Why opening the screen marks everything read

The alternative is per-row read state, which means a tap target on every row and
a decision about what "read" means for a row with no link. Marking on open is
what a reader expects from an inbox. The dots stay for the current render, so
the visit still shows what was new.

## What this does not change

**No scheduler change.** ADR 75's daily tick is what it was; the class sweep
stays off. The two cron-driven kinds write inbox rows through the same
`deliver()` as everything else, so the dues reminder that fires each morning now
leaves a copy behind.

**No push or email behavior change,** except that an announcement email is
skipped for a member who turned gym news off. The one-email-per-recipient
privacy rule from ADR 60 is untouched.

**Still no live UI.** The badge polls with the rest of the shell's queries. SSE
and `LISTEN/NOTIFY` stay parked.

## Consequences

- The inbox is now the durable record and push is the alert. That is the right
  order, and it means a member who never enables push still gets everything.
- An announcement writes one row per active member. A 300-member gym posting
  weekly adds about 15,000 rows a year. Nothing prunes them yet; when it
  matters, a delete-older-than clause goes on the daily cron that already runs.
- The feed is capped at 50 rows with no pagination. A member who wants the 51st
  is a signal to add a cursor, not a reason to build one now.
- Announcements have no rate limit. The audience is one academy's own members
  and the sender is its owner, so the blast radius is a gym annoyed with its own
  gym. ADR 76's limiter covers the public surface, which is the one that faces
  strangers.
- No author is recorded on a row. An announcement is from the gym. Adding
  "posted by" later is a column and a join, not a redesign.


## Review fix (same wave): email leaves in batches

`deliver()` sent one HTTPS request per recipient. Resend limits a key to about
two requests a second and `sendEmail` never throws, so it could only log the 429
it got back. A gym-wide announcement, and the dues sweep that claims up to 500
members, would have delivered a handful of messages and swallowed the rest
silently.

- `sendEmailBatch` in `packages/notifications/src/resend.ts` posts up to 100
  distinct messages per request, with a pause between chunks. Still one message
  per recipient, so the S4 privacy rule is untouched.
- `deliver()` returns the count it could not hand off. `deliverEach()` is its
  sibling for a fan-out where every recipient gets a **different** message: the
  dues sweep resolves targets once, writes one insert, and sends one batch,
  instead of doing all three per member.
- The claim stamps `dues_reminder_period` **before** the send, so a dropped
  reminder is lost until the next billing period. `runReminderSweep` returns
  `emailsFailed`, `/api/cron/remind` reports `ok: false`, and the workflow fails
  the run. The HTTP status stays 200 on purpose: `curl --retry` would re-run the
  sweep, find every row already claimed, and report a clean tick, which is how
  the loss would have gone missing a second time.


## Follow-up (same wave): instructors post too, and every post is signed

Two of the notes above are superseded here: `announce` was owner-only, and no
author was recorded on a row.

- **`announce` and `audienceCounts` move to `staffProcedure`.** In the pilot gyms
  the owner is on the mat, not at the desk, which is the same reason the member
  desk moved to staff in ADR 76. The coach who cancels Tuesday's class is the one
  who knows it is cancelled. The audiences are unchanged, so an instructor can
  also post to staff only, which is the coach-to-coach case the original note
  ruled out.
- **`sent_by` on `notification` (migration `0024`), the sender's display NAME,
  not their user id.** A name makes the feed row readable with no join, and it is
  the record a member and a gym actually want: who said this. It is copied at
  send time, so a later rename, a role change, or a coach leaving the gym does
  not rewrite what was posted. The trade is that it does not point back at a user
  row, which is fine for a history line and wrong for anything that has to prove
  identity. If that day comes, add `sent_by_user_id` beside it rather than
  changing this column.
- Nullable, and only announcements set it. Class changes and dues reminders come
  from the system, so their rows carry no name and the feed shows none.
- The rate-limit note still holds, with a wider sender set: an instructor can now
  post to the gym. Same academy, same blast radius, and the owner can demote a
  coach who abuses it.

## Follow-up (same wave): the phone gets the feed, behind a bell

The center now runs on both clients. The phone reaches it differently.

- **No tab for it.** The student tab bar holds the four jobs (ADR 45, ADR 70) and
  a fifth tab would push Scan into a crowd for a screen that is read once a week.
  A **bell in the screen header** carries a red dot while anything is unread and
  pushes `notifications` over the tabs, the same way the gear opens Settings
  (S12). The web's mobile top bar gets the same bell and drops Notifications from
  its bottom tabs; the desktop sidebar keeps the item, where a row costs nothing.
- **A dot, not a count.** The badge in the desktop sidebar answers "how many are
  waiting for me". A header bell answers "is there anything", and a number on a
  22px glyph is a number nobody reads.
- **The bell hides until the membership is active.** `notification.*` is
  `memberProcedure`, so a pending or suspended student would only get a 403 out
  of it. The bell asks `academy.current` (already cached by every screen) rather
  than taking a prop.
- **Only a class row is tappable on the phone.** `link` is a web path (see above),
  and `/payments` has no mobile route because dues live on Profile (S9). Mapping
  the rest would mean a second link table on the client that drifts from the
  first. A row with nowhere to go is a plain card.
- **The screen is the web one minus compose.** There is no owner web on the
  phone, so the mobile file carries the feed, the day rules and the read-once
  effect, and nothing else.
- **The bell needed a bar to sit in, so the phone got the web's.** Each tab
  screen was drawing its own title row, some with the mark on the right, some
  without, so a bell hung off a different edge on every screen. `AppHeader`
  (`components/app-header.tsx`) is the phone twin of the web shell's mobile
  header: mark, academy name, icons, on `--card` with a hairline under it. It is
  full-bleed, so `Screen` gained a `header` slot that renders outside its
  padding. The screen title moves below the bar into the content, which is where
  the web's `PageHeader` already puts it, and Schedule stops using the academy
  name as its title because the bar now carries it.
- **An announcement's `link` is gone.** It was `/notifications`, which made every
  gym-news row a link back to the page the reader was already on: a pointer
  cursor, a hover state, and nothing on click. The row holds the entire message
  already. The feed also treats a link to itself as no link, because rows with
  the old value are already written and the writer changing does not rewrite
  them. The push `data` blob is untouched: the phone's tap router reads
  `data.type`, never `link`.
- **Icons are the web glyphs, drawn with Views.** The bell and the settings
  control were emoji, which render as someone else's artwork at someone else's
  weight and colour, and the settings emoji was a gear where the web draws
  sliders. `components/icons.tsx` redraws both from the web `app-shell.tsx`
  paths at the same 1.5/16 stroke, positioned Views like the tab icons, so no
  SVG dependency arrives for two glyphs.

## Amendment (v3.8): the gym stops sending email

Superseded here, not rewritten above: **no gym message goes out by email.** The
`notification_pref` table, the "Also send as email" tick, the per-member switch
on Profile, and the email half of every message builder are removed, along with
`sendEmailBatch` / `BatchEmail` in `packages/notifications` and `emailsFailed`
on the dues sweep. Migration `0023` no longer creates `notification_pref`.

The reason is the one this ADR used to answer with an opt-out: matops has no
mail layouts and no templates. A cancelled-class notice left as an unstyled
paragraph from a domain the member has never seen, which is what a spam filter
reads it as too, and no preference makes that mail worth sending. The
notification center was already the durable copy, so the delivery that stays
(feed row + push) is the one that was carrying the message anyway.

`sendEmail` stays in `packages/notifications` for its one remaining caller, the
sign-in magic link in `packages/auth`. Bringing gym mail back means designing
the layouts first; the builders would then grow their email half again beside
the push one, and the per-member switch comes back with them.
