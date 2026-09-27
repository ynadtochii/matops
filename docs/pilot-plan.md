# Pilot plan — friends' gyms, remote

**Status: active pilot guide under ADR 135 and ADR 142.** Unlike
[business-model.md](business-model.md), [revenue-collection.md](revenue-collection.md)
and [the automatic payments plan](2026-09-24-automatic-payments-final-plan.md), which are not started, this
is what happens next.

The first academy release now uses a fresh database contract. The current operating facts are:

- Approval is admission (ADR 142). An approved, active student books with no plan or payment. A new academy starts with payment admission off, and no control in this release turns it on. When a later release turns it on, a student also needs a staff-assigned plan. There is no student plan shop.
- `/start` is one form: academy name and time zone. It makes the gym and its first academy. An owner with one academy lands on it, with no gym overview or gym menu.
- The owner can cancel a student's booking from the class roster. Nobody can book for a student; each student books for themselves.
- Web only for this release. The Expo app is not changed.
- Where a branch requires payment, the register uses monthly unpaid, reported, confirmed, and rejected states. MatOps does not move money.
- There are no automatic reminders, calendar sweeps, delivery workers, or job health checks.
- Owners extend the calendar manually. A rebuild previews exact changes and refuses booked stale classes.
- There is no visitor booking page and no public API. A visitor uses the wall-QR drop-in form at `/checkin/<id>` and becomes a lead.
- Email sends a bounded first batch after a class or visitor action. There is no retry for failed recipients in this release.
- The booking window is 7 local calendar days. Its setting is hidden in this release.

Written 2026-08-22 against the working tree at v3.0 (commit `b798d2c`).

| | |
|---|---|
| **Who** | 2-3 friends' academies. Real students, real schedules. **You are not in the room.** |
| **Price** | Free, with a written end date |
| **Student surface** | Web from day one. Android next. iOS after that |
| **Target** | A real student books a real class by **Friday 5 September 2026** |

Supersedes the ordering in an earlier gap analysis written at v2.7. Its
deployment and migration blockers are closed. [beta-launch-plan.md](beta-launch-plan.md)
holds what is left.

---

## The one honest caveat

Web in two weeks is real. **iOS and Android in two weeks is not**, and the reason
is not effort:

- Every mobile wave since v1.8 shipped **static-gates-green only**. No simulator
  exists in this build environment.
- `mobile-device-test.md` holds roughly **60 unchecked items across five waves**.
  None of them are known broken. None of them are known working either.
- No Apple Developer account ($99, enrolment takes days).
- No EAS project id, which push token registration needs.
- `expo-camera` landed after the last build, so the dev client needs a rebuild.

Debugging an untested mobile app at a gym you are not standing in, in week one,
is the fastest way to burn a friend's goodwill and a pilot slot.

**So: web carries the date, mobile follows on its own.** This is not a downgrade.
The student half has run entirely on the web since v2.2: join link, rolling
seven-day week, inline book and cancel. A web-only pilot is a complete product,
both loops.

---

## Stage 1 — Get the web pilot live (target: Friday 5 September)

### Days 1-5 · The blocker sprint

Nothing below is polish. Each item is either "a stranger sees something broken"
or "you cannot see that it broke".

**Status, 22 August 2026:** items 2-5 and 7-12 are **built and static-gates
green** (ADR [76](issues/76-pilot-blockers.md)). What is left is yours, not the
codebase's: **Vercel Pro** (item 1), **rotate `AUTH_SECRET`** (item 6), and
filling the three `[PLACEHOLDER]` markers on `/privacy` before a stranger reads
it.

| # | Item | Why it blocks | Size |
|---|---|---|---|
| 1 | **Vercel Pro, $20/mo** | Hobby forbids commercial use, and the rule keys on *anyone's* financial gain, so a revenue-generating gym is commercial even unpriced ([infra-costs.md](infra-costs.md)). Charging nothing does not cure it | 10 min |
| 2 | ~~**Sentry**~~ **DONE** (ADR 72 + 76) | **The single most important item on this page.** You are not in the room. Without it a coach hits a bug on Tuesday, shrugs, goes back to WhatsApp, and you never learn it happened. **Free tier covers this pilot** (see below) | 1-2 h |
| 3 | ~~**`error.tsx` + `global-error.tsx`**~~ **DONE** (ADR 72) | Right now a client exception shows a stranger's student a blank "Application error" page. Cheapest fix here and the most visible failure | 1 h |
| 4 | ~~**Rate limiting** on `dropIn.submit`, `invite.resolve`, magic-link send~~ **DONE** (ADR 76) | The join QR goes on a public wall. Anyone can flood the lead table and burn the Resend quota, which kills sign-in for every gym at once. Better Auth ships this as one config block (roadmap 5.2) | 2 h |
| 5 | ~~**Owner schedule recovery**~~ **DONE** | Templates generate future classes. The owner can extend the calendar. A versioned rebuild preview shows exact changes and refuses booked stale classes. | 2-3 h |
| 6 | **Rotate `AUTH_SECRET`** | The old auth error hook logged it (ADR 60). Rotating kills every live session, so it happens **before** the pilot, never during | 15 min |
| 7 | ~~**Prove Resend works in production**~~ **DONE** | `sendEmail` no-ops silently when the env vars are missing, so a missing key in Vercel looks exactly like "the magic link never arrives", with no error anywhere. Send yourself one from the live site | 15 min |
| 8 | ~~**Privacy page + a real consent line** on the drop-in form~~ **DONE** (ADR 76; three placeholders still to fill in) | It collects a stranger's name, phone and email behind one line of copy with no link to anything. Friends' gyms in the EU means GDPR, and matops is the processor | 2-3 h |
| 9 | ~~**Confirm the live deploy is current**~~ **DONE** | The v2.7 gap analysis found production at `df77c89` with `/coaches` returning 404. v2.5 through v3.1 have been committed since. Run `next build`, redeploy, click every screen | 30 min |

**Roughly two days of work.** Items 1, 6, 7 and 9 are minutes and should happen first.

**Item 2, cost:** Sentry's free **Developer** plan is 5,000 errors/month, **1 user
seat**, 30-day retention, 50 session replays, 1 cron monitor. Three gyms will not
come near 5,000 unless one recurring error fires on every page load, which is
precisely the thing you want to know about. Keep it free with config, not a
bigger plan:

- `tracesSampleRate: 0` — no performance tracing at this size.
- `replaysSessionSampleRate: 0`, but **keep replay on error**. 50/month is plenty
  for three gyms, and watching a coach hit the bug beats any stack trace when you
  are not in the room.
- `ignoreErrors` for browser-extension noise and aborted fetches. Two lines, and
  the standard way the quota gets saved.
- Leave `sampleRate: 1.0` for errors. At this scale you want every one.

Two limits to know before they bite: **one seat**, so no second person and no
gym-owner access without the Team plan ($26/mo); and **30-day retention**, so a
bug reported "a couple of months ago" is already gone. Both are fine for this
pilot, and both are reasons to check Sentry daily rather than weekly.

### Days 1-5, second half · The three that decide whether the pilot produces signal

These are not blockers. Skipping them means running the pilot and learning
nothing, which is worse than not running it.

| # | Item | Why |
|---|---|---|
| 10 | ~~**Feedback link in the sidebar**~~ **DONE** (ADR 76; footer + Profile) | Turns a frustrated coach into a bug report. One sidebar item |
| 11 | ~~**First-run checklist on the empty dashboard**~~ **DONE** (ADR 76) | After **Start a gym** the owner lands on nothing. "1. Add your weekly classes · 2. Share your join link · 3. Print the QR." You are not there to say it out loud. Biggest product gap for a remote pilot |
| 12 | ~~**Let instructors approve members and set rank**~~ **DONE** (ADR 76; approve, decline, roster, rank, notes. No payment figures, invites, leads, suspension, removal, or role picker) | Instructors can handle the daily student record while owners and managers retain membership payment decisions. |

Item 12 is a judgement call, not an automatic yes. Ask each gym who actually
handles new students before deciding.

### Days 6-7 · Your own dry run

Do not skip this. Run the whole thing yourself on the **live deployment**, not
locally, with a throwaway academy:

- [ ] Start your academy (name and time zone), then add the address.
- [ ] Build a full week of templates. Extend the calendar and inspect the rebuild preview.
- [ ] Open Students, then Invite students, then Show QR, and print the join QR poster. Join as a student from a **different browser** and a
      **phone browser**, using a real email, through the real magic link.
- [ ] Check that the pending student cannot book.
- [ ] Approve the student. As the student, with no plan, book, cancel, rebook.
- [ ] Mark an attendance roster. Set a rank.
- [ ] As the owner, cancel the student's booking from the class roster with "Cancel booking".
- [ ] Submit the wall-QR drop-in form as a visitor and check the lead on the Leads tab of Students.
- [ ] Change a booked class. Check that the student gets the notice.
- [ ] Break something on purpose and confirm **Sentry catches it**.
- [ ] Delete the throwaway academy.

If any step needs you to open a terminal, a real gym cannot do it either.

### Week 2 · Setup sessions and go live

**Two or three academies. Not five.** With three you can call every owner every
week. Five is the number where you quietly stop calling.

**One 45-minute screen-share per gym, run by you:**

1. Create their academy with them watching. Time zone, address.
2. Enter their **real** weekly schedule as templates, together.
3. Print the join QR poster (Students, Invite students, Show QR, Print poster) or send the link.
4. Add their head coach, if the owner does not teach every class.
5. Walk the owner through the dashboard queue once, slowly.
6. Watch them send the join link to one real student, on the call.

Step 6 is the whole session. A gym that leaves the call without one real student
joined will not send the link later.

---

## The written deal, per gym

Send this before the setup session, not after. It is the single highest-leverage
thing on this page, and it costs one email.

> **What you get:** matops free until **31 January 2027**. I set it up for you. You
> have my number, and I answer.
>
> **What I need back:**
> - Your real weekly schedule in matops, not a test one.
> - Your students actually booking, not just you clicking around.
> - Twenty minutes on a call each week for the first four weeks.
> - Permission for me to look at your gym's data when something breaks.
>
> **After 31 January** it will cost somewhere around €49 a month. If it is not
> worth that by then, tell me and we stop. No hard feelings, and I will export
> your data.

Three deliberate choices in that text:

- **A date, not "free for now".** From [business-model.md](business-model.md):
  without a date the pricing conversation never happens, because there is never a
  good week to raise it.
- **A price mentioned but not charged.** Naming €49 now means the number is never
  a surprise. It also tells you immediately if they flinch.
- **Explicit permission to read their data.** You will need it, and asking
  afterwards is worse.

Do **not** say "free forever" or "you'll be grandfathered in". Easy to say to a
friend, permanently expensive.

---

## What to tell them is missing, up front

Named in the brief, these are honest limitations. Discovered in week two, they
are broken promises.

- **No automatic reminders on the web.** matops ships no scheduler (ADR 46).
  Class reminders exist on the phone app, on the device (ADR 54). This is the
  first thing a gym owner asks about, so say it first.
- **Dues are manual bank transfer.** The student taps "I paid", the owner
  confirms by hand. No card charging (ADR 40; card payment is
  planned in [the automatic payments plan](2026-09-24-automatic-payments-final-plan.md), not started).
- **No hard capacity caps and no waitlists.** Over-capacity booking asks "book
  anyway?" and allows it.
- **Owner-only admin**, unless item 12 above is done.

---

## What to measure

**The primary number:** *weekly active academies*, meaning an academy with at
least one booking or attendance mark in the last seven days. Same number named in
[revenue-collection.md](revenue-collection.md).

**v7.6 built this, so it is no longer a spreadsheet.** `pnpm -F @matops/db report`
prints the weekly count from the `product_event` table, along with the funnel
(median days to a first schedule and a first student booking, setup completion,
second branch, two-branch weekly use, week-two booking) and the counter-signal
below. It counts only a student's own booking or an attendance mark, so an owner
booking their own training never shows as student use. The events carry no name,
email, phone number or amount.

**Per gym, weekly:**

| Signal | What it tells you |
|---|---|
| % of the week's classes with at least one booking | Whether students adopted it, or only the owner did |
| Students who booked in **two different weeks** | The only real retention signal at this size |
| Attendance rosters actually marked | Whether the owner uses it during class, or forgets |
| Days the owner opened the dashboard **without you asking** | The one that actually matters |

**The counter-signal:** the owner is active but no students are. That means matops
became more admin work for one person, which is the opposite of the product. The
report names the weeks this happened, per gym, from `staff_action` events with no
student event beside them.

### Kill or continue, at the end of week 4

- **Continue** if at least one gym has students booking in three consecutive
  weeks without you prompting.
- **Fix and retry** if owners are active but students are not. The problem is the
  join funnel, not the product.
- **Stop and rethink** if after three weeks no gym marks attendance without a
  reminder from you. That is a real finding about the job matops is hired to do,
  not a failure of the pilot.

Decide the criteria now, while it costs nothing to be honest about them.

---

## Stage 2 — Mobile, after the web pilot is running

Start this **only once web is live and stable at one gym.** Debugging two
untested surfaces at remote gyms simultaneously is how a pilot dies.

### Prerequisites, none of which exist yet

- [ ] Apple Developer account, $99/year. Enrolment takes days, so **start this
      application on day one** even though it is not needed until week 4.
- [ ] An EAS project id configured. Push token registration needs it.
- [ ] A dev-client rebuild, because `expo-camera` landed after the last build.
- [ ] A physical iPhone and a physical Android in your hands.

### Sequence

| Week | Step |
|---|---|
| **3-4** | **Android first.** EAS internal distribution, $0, no store review, install by link. Run `mobile-device-test.md` yourself before any gym sees it |
| **4-5** | Give the Android build to **one** pilot gym's students, not all of them |
| **5-6** | **iOS via TestFlight.** Internal testers need no review; external testers need roughly a day |

### Before any gym touches a mobile build

`mobile-device-test.md` is the gate. Its S8 scan section and the "waves that have
never been on a device" section are the parts that matter, because they cover
v1.8 through v3.0, none of which has run on real hardware.

Two known issues to settle before mobile reaches a student:

- The **Google browser-to-app hand-off still does not land**
  (`mobile-google-login-handoff.md`). Magic link works. Either fix it, or hide
  Google sign-in in the app build.
- Push needs the EAS project id, so **no push at all** until that is configured.

---

## The full calendar

| When | What |
|---|---|
| **Mon 24 Aug** | Vercel Pro. Rotate `AUTH_SECRET`. Prove Resend in production. **Start the Apple Developer application** |
| **Mon-Fri 24-28 Aug** | Blocker sprint, items 1-9. Then feedback link, first-run checklist, and the instructor-admin decision |
| **Sat-Sun 29-30 Aug** | Your own dry run on the live deployment, end to end |
| **Mon 31 Aug** | Send the written deal to 2-3 gyms |
| **Tue-Thu 1-3 Sep** | One 45-minute setup session per gym |
| **Fri 5 Sep** | **Target: a real student books a real class** |
| **Weeks of 8, 15, 22 Sep** | Run it. Sentry daily, one call per gym weekly |
| **Weeks of 8-15 Sep** | Android build, tested by you, then one gym |
| **Weeks of 22-29 Sep** | iOS TestFlight |
| **End Sep / early Oct** | Kill-or-continue call, using the criteria above |
| **Nov / Dec** | Reopen [business-model.md](business-model.md), two months before the 31 January end date |

---

## How this pilot fails

1. **You run it blind.** No Sentry, so bugs at remote gyms are invisible. This is
   why item 2 is not negotiable.
2. **You onboard the wrong person.** The owner signs up, but the head coach runs
   the desk and cannot approve anyone. See item 12.
3. **The calendar empties at week 6** and a gym quietly stops using matops without
   telling you why. See item 5.
4. **Friends do not complain, they just stop.** They will nod on the call and go
   back to WhatsApp. Ask specific questions: "who did you approve this week", not
   "how's it going".
5. **Five gyms instead of three.** Support load rises, call quality drops, and you
   learn less from more gyms than you would from two.
6. **The mobile app gets rushed in for week one** and burns a pilot slot on a bug
   the device checklist would have caught.
7. **The free period drifts** with no end date, and eighteen months later there is
   still no pricing conversation.

## What this pilot is actually testing

Not "does the software work". You know it does. The pilot tests one question:

> **Does a gym owner open matops on a Tuesday morning without anyone asking them
> to?**

Everything above exists to make that question answerable. If the answer is yes at
one gym, matops is a product. If it is no at all three, the schedule grid and
the rank ladders do not matter yet, and the parked plans
stay parked.
