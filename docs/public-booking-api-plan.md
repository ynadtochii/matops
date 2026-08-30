# Public booking API and the drop-in lead path: plan

**Status: DECIDED, not started.** Product decisions, the lead lifecycle and the
wire contract. No code, no ADR, no roadmap row yet. Supersedes
[visitor-booking-plan.md](visitor-booking-plan.md).

| | |
|---|---|
| **The unit** | A **lead**: a person the gym is working on. Never a member, never in member statistics, until an owner moves them |
| **The API** | A small versioned public HTTP API per academy: read the shared schedule, book a visitor, cancel |
| **The link** | One shared booking page per gym, `/book/<code>`, built on that same API |
| **Who calls the API** | Whoever builds the academy's web presence. In the pilot that is matops, as part of the offer |
| **Money** | None. No payments, prices or checkout |
| **Reverses** | [spec.md](spec.md) §4: "Public *booking* page stays OUT" |
| **Written** | 2026-08-30 |

---

## 1. Locked decisions

1. **A drop-in is a lead, not a half-member.** It stays in Drop-in leads until an owner moves it out: to a member, or to ghosted. It never enters member statistics, attendance rates or coach workload.
2. **Every booking made from outside creates or updates a lead.** It never creates a `user`, never creates a `member`, never touches approval. The public surface cannot mint an identity.
3. **Capacity never blocks**, same as everywhere else in matops.
4. **The API exposes no private data.** No capacity, no counts, no coach names, no member or visitor names, no prices. Full deny list in §8.
5. **Publication is opt-in per template**, off by default. That is also how kids classes and competition training stay off the internet.
6. **Strictly rate limited**, with numbers in §10.
7. **No payment flow.** A gym that charges for a drop-in collects at the desk.
8. **One shared booking link per gym**, so the owner can answer "when can I try a class?" with a link instead of a conversation.

## 2. Why an API, and what the shared page is for

The API is the part that cannot be rebuilt per gym. The front end is the part
that should be. matops builds the academy's web presence as part of the offer,
so the integrator is you, and one contract serves a landing page, a schedule
block, a booking button in a footer, a QR pointing at any of them, and a
third-party site later.

**The shared page earns its place separately.** The most common real case is not
a landing page, it is a text message: someone asks about training and the owner
replies with a link. That link has to exist and has to work for a gym with no
website at all.

So matops ships one thin page at `/book/<code>`, and **it consumes the public
API like any other integrator**, using the academy's own key. That makes it the
reference implementation: any gap in the contract shows up in your own page
first, before a customer's site hits it.

## 3. The lead: one unit, two axes

The codebase already models people this way. `class_participation` carries a
booking axis and an attendance axis. `class_template` carries a business status
and a soft delete. A lead gets the same treatment:

- **Stage: where the owner is with this person.** Stored, moved by the owner or by an action the owner took. `new → contacted → invited → joined`, with `ghosted` as a side exit from any point.
- **Activity: what the person actually did.** Derived, never stored: has an upcoming booking, trained N times, last seen on this date.

Keeping them apart is what stops the leads tab from lying. A person who trained
twice and was never followed up is stage `new`, activity "trained 2 times". That
row is the most valuable one on the screen, and a single status field would hide
it.

| Stage | Set by | Means |
|---|---|---|
| `new` | Automatic, on the first booking or visit | Nobody has replied yet |
| `contacted` | The owner, one tap | "I have spoken to them" |
| `invited` | Automatic, when the owner sends the join link from the lead row | "I have asked them to join" |
| `joined` | Automatic on a phone match at self-join, or by hand | They are a member now |
| `ghosted` | The owner only | Stop showing me this person |

`ghosted` never deletes anything. People come back, and the row is the only
record that they were ever interested. One tap puts them back to `contacted`.

**If this feels like one state too many, cut `invited` first.** It is the only
one whose absence costs nothing but a little precision.

## 4. The lead path, end to end

**Four entry points, one row.** All of them dedupe onto one lead per phone per
academy, which is how `drop_in` already behaves:

1. **The shared link.** The owner sends `/book/<code>` in a text. The person picks a class and books.
2. **The gym's website**, built on the API. Same result, different front end.
3. **The wall QR**, the existing `/checkin/<id>` form. Exists today.
4. **Staff "Add visitor"** on the attendance roster, for someone who walked in. Exists today.

Each lead records **where it came from**, one text column: `link`, `web`,
`wall_qr`, `staff`. Without it you cannot tell which channel is working, and the
whole point of this wave is that it is a channel.

**Then the loop:**

```
books or walks in        → lead created, stage new, shows in the owner's queue
owner replies            → contacted
turns up, marked present → activity says trained, still not a member
owner sends the join link→ invited
they self-join           → joined, automatically, matched on phone
```

**Conversion needs no new machinery.** `setJoinProfile` already writes
`user.phone` at self-join (`packages/db/src/membership.ts:143`). So when someone
joins an academy, matops looks for a lead in that academy with the same phone
and stamps it `joined` with the user id. This works no matter how they joined:
invite link, academy code, web or mobile. No per-lead token, no attribution
parameter in a URL, nothing to leak or mis-assign.

**One gotcha to handle.** Leads store digits only (`normalizePhone` strips every
non-digit), while `user.phone` is stored raw. And a person who types `+351 912
345 678` on the web form and `912 345 678` on the join form produces two
different keys. **Recommendation:** match on the **last 9 digits**. Lead volumes
are tens per academy, so a scan is free, and it makes the matcher survive the
country-code problem the exact key does not. The exact key stays as the dedupe
unique index, unchanged.

**Manual "mark as joined"** stays available for the case where the phone differs,
and it is a link to the member, not a free-text flag.

**Settled edge rule.** If a lead converts while holding a future visitor booking,
the booking stays and still works. Visitor rows and member rows are separate
lists on the roster, and neither affects capacity, so nobody is double-counted.

## 5. What the owner sees

**Dashboard queue**, two items, both of which clear to zero:

- **New leads.** Stage `new`. Somebody asked and nobody replied.
- **Trained, not joined.** Activity says they turned up at least once, stage is not `joined` or `ghosted`. This is the money row.

This also fixes something the spec currently apologises for. Today the queue
shows drop-in leads from **the last 7 days only**, because
[spec.md](spec.md) §O1 says *"a lead has no handled flag, so an all-time count
could never reach zero and the queue would read as permanently dirty"*. A stage
**is** that handled flag. The window can go.

**Members → Drop-in leads** becomes a small pipeline, not a list:

- Filter chips by stage, `new` first, `ghosted` behind its own chip.
- A row shows name, phone, source, stage, and the derived activity line: "books Wed 18:30" or "trained 2 times, last 12 Aug".
- Row actions: send the join link, mark contacted, mark ghosted, mark joined.
- Four numbers on top: leads this month, booked, trained, joined. That is the funnel that proves the channel.

**Class roster:** the visitor appears by name to staff and can be marked present
or absent, which §11 makes possible for the first time.

## 6. The shared booking link

`/book/<code>`, using the academy's existing 6-digit code. No token.

Why the code and not a rotatable token: there is nothing to revoke. The page
shows the schedule the owner published and takes bookings the owner enabled, and
the master switch in Settings is the off button. In exchange the link is
permanent, printable, sayable on the phone, and it is the same code the gym
already gives out for mobile join. A second rotatable secret to manage would buy
nothing.

The page itself is deliberately plain: gym name, the next 7 days of published
classes, tap one, four fields and a consent box, then a confirmation with the
address, the map link and what to bring. It is the fallback for a gym with no
website and the reference implementation of the API.

## 7. The API

Base `/api/public/v1`, plain REST and JSON, not tRPC, because the callers are
third parties. camelCase fields, matching the rest of the codebase, so no mapping
layer exists to drift.

**The key identifies the academy.** No academy id in any path, so a caller
cannot reach another gym by editing a URL. Sent as `X-Matops-Key`.

### GET /academy

```json
{ "name": "Alma BJJ", "timeZone": "Europe/Lisbon",
  "address": "Rua Example 12, Lisboa", "mapUrl": "https://maps.app.goo.gl/..." }
```

### GET /classes?from=2026-09-01&to=2026-09-08

Published, scheduled, future classes. `from` defaults to now, `to` to `from + 7
days`, range capped at **31 days**, response at **200 classes**. Cancelled,
deleted, past and unpublished classes are absent.

```json
{ "timeZone": "Europe/Lisbon",
  "classes": [
    { "id": "9c1e...", "title": "Fundamentals gi", "discipline": "bjj",
      "startsAt": "2026-09-01T18:30:00+01:00", "durationMinutes": 60,
      "bookable": true } ] }
```

`bookable` is false only when the class is inside the booking cut-off (§9). It is
never false because a class is full, because full is not a concept this API has.

### POST /bookings

```json
{ "classId": "9c1e...", "firstName": "Ana", "lastName": "Silva",
  "phone": "+351912345678", "email": "ana@example.com", "consent": true,
  "source": "web" }
```

All fields required except `source`, which defaults to `api`. `consent` must be
`true`, and the calling page must show the consent line with the
[/privacy](spec.md) link beside it, outside the checkbox label. That is a
contract term for any integrator, and for matops when matops builds the page.

```json
{ "bookingId": "4f7a...", "cancelToken": "b7d2...",
  "class": { "id": "9c1e...", "title": "Fundamentals gi",
             "startsAt": "2026-09-01T18:30:00+01:00", "durationMinutes": 60 } }
```

`cancelToken` is returned once. Posting the same phone to the same class again
returns the same booking with `200`, so a double tap on a bad connection is
harmless.

### DELETE /bookings/{cancelToken}

Returns `204`. **The lead survives.** Someone who cancelled still wanted to
train, and the owner still wants their number. The class roster stops showing
them.

### Errors

One shape always: `{ "error": { "code": "...", "message": "..." } }`.

| Status | Code | When |
|---|---|---|
| 401 | `invalid_key` | Missing, unknown or revoked key |
| 403 | `origin_not_allowed` | Browser origin outside the allowlist, when one is set |
| 403 | `public_api_disabled` | The owner switched it off |
| 404 | `class_not_found` | Unknown, unpublished, deleted or past. Unpublished returns 404, never 403, so the API never confirms a private class exists |
| 409 | `class_cancelled` | Cancelled after the page loaded |
| 409 | `class_closed` | Inside the cut-off, or already started |
| 422 | `validation_error` | A field failed validation, `consent: false` included. Names the field |
| 429 | `rate_limited` | Over any limit in §10. Carries `Retry-After` |

`message` is a plain sentence a page can show a person, and never database text,
which [ADR 93](issues/93-safety-pass-before-the-pilot.md) already requires.

## 8. What is never exposed

**Returned:** academy name, time zone, address, map link, class id, title,
discipline, start time with offset, duration, bookable flag.

**Never returned by any endpoint:** capacity, booking count, how full a class is,
any member name, any visitor name, instructor name or id, template id, plans,
prices, dues, notes, ranks, attendance, anything about who trains there, and any
class whose template is not published.

Write this list into [spec.md](spec.md) beside the existing schedule-privacy
rule, so the two cannot drift.

## 9. How a class becomes public

**New field:** `class_template.public_bookable`, boolean, default `false`,
**copied onto the class** at materialization the way title, capacity and
instructor already are. Two reasons for the copy rather than a join: a one-off
class has no template and can still be published, and an owner can unpublish a
single date without touching the recurring template.

**Owner UI:** one checkbox on the template form, "Share this class publicly", and
one master switch in Settings, "Public booking", off by default, which holds the
key and the shared link.

**Cut-off.** A booking is refused once the class is closer than **60 minutes**
away. Not a capacity rule: it stops a stranger booking a class already on the
mat, where nobody will see the roster change. Someone already at the door is a
walk-in, and the gym QR handles that.

## 10. Security and rate limits

**The key.** One publishable key per academy, created with the master switch,
rotatable and revocable. It is not a secret, because it ships in a browser. Its
job is attribution, revocation and per-academy limits. No secret key, no OAuth,
no scopes. Adding those before a customer needs them is how a lean API stops
being lean.

**Origins.** An optional per-academy allowlist, empty meaning any. CORS answers
from it. Optional because a server-rendered page has no origin, worth having
because a browser page does.

| Bucket | Limit |
|---|---|
| Reads per key | 60 per minute |
| Reads per address | 60 per minute |
| Bookings per address | 5 per 10 minutes, matching the existing wall form |
| Bookings per phone | 3 per day, across all academies |
| Bookings per academy | 30 per day, owner-raisable |
| Cancels per address | 10 per hour |

**One known ceiling.** `packages/api/src/rate-limit.ts` is a per-process in-memory
brake: on scaled-out serverless each instance keeps its own counters and a cold
start forgets them. Honest for a wall poster, thin for an API sold as a product.
**Recommendation:** the four write buckets move to a durable counter, the
`rate_limit` table that file already names as its upgrade path, before this is
exposed. Reads stay on the in-memory brake behind a 60-second cache.

**What the endpoint cannot do, by construction:** create a user, create a member,
change a member, read anything about a member, see another academy, move money,
or reach any class its academy has not published. One test each, because these
are the claims the surface is sold on.

## 11. Data model

### 11.1 The live bug that blocks all of this

**A lead cannot hold two classes today, and the roster reads that single
pointer.** This is not introduced by the API. A gym can hit it right now with the
"Add visitor" box on the attendance screen.

- `drop_in` is one row per phone per academy (`di_uniq_academy_phone`), with a single nullable `class_id`.
- Staff "Add visitor" (`attendance.ts:188`) and the public wall form both call `createDropIn`, which upserts on the phone and **overwrites** `class_id` (`packages/db/src/dropin.ts:100`).
- The roster reads that pointer: `where(eq(dropIn.classId, input.id))` (`attendance.ts:67`), and the student-facing attendee count does the same (`class.ts:263`).

So a visitor added to Monday's class and again to Wednesday's **disappears from
Monday's roster**. Monday's register is silently rewritten, while `visit_count`
still says 2. `packages/db/src/dropin.ts:104` predicts it in its own comment:
*"one class per lead row. Real per-visit history needs its own table."*

The lead path makes this the normal case, because a person booking two classes
next week is the behaviour it is built to invite.

### 11.2 The fix, with the model already in the codebase

One row per lead per class, with the same two axes `class_participation` uses for
members:

| Column | Why |
|---|---|
| `academy_id`, `drop_in_id`, `class_id` | Tenant scope plus the link |
| `booking_status` | The existing enum: `booked` (from the API or the page), `none` (walk-in the staff recorded), `cancelled` |
| `attendance_status` | The existing enum: `unmarked`, `present`, `absent` |
| `cancel_token` | The public cancel handle, nullable |
| unique (`drop_in_id`, `class_id`) | One row per person per class, which is also the idempotency guard for a repeat POST |

What it gives beyond unblocking the API:

- Monday's roster keeps its visitor, permanently.
- A booked visitor can be marked **absent**, which is the only way the no-show rate in §14 can be measured. Today a visitor is present by construction.
- The staff box and a public booking converge on one record instead of fighting over one pointer.
- The activity line in §3 becomes a real query instead of a guess.

`drop_in` goes back to being purely a person, and gains the lead fields: `stage`,
`source`, `contacted_at`, `converted_user_id`. `class_id` is dropped, and
`visit_count` becomes a count of `present` rows rather than a hand-maintained
integer.

**Blast radius is small:** `createDropIn`, the two roster reads above,
`materialize.ts:321` which nulls `class_id` when classes are deleted, and the
seed. The leads list does not read `class_id` at all.

### 11.3 The rule that keeps drop-ins out of the numbers

The new table is read by exactly three places: the class roster, the leads
screen, and the public API. **Nothing else may join it.** Member statistics,
attendance rates, coach workload and the drifting list read
`class_participation` and only that.

[roadmap.md](roadmap.md) K.0 already states the intent: *"a visit is a `present`
participation, so drop-ins never count and O10 always agrees with O5"*. Giving
visitors an attendance status is exactly the change that could break it by
accident, so it should be a written rule with a test, not a habit.

## 12. Slices

| | Slice | Ships |
|---|---|---|
| A.0 | Visitor visits table | §11.2, roster and attendee reads move onto it, `class_id` dropped. Fixes the register bug on its own, with no API attached |
| A.1 | Lead stages | `stage`, `source`, `contacted_at`, `converted_user_id`; phone match on self-join; the pipeline view and row actions; both dashboard queue items; the 7-day window removed |
| A.2 | Publication flag | `public_bookable` on template and class, materialization copies it, the owner checkbox |
| A.3 | The switch and the key | Settings master switch off by default, key create and rotate, optional origin allowlist |
| A.4 | Read endpoints | `GET /academy`, `GET /classes`, the §8 deny list, caching |
| A.5 | Write endpoints | `POST /bookings`, `DELETE /bookings/{token}`, durable write limits |
| A.6 | The shared page | `/book/<code>` on top of the public API, plus the link and QR in Settings |
| A.7 | Integrator docs | One page: four calls, the errors, the consent obligation, the limits |

A.0 and A.1 ship value with no API at all: a register that stops losing
visitors, and a follow-up queue that clears. A.2 to A.5 is the API. A.6 is what
the owner actually sends in a text message. A.7 is what makes it sellable.

**Acceptance criteria worth writing as tests**

- A visitor recorded on Monday's class and again on Wednesday's appears on **both** rosters afterwards.
- A booked visitor who never arrives can be marked absent, and reads as a no-show, not as present.
- A booking creates a lead and a visit row, and no `user` or `member` row, ever.
- A person who joins with the same phone flips their lead to `joined` and links the member.
- A lead with a visit and no follow-up appears in "trained, not joined" and leaves it when the owner acts.
- A ghosted lead leaves both queues and survives in the list.
- An unpublished class is a `404` on read and on booking.
- A full class books fine, and capacity appears in no response body.
- The same phone posting twice to one class yields one booking.
- A key for academy A cannot read or write anything belonging to academy B.
- A cancelled booking leaves the lead in place.
- Every limit in §10 returns `429` with `Retry-After`.
- No response body contains anything on the §8 deny list.
- No statistics query touches the visits table.

## 13. Metrics

**Primary: leads who became members.** Everything before that is a step, not a
result.

**The funnel, which is also the four numbers on the leads tab:**

```
lead created → booked a class → turned up → joined
```

**Watch:** leads per academy per week by source, the share that turn up, the
share that join, median days from lead to join, junk bookings per week, and
`429` counts by bucket.

**The number that decides the next wave:** the no-show rate on public bookings.
matops sends the visitor nothing in v1. There is no push token, no account, and
gym email is closed by [ADR 77](issues/77-notification-center.md). If no-shows
are low, sending nothing was right. If they are high, reopening a reminder
channel becomes a real decision with evidence behind it.

## 14. Not in this wave

Payments, prices or checkout · confirmation and reminder messages · webhooks ·
digital waiver · kids or guardian consent · waitlists · a visitor login · booking
for several people at once · per-lead tracking links · manual lead creation by
the owner, because sending the link and letting the booking create the lead does
the same job with no screen · lead notes and tasks, which is where this turns
into a CRM · secret keys, scopes or OAuth · any public write except a booking.

## 15. Open decisions

1. **Five stages or four?** Recommendation: ship all five, and cut `invited` first if the leads tab feels heavy.
2. **Booking cut-off at 60 minutes?** Recommendation: yes, fixed in v1, owner-adjustable later if a gym asks.
3. **Durable rate limiting before launch?** Recommendation: yes for the four write buckets. It is a small table, and it is the difference between "rate limited" and "rate limited on one server".
4. **Waiver wording.** A booking from a website must not read as permission to step on a mat. Recommendation: no digital waiver; the confirmation says the waiver is signed at the desk, and rendering that line is a contract term for integrators.
5. **Does the owner see the key in the pilot?** Recommendation: yes. Two fields, and it avoids a support path where only you can switch a customer on.

---

## Paperwork if this is promoted

- A new ADR: the reversal of §4's "public booking page stays OUT", the lead stage model, the visits table, and the deny list as a tested contract.
- [spec.md](spec.md): §4 amended; the publication checkbox in O3; the master switch, key and shared link in O6; visitors markable on the O5 roster; the lead pipeline and stages in O4; the two new O1 queue items and the removal of the 7-day window; the §8 deny list beside the schedule-privacy rule.
- [architecture.md](architecture.md): a public REST surface beside the tRPC one, and the second enumerated exception to the tenant seam. The existing drop-in exception is the precedent.
- [roadmap.md](roadmap.md): the A rows above, and "Public booking page" out of the non-goals list.
