# 115 — The public booking API and the drop-in lead path

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `packages/db` (migrations `0037`-`0040`), `packages/domain`, `packages/validators`, `packages/api` (a REST surface beside the tRPC one), `apps/nextjs`. **Reverses:** [spec.md](../spec.md) §4 and [map.md](../map.md), "a public _booking_ page stays OUT". **Relates to:** [12](12-rls-tenant-seam.md) (the tenant seam), [25](25-dropin-lead-form.md) (the first public write), [82](82-membership-booking-gate.md), [93](93-safety-pass-before-the-pilot.md).

The product decisions, the wire contract and the deny list are in
[public-booking-api-plan.md](../public-booking-api-plan.md). This note records
what was built and why the shape is what it is.

## Context

matops may build an academy's whole web presence as part of the offer, so a gym's
site needs a way to show its schedule and take a booking. The gym also needs the
smaller thing: someone texts "when can I try a class?" and the owner sends a
link.

Both need the same three answers, so the API is the part that cannot be rebuilt
per gym and the page is the part that should be. The shared `/book/<code>` page
is built as a consumer of the API using the academy's own key, so any gap in the
contract shows up in our page before a customer's site hits it.

## 1. A lead is one unit with two axes

Stage is where the OWNER is with this person and is stored: `new`, `contacted`,
`invited`, `joined`, with `ghosted` as a side exit. Activity is what the person
DID and is always derived from the visits table.

**Every stage move is an explicit tap.** `invited` was going to be stamped as a
side effect of copying the join link, and that was wrong: an owner copies a link
to look at it, or sends it through WhatsApp, which matops never sees, so a copy
is evidence of nothing. Copy join link and Mark invited are two items in the
same menu. `joined` is the one exception, because a real membership row is real
evidence.

All of a lead's actions live in one `⋯` menu, the same shape the member row
uses. A row carried three competing buttons before, and the row is a place to
read a person rather than a control panel.

Keeping them apart is what stops the leads tab lying. A person who trained twice
and was never followed up is stage `new`, activity "trained 2 times". That is the
most valuable row on the screen and a single status field would hide it.

All five stages shipped. `invited` is the one to cut first if the tab feels
heavy: it is the only stage whose absence costs nothing but precision.

## 2. The register bug had to be fixed first

`drop_in` was one row per phone with a single nullable `class_id`, and both the
attendance roster and the student attendee count read that pointer. A visitor
recorded on Monday and again on Wednesday **disappeared from Monday's roster**.
`packages/db/src/dropin.ts` predicted it in its own comment.

This was live before any API existed: staff "Add visitor" hits it today. The
public surface would have made it the normal case, because a person booking two
classes next week is exactly the behaviour the wave invites.

`drop_in_visit` is one row per lead per class, carrying the same two axes
`class_participation` uses: a booking axis (`booked` from the API, `none` for a
walk-in, `cancelled`) and an attendance axis. Beyond unblocking the API it buys
three things: Monday's roster keeps its visitor permanently, a booked visitor who
never arrives can be marked **absent** for the first time, and the activity line
becomes a query instead of a guess.

`drop_in.class_id` and the hand-maintained `visit_count` are both gone. A count
of `present` visit rows cannot drift from the visits themselves.

## 3. The visits table has exactly three readers

The class roster, the leads screen and the public API. **No statistics query may
join it.** Member statistics, attendance rates, coach workload and the drifting
list read `class_participation` and only that, which is what roadmap K.0 already
promised. Giving visitors an attendance status is the change that could break it
by accident, so it is a written rule with a test that walks `packages/api/src`
and fails on a fourth reader.

## 4. The key names the academy, so no path carries an id

`X-Matops-Key` on every request. No academy id appears in any URL, so a caller
cannot reach another gym by editing one. One publishable key per academy,
rotatable, plus an optional origin allowlist that CORS answers from.

No secret key, no OAuth, no scopes. Adding those before a customer needs them is
how a lean API stops being lean.

An unknown key answers `401 invalid_key` and a gym that switched the surface off
answers `403 public_api_disabled`. They are different mistakes: one is the
integrator's, one is the gym's own choice, and the integrator needs to know
which.

## 5. The deny list is enforced by the query, not by a mapping step

`listPublicClasses` and `getPublicClass` in `packages/db/src/public-api.ts`
select five columns. `publicClassView` in `packages/domain` takes those five and
returns them plus `bookable`. Neither is ever handed capacity, a booking count,
an instructor or a template id, so no response body can carry one. A test reads
the raw response text and fails on any of those words.

An unpublished class answers `404`, never `403`, so the API cannot be used to
confirm that a private class exists.

## 6. Publication is a copied flag, not a join

`class_template.public_bookable` is copied onto the class at materialization, the
way title and capacity already are. Two reasons for the copy: a one-off class has
no template and can still be shared, and an owner can unshare a single date
without touching the recurring template. Off by default, which is also how kids
classes and competition training stay off the internet.

## 7. The cut-off is not a capacity rule

A booking is refused once the class is under 60 minutes away. It stops a stranger
booking a class already on the mat, where nobody will see the roster change.
Someone at the door is a walk-in and the gym QR handles that. Capacity still
never blocks anything, and "full" is not a concept this API has.

## 8. The second enumerated exception to the tenant seam

The public handlers have no session, so they run on the trusted base connection
pinned to an academy id the key already resolved. The drop-in submit
([25](25-dropin-lead-form.md)) is the precedent and the shape is the same: every
function takes the academy id explicitly.

What the surface cannot do, by construction rather than by a check: create a
user, create a member, change a member, read anything about a member, see another
academy, move money, or reach a class its academy has not shared. It has no code
path to any of them. There is a test for each.

## 9. Conversion needs no new machinery

`setJoinProfile` already writes `user.phone` at self-join. So when someone joins
an academy, matops looks for a lead in that academy with the same phone and
stamps it `joined` with the user id. This works however they joined: invite link,
academy code, web or mobile. No per-lead token, no attribution parameter in a
URL, nothing to leak or mis-assign.

The match is on the **last nine digits**, because leads store digits only while
`user.phone` keeps whatever was typed, and the same person writes
"+351 912 345 678" on one form and "912 345 678" on the other. Two leads ending
in the same nine digits match nothing: a wrong link is worse than no link. The
exact number stays the dedupe unique index, unchanged. Manual "mark as joined"
covers the rest, and it is a link to a member, never a free-text flag.

## 10. Rate limiting stays in the code, and the bill is a separate layer

The plan recommended moving the four write buckets to a durable counter before
launch. That was settled the other way, in ADR
[116](116-rate-limiting-and-the-cost-ceiling.md), which landed in the same
window: `take()` stays a per-process brake and owns the **product** rule ("3
bookings per phone per day"), while a Vercel WAF rule on `/api/public/v1` owns
the **bill**, keyed by address with a persistent deny. There is no durable
counter, because the thing a durable counter was wanted for is cost, and cost is
answered better at the edge than inside a function you have already paid to
start.

So the six buckets here are honest as product rules and are **not** an exact
global ceiling: on a scaled-out host each instance keeps its own counters and a
cold start forgets them. [public-api.md](../public-api.md) says so to
integrators. ADR 116 §7 also notes that the handlers in
`packages/api/src/public/index.ts` each opt into a limit by hand, and that a
fifth handler added later could forget, which is the same gap 116 closed for
tRPC by putting a default on `publicProcedure`.

## 11. What the dashboard queue gained, and what it lost

Two items, both of which reach zero: **New leads** (nobody has replied) and
**Trained, not joined** (they turned up and are still not a member).

The 7-day window on the leads count is gone. [spec.md](../spec.md) §O1
apologised for it in writing: "a lead has no handled flag, so an all-time count
could never reach zero and the queue would read as permanently dirty". A stage
**is** that flag.

## Out of this wave

Payments, confirmation and reminder messages, webhooks, a digital waiver, kids or
guardian consent, waitlists, a visitor login, booking several people at once,
per-lead tracking links, manual lead creation by the owner, lead notes and tasks,
secret keys, scopes or OAuth, and any public write other than a booking.

## The number that decides the next wave

The no-show rate on public bookings. matops sends the visitor nothing in v1:
there is no push token, no account, and gym email is closed by
[77](77-notification-center.md). If no-shows are low, sending nothing was right.
If they are high, reopening a reminder channel becomes a real decision with
evidence behind it.
