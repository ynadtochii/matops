# Visitor booking: product plan (proposal, not started)

**Status: SUPERSEDED by [public-booking-api-plan.md](public-booking-api-plan.md).** The decision went the other way: a lean public API first, no hosted page and no embed. Kept for the problem framing in §2, the privacy list in §6 and the failure modes in §9, which all still hold.

| | |
|---|---|
| **Scope** | A person with no account books a class from outside the gym: the gym's own website, a link, a QR anywhere |
| **Lands as** | A drop-in on that class, plus a lead the owner can follow up |
| **Builds on** | The `drop_in` table, the public `/checkin/<academyId>` form and the two existing public procedures (roadmap 3.5) |
| **Reverses** | [spec.md](spec.md) §4: "Public *booking* page stays OUT" |
| **Written** | 2026-08-30 |

---

## 1. The one-sentence version

A gym puts one link, one embed or one QR anywhere it already has an audience,
and a stranger can see the real schedule and book a first class in under a
minute, without an account.

## 2. The job it is hired to do

**When** I have decided to try grappling and I am on a gym's website at 11pm,
**I want** to see when classes run and claim a spot in one,
**so I can** commit before I lose my nerve, without calling anyone.

The gym owner's job is the other half: **when** someone shows interest,
**I want** their name and phone in one place, **so I can** follow up instead of
losing them in Instagram messages.

**The four forces**

- **Push:** the visitor is nervous and does not want to phone a gym or walk in cold.
- **Pull:** a schedule with a Book button reads as "they are expecting me".
- **Anxiety:** what do I wear, do I pay, am I the only beginner, is this class for me.
- **Habit:** the gym owner already runs on WhatsApp and Instagram DMs, and that works well enough for five people a month.

The anxiety column is the one the product can act on, and it is cheap. Three
lines of text on the class card ("Beginners welcome. Wear shorts and a t-shirt.
Nothing to pay online.") do more for conversion than any API.

**Current workaround:** the visitor sends a DM, the owner answers a few hours
later, half the interest is gone by then, and nothing is recorded anywhere. It
works, it is free, and it is invisible. That is the bar to beat.

## 3. What this reverses, and whether the reason still holds

[spec.md](spec.md) §4 locked it: *"Public **booking** page stays OUT, but a
controlled per-gym check-in / drop-in lead form IS in v1"*, and the same section
names the reason: **"QR-inside-the-gym is the anti-spam."**

That reason is real and it does not go away. A poster on a wall means only a
person standing in the gym can write to the database. Put the same form on the
open internet and that protection is gone. Everything in §7 below exists to
replace it.

The reason it is worth reversing now: the wall poster only catches people who
already walked in. The gym's whole trial funnel happens before that, and matops
sees none of it. That is the largest hole in the product's story, and it is the
one thing a gym owner can point at and say it made them money.

## 4. There are three products in this request. Build one.

The request names an integration API. Underneath it are three separate products
with very different audiences.

| | Who installs it | Effort for the gym | Gyms who can use it |
|---|---|---|---|
| **A. A hosted page** (one link + one QR) | Nobody, it just exists | Paste a link in Instagram bio, print a QR | Every gym |
| **B. An embed** (copy-paste snippet on their site) | The person who edits the site | One paste into Wix, Squarespace, Framer, WordPress | Most gyms |
| **C. A documented API** (keys, JSON, build your own) | A developer | A build | Almost none, today |

**Recommendation: build A, then B. Do not build C yet.**

A pilot-stage gym does not have a developer. It has a link in bio, a Google
Business profile and a website someone's cousin made. C is built for a customer
that does not exist yet, and a documented public write endpoint is an abuse
surface you have to defend from day one for nobody's benefit.

The lazy part: A and B need the same public reads and the same public write
underneath. So the API gets built anyway as a byproduct. The decision here is
only about **documenting and supporting it as a product**, which is a support
burden, a versioning promise and a rate-limit key system. Ship that when the
first gym asks, and charge for it if it is ever a plan feature.

One exception worth taking now: make the **schedule read** a plain public JSON
response per academy, unauthenticated, cached. It is nearly free, it is what the
embed calls anyway, it carries no write risk, and a gym's real timetable on
their own landing page is good for their search ranking. The **write** stays
behind the hosted page and the embed in v1.

## 5. The MVP, end to end

The walking skeleton, in the order a person meets it.

**5.1 The owner turns it on.** One switch in Settings: *"Let visitors book
classes online"*, **off by default**. Turning it on reveals the link, the QR and
the embed snippet, and a number: **how many visitor spots per class** (default
2). Off by default is not caution for its own sake: a gym that has not thought
about waivers and kids classes must not have a public write endpoint by
accident.

**5.2 The owner picks which classes are open.** A flag on the class template:
*"Open to visitors"*. Not every class is. Competition training, advanced no-gi
and kids are not. Default **off** for kids classes, **on** for anything the
owner opts in.

**5.3 The visitor lands.** One page per gym at a link built from the existing
6-digit academy code, so no new identity is needed and the link is printable and
sayable. It shows the gym name, address, map link, and the next 7 days of
visitor-open classes. Each class shows day, time, discipline, coach first name,
and one of three states: **open**, **nearly full**, **full**. Never a count,
never a member name.

**5.4 The visitor books.** One tap on a class, then the shortest form that still
works: first name, last name, phone, email, and one checkbox that covers both
contact consent and the waiver acknowledgement, with the [/privacy](spec.md)
link outside the label. Email becomes **required** here, unlike the wall form,
because it is the only way to confirm and remind someone who has no app.

**5.5 The visitor is reassured.** A confirmation screen, not a dead end. What to
bring, what it costs and that nothing is paid online, when to arrive, the map
link, an add-to-calendar button, and a link to cancel. Plus one line: *"Want to
book more classes? Get the app."* with the gym's invite link.

**5.6 The visitor is reminded.** One confirmation message on booking and one
reminder the evening before. This is the single biggest lever on whether the
person actually arrives, and skipping it makes the rest of the feature
decorative. See the open decision in §12.

**5.7 The gym sees it.** The booking writes the same `drop_in` lead the wall
form writes, deduped by phone the same way, attached to that class, tagged with
where it came from (**online**, as against a wall scan or a staff entry). Then:

- The class roster shows visitors by name to staff, so the coach knows a new person is coming.
- The dashboard queue gains one item: **visitors booked in the next 7 days**, because a booked visitor is a person to greet, and a no-show is a person to text.
- The leads tab shows the source and the class, and keeps the existing one-tap "send them the app invite".

**5.8 The loop closes.** After the class, the owner marks the visitor present as
today, and the lead carries a visit count. Two visits and no account is the
prompt to convert them. That conversion is the reason the feature exists, so it
gets a button, not a note.

## 6. What the public read is allowed to show

Making a schedule public makes it public to everyone, including the gym two
streets away and anyone scraping.

**Shows:** gym name, address, map link, class title, discipline, day and time,
duration, coach first name, and open / nearly full / full.

**Never shows:** booked counts, capacity numbers, any member name, any drop-in
name, coach surnames or contact details, prices for member plans, anything about
who trains there.

This is a stricter rule than the logged-in schedule, and it should be written in
the spec next to the existing privacy rule so the two cannot drift.

## 7. The rules the wall poster used to cover

Each of these is a product decision that only becomes necessary once the form
leaves the building.

1. **Waiver.** matops has no waiver anywhere today, because the gym does paper at the desk. A booking made from a sofa must not read as permission to step on a mat. **Recommendation for v1:** the booking is a *request to attend*, and both the confirmation screen and the reminder say the waiver is signed at the desk on arrival. No digital signature, no document storage, no legal claim. Revisit only if a pilot gym asks.
2. **Minors.** A stranger booking a kids class with no guardian is a problem you do not want in a pilot. **Recommendation:** visitor booking is 18+ only, kids classes can never be flagged open to visitors, and the form says so in one line.
3. **Payment.** matops takes no cards (a locked non-goal, see [card-billing-plan.md](card-billing-plan.md)) and manual transfer is far too slow for a stranger. **Recommendation:** the drop-in price is **text on the page** and is paid at the desk. Free first class is the gym's choice, not the product's.
4. **Capacity.** Booking never blocks in matops, on purpose. That rule cannot survive contact with the open internet, because a soft cap plus a public form is how a class ends up with thirty strangers. **Recommendation:** keep the soft cap for members, and add one hard number for visitors only: **N visitor spots per class**, past which the page says full and offers the next class. This is the smallest possible exception and it does not touch the member rule.
5. **Cancelling.** A visitor who cannot cancel produces a dirty roster and a coach who stops trusting the screen. Give them a cancel link in the confirmation, valid for that one booking.
6. **Abuse.** Losing the wall means the brake has to be real: rate limits per address (the existing public-surface limits already do this), one open booking per phone per class, a daily ceiling per academy, and an owner-visible way to remove a booking and block a phone. A junk booking is not a security incident, but ten of them are the reason the owner switches the feature off.
7. **Data.** A stranger's name, phone and email enter the system from a page they found through a search engine. The existing `/privacy` page already covers this shape of data, and the consent line already exists. It needs one sentence about what happens to a lead that never converts.

## 8. How to tell if it worked

**Primary metric: visitors who showed up on the mat.** Not bookings. A booking
that does not arrive costs the gym more than no booking, because the coach
counted on it.

**The funnel**

```
page opened → class picked → form submitted → booking confirmed
   → marked present → joined as a member within 30 days
```

**Input metrics (the three levers)**

- Confirmation-to-attendance rate. Moved by the reminder, the arrival time and the reassurance copy.
- Class-pick rate. Moved by how legible the schedule is and by beginner labelling.
- Form-completion rate. Moved by field count. Every field costs conversions.

**Counter-metrics**

- Visitor no-show rate. If it stays high the roster is a lie and staff stop reading it.
- Junk bookings per gym per week. Any number above zero is felt.
- Owner switch-offs. The clearest possible signal.

**The adoption gate, which comes first.** Before any conversion number matters:
**does a pilot gym actually put the link somewhere within 14 days?** If the
answer is no for most of them, the feature is dead regardless of how well it
converts, and the fix is distribution help, not more product. Measure this
first, on a handful of gyms, before building the embed.

**What we do not know:** the real no-show rate for an online-booked free trial
in a grappling gym. Assume it is bad, measure it in the pilot, and do not design
anything downstream that depends on a guess.

## 9. How it fails

- **Nobody installs it.** The most likely failure by a distance. A gym owner is not going to edit their website. Mitigation: the hosted link and the QR need zero installation, and the owner gets a ready-made image for Instagram and a printable QR from day one. The embed is for the minority who can paste it.
- **No-shows make the roster useless.** Mitigation: confirmation and reminder, a working cancel link, visitors visually separated on the roster, and visitor attendance kept out of member statistics so a no-show cannot pollute the gym's numbers.
- **Junk bookings.** Mitigation: §7.6, plus off by default so no gym gets this without choosing it.
- **The owner does not reply.** A booking that gets no human response is worse than a DM that gets one. Mitigation: the booked visitor appears in the dashboard queue, which is the one screen the owner already reads.
- **The gym's competitor reads the schedule.** Accepted. A timetable on a public website is normal in this industry. §6 keeps everything else back.
- **Second-order:** once bookings arrive from the internet, the gym expects a matops response path, and the product's centre of gravity shifts from running a gym to acquiring students. That is a bigger product than the one written down today. Worth going into with eyes open.

## 10. Out of v1, deliberately

Documented developer API with keys and versioning · webhooks · online payment or
a paid drop-in · digital waiver signing · kids and guardian consent · waitlists ·
a matops-wide gym directory · custom branding beyond the gym name and logo ·
multi-class or trial-week packages · a visitor account · reviews or ratings ·
anything that lets a visitor see or contact a member.

## 11. Suggested slices

Product-level only. The technical shape is the owner's to design.

| | Slice | Ships |
|---|---|---|
| V.1 | The switch and the flags | Owner setting, per-template "open to visitors", visitor spots per class |
| V.2 | The public read | Per-academy public schedule with the §6 field list |
| V.3 | The hosted page | Link, QR, class list, form, confirmation screen |
| V.4 | The gym side | Source tag on the lead, visitors on the roster, dashboard queue item, cancel link |
| V.5 | Confirm and remind | The two messages, pending the §12 decision |
| V.6 | The embed | Copy-paste snippet, after V.1 to V.5 are proven with real gyms |

V.1 to V.4 are the smallest thing that is honestly usable. V.5 decides whether
people arrive. V.6 waits for evidence that gyms will install anything at all.

## 12. Decisions needed before anything starts

1. **Does the confirmation go out by email?** Today no gym message goes by email (ADR 77 amendment); Resend carries the magic link only. A visitor has no app and no push token, so email or SMS is the only channel that exists. Recommendation: allow transactional visitor mail as a narrow, named exception, not gym messaging in general.
2. **Hard visitor cap, yes or no?** It is a deliberate exception to "booking never blocks". Recommendation: yes, visitors only.
3. **Free trial or paid drop-in at launch?** Recommendation: text on the page, paid at the desk, no money moves through matops.
4. **Is the developer API a product or a byproduct?** Recommendation: byproduct now, product when a gym asks and it can be priced.
5. **Who is the first pilot gym for this, and do they have a website?** If they do not, build V.1 to V.5 and skip V.6 entirely.

---

## Paperwork if this is promoted

- An ADR, next free number, recording the reversal of the §4 "public booking page stays OUT" line and the visitor-only hard cap.
- [spec.md](spec.md): §4 amended, a new owner section for the setting, and the §6 public-read privacy rule next to the existing schedule-privacy rule.
- [roadmap.md](roadmap.md): the V rows above, and the "Public booking page" entry moved out of the non-goals list.
- [architecture.md](architecture.md): the public read and write are a second, larger enumerated exception to the tenant seam. The existing drop-in exception is the precedent to follow.
