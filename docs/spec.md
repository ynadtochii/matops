# matops — MVP Product Spec (v1)

_First-iteration product surface for **matops** (the from-scratch rebuild of the old app **MAT**). Scope = "standard class management". Two clients: **student mobile** (Expo) + **owner web** (Next.js). This is the product half of the rebuild; the build sits on [architecture.md](./architecture.md)._

**🔒 PRODUCT SCOPE LOCKED (session 12).** Folds in the critical-review decisions (tickets 12–21), the low-friction student wave (22–27), the full product pressure-test (soft capacity, uniform approval, required email, schedule privacy, first-visitor drop-in), and the settled edge rules (§4). This is the v1 product surface; capacity hygiene (hard caps, waitlists, no-shows, cancel cut-offs) is the next iteration.

---

## 1. What v1 is

A grappling academy's **schedule + attendance**, done flawlessly, for two audiences:

- **Students** book classes from their phone.
- **Owners/instructors** run the schedule, member list, and attendance from the web.

Nothing else. The bet (crowded niche) is that _simple + fast_ beats _feature-rich_. Every screen below earns its place in one of the two core loops.

### The two core loops

- **Student loop — "train":** open app → see this week's classes → **book my next class in ≤3 taps** → show up. That speed is the product.
- **Owner loop — "run the week":** set the recurring schedule once → approve new members → see who's coming → tap through attendance after class.

### The student-friction principle (the make-or-break)

The owner is the buyer, but the **student is the user**. The owner's data only exists if students actually use the app. So v1 is built to ask students for **almost nothing**:

- **Let them in first, confirm them later.** Anyone (student or coach) can sign up, see the schedule, and book **before** the owner approves them. Until approval they are **view-only** — they can browse, book, and check in, but see no member names and get no tools. Approval assigns the real role.
- **Booking is never blocked; capacity is a guide.** Anyone can book any class. When a class passes its capacity it shows in **red** ("22/20 — may be busy") and asks you to confirm — the owner manages the room. _(Hard caps, priority for members, waitlists, no-show and cancel cut-offs are the next iteration.)_
- **Showing up is one tap.** A **QR code inside the gym** marks attendance (and books first if needed). Booking is optional intent; the QR is the real "I'm here".
- **No app? No problem.** The same gym QR opens a **short web form** for **first-time visitors** — captured as a lead the owner can follow up (and send an app link to). It's a first touch, not a repeat path.

### Roles

| Role                           | Client       | Can do                                                                                                                                                                                                                   |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Owner**                      | Web          | Everything: academy settings, invites, member list + **approve members and coaches**, all templates/classes, attendance                                                                                                  |
| **Instructor**                 | Web          | _(after owner approval)_ Run the **whole schedule**, **take attendance**, and see **their own Coaches card**; _not_ the Members screen, the Referrals ledger, Payments controls, academy settings, invites, or approvals |
| **Pending (student or coach)** | Mobile / Web | **View-only:** browse the schedule, book/cancel own, check in. **No** member names, no tools — until the owner approves                                                                                                  |
| **Student**                    | Mobile       | _(after approval)_ View schedule, **book/cancel**, see who's in a class, own classes/profile                                                                                                                             |

_(Everyone joins **pending/view-only**; the invite link carries the intended role; **owner approval** grants it — this is uniform for students and coaches, so a forwarded coach link can't hand out real access. Roles are **per membership**: one login can be an owner at one gym and a student at another. The **client is the lens** — web shows gyms you run, mobile shows gyms you train at. Multi-academy is native; v1 shows one active academy with a **switcher** if you belong to more than one.)_

---

## 2. Student mobile app (Expo)

### S1 · Sign in / Sign up _(as light as possible)_

- **Social login** or **email + magic link** (passwordless — no password to invent). One tap where possible. Built: **Continue with Google** on **web** alongside the magic link (ADR 35); Google is shown only when the server has OAuth creds set. **Mobile is magic-link only for now** — the Google button is deferred (the iOS browser→app session return doesn't land; ADR 35, `docs/mobile-google-login-handoff.md`).
- **Fields:** first name, second name, phone, **email (required)**. Email is the sign-in identity (the magic link goes there), so it's not optional for members. Nothing else.
- Reached before joining (S2). On mobile v1 the student picks the academy by its ID; sign-in comes first, then the join.

### S2 · Join an academy _(the onboarding spine)_

- **Mobile v1 (docs/issues/32):** the owner shares the academy's **ID — a plain 6-digit number**. The student **types the ID** in the app → we find the academy → _"Join **{Academy}**"_ → confirm + minimal profile → a **pending** membership. No link, no deep link, no list to scroll.
  - The confirm step shows the gym's **address** when it has one _(v2.9, ADR 68)_, so a mistyped digit that finds a real gym is caught before joining.
  - Edge: no academy for that ID → clear "No gym found with that ID — check the number with your gym."
- **Web + a later mobile iteration:** opens via an **invite link** (deep link `matops://join/<code>` or an https universal link) — the academy is preselected. On mobile this returns after v1 (docs/issues/31); the invite links stay live for the web (per-role, incl. instructors).
- **Web join is one form** _(v2.2, ADR 57; amended by ADR 59):_ a signed-out visitor on an invite link fills **first name, last name, phone and email together**, then gets the magic link. Opening that link returns them to the same form with **every field already filled in**, and one press of **Join** finishes it. The profile travels in the link, so it survives the mail app opening a different browser. The link **prefills, it never joins on its own**: an invite URL is public and hand-craftable, so a link that both joined and wrote the profile could be sent to any signed-in person to rewrite their name and phone (ADR 59). A **Google** sign-in skips the email step and is asked for name and phone on return.
- **No waiting wall.** The student lands straight on the schedule (S4) and can **book right away** (provisionally). Approval happens in the background.
- _(Joining a **second** academy later: enter another gym's ID while signed in → another pending membership → appears in the S7 switcher.)_

### S3 · Pending banner _(not a blocker)_

No blank waiting screen. A **slim banner** on the schedule: "Pending approval — you can browse and book; your gym will confirm you soon." Bookings made now are **provisional** (§4). When the owner approves, the banner clears and a **push** ("You're in at {Academy}") lands.

**Suspended member (§4):** a suspended member has **no** enrolled access — the server rejects the schedule / dues / stats reads. Instead of a scary "couldn't load" error, the student sees a **calm notice** ("Your membership is paused — contact your gym to restore your access") on Schedule and My classes; Profile stays reachable (edit details, switch academy, sign out) with the same notice in place of the rank + dues sections. An owner reverses this with **Restore** (O4).

### S4 · Schedule _(home — the core screen)_

**On the web too** _(v2.2, ADR 57; brought to parity in v3.2, ADR 73):_ a student signed in on the web gets this same week — grouped by day, Today first, with **Book** and **Cancel** on the row and the same "looks full, book anyway?" confirm. It reads `class.mine` and the `booking` router, the same calls the app makes, so the two clients cannot drift apart. Since **v3.2** the web student has the app's own tabs minus Scan — **Schedule** (`/`) · **My classes** (`/training`, S6) · **Dues** (`/payments`, S9) · **Profile** (`/profile`, S7 + S12) — in the same shell the owner uses (sidebar on desktop, bottom tabs on a phone), plus the **class detail** screen (`/class/<id>`, S5) and the **overdue strip** (S11). Only the in-app QR scan (S8) and push / class reminders stay app-only. A **suspended** member sees the calm notice here as well, and the query is not sent.

- This week's classes, grouped by day (Today first). Each row: **title · time · instructor · "N spots left"**. The week window rolls with the day, so an app left open past midnight still opens on today.
- **Inline book** _(v1.8, slice 1):_ each upcoming, bookable row has a compact **Book** control — booking is **one tap from the list** (plus the "looks full — book anyway?" confirm when over capacity). A booked row shows the **Booked** pill; cancelled / past rows show no control. _(This replaced the old v1.3 top "Today / next" card, which moved to S6 so the two class tabs don't duplicate it — v1.8 slice 2.)_
- Optional discipline filter chip row (BJJ / No-Gi / …) — only if the academy uses disciplines.
- Tap a class → **S5** (full info + cancel; no longer required to book).
- Empty state: "No classes scheduled this week."

### S5 · Class detail + book/cancel

**On the web too** _(v3.2, ADR 73):_ `/class/<id>`, reached by tapping any row on the schedule or on My classes. Same reads (`class.get` + `class.attendees`), same capacity label, same soft-capacity confirm, same who's-in privacy rule. The action sits under the details rather than in a sticky bar, because a browser page scrolls to it. A cancelled class says booking is closed and a class that already started says so, so the screen is never a dead end with no action and no reason.

- Title, discipline, day/time, duration, instructor, capacity ("8 / 12").
- **You can book up to a week ahead** _(v3.9, ADR 79)._ Classes exist six months out so the owner can plan and print a poster, but a booking further ahead than seven days is noise: the gym's plans change first. Both schedules only ever show the rolling seven-day week, so this changes nothing a student can see — it closes the one way past it, a direct link to `/class/<id>` for a class further out, which now answers "You can book up to a week ahead".
- **Booking is never blocked.** Primary action, in a **sticky bottom bar** (thumb zone; v1.8 slice 6) while the details scroll above:
  - Not booked → **Book** (success **toast**, e.g. "Booked — Tue · 18:00"). Pending members can book too; theirs is tagged **"pending approval"**.
  - When the class is at/over capacity → the count shows **red** ("**22/20 · may be busy**") and Book asks **"This class looks full — book anyway?"** → user decides; the owner manages the room.
  - Booked → **Cancel booking** (also toasts).
  - _Booking here is optional — the S4 schedule row books inline (v1.8). The shared `useBookClass` rule drives both surfaces._
- **Who's in the class:** an **approved member** sees **every booked member by name**, alphabetically, **pending ones included** (ADR [55](issues/55-attendee-names-include-pending.md) — a pending member trains on the same mat). **Drop-ins show only as a count** (e.g. "+3 others"), as does anyone with no name on file. A **pending viewer** sees only counts, no names, plus a line saying names show after approval. The viewer is never listed to themselves, so a class only they booked reads "Just you so far." _(Owner/coach see everyone by name for attendance.)_ _(Built: `class.attendees` + the pure `visibleAttendees`, v2.0 N.5.)_
- Cancelled class → shown read-only as **Cancelled**.

### S6 · My classes _(its own tab — v1.2 B.2; renamed **Training → My classes** in v1.8 slice 2)_

**On the web too** _(v3.2, ADR 73):_ `/training`, with the same next-class card, the same My Training stats, Upcoming with Cancel, and the full read-only Past list. Reads `booking.mine` + `stats.me` and splits them with the same pure `splitMyClasses` / `nextClass` the app calls, and labels the last class with the same `lastClassLabel`. A class the gym cancelled shows no Cancel control, matching S4.

- A **next-class card** at the top (the soonest upcoming booked class; provisional labelled "pending approval"). This is the **only** "next class" card in the app now — Schedule (S4) no longer duplicates it (v1.8 slice 2), so "all classes" (S4) vs "mine" (S6) is self-explaining.
- A **My Training** stats card (see S7 — total · this month · streak · favorite · days since last class).
- **Upcoming** classes (confirmed and provisional, clearly labelled; cancel from here too).
- **Past** (attended) — a light history; read-only.
- _(Reads `booking.mine`; the pure `splitMyClasses` / `nextClass` divide the list — ADR 39. Built in v1.2; was previously "folded into the schedule".)_

### S7 · Profile / account

**On the web** _(v2.8 for identity, ADR 67; v3.2 for the rest, ADR 73):_ `/profile` holds the same identity edit (name and phone; email read-only), the academy with its **address** and **Open in maps** link, **My rank** with the promotion timeline, and a link across to dues. Appearance and sign out are S12 on the app and live on this page on the web. The **academy switcher** is in the shell, not on this page, and now appears for a student in two gyms as well.

- Identity + membership only (v1.8 slice 5 moved app settings to **S12**). Name, phone, email, current academy — with the gym's **address** and an **Open in Maps** link under it when the owner has set one _(v2.9, ADR 68)_. The link opens the owner's pinned map when there is one, otherwise the phone's own map app on the address (`maps://` on iOS, `geo:` on Android) rather than the browser _(v3.1, ADR 71)_. **Name and phone are editable** (edit → save; email is read-only — it's the login identity + notification channel). _(v1.2 B.3.)_ Content **scrolls**; a **settings icon** in the app header opens Settings (S12) _(v3.7: the phone's app header, drawn with the same glyph the web sidebar uses)_.
- **My Training stats** (v1.2 B.1 — surfaced on the My classes tab, S6): total attended sessions · this month · week **streak** · favorite discipline + weekday · days since last class. Per-academy, from attendance already stored (ADR 39). Empty state until the first check-in.
- **My rank** (v1.4 G.3, ADR 41): your rank in each discipline (e.g. _BJJ · Blue · 2 stripes_) plus a short **promotion timeline** (when you were promoted). **Read-only** — only the gym sets rank. Empty until a coach sets it.
- **Membership dues** (S9) live here (quiet). Arriving from the S11 overdue strip scrolls to this section.
- **Academy switcher** — shown only if the student belongs to >1 academy; switching changes the active academy and all data follows.

### S8 · Check in (QR walk-in) _(redefined in v1.8 slice 4 — booking is the pre-commit; the owner marks attendance after class. In-app scanner added in v3.0, ADR 70.)_

- **No Check-in list** (removed v1.8). The only check-in path is the **gym QR walk-in** for a student who did **not** book.
- **The member path is the Scan tab** _(v3.0, ADR 70)_. Tap **Scan** → the phone's own scanner sheet opens → point it at the gym poster → the app **books + marks attended** for the class happening now → _"You're checked in ✓"_. Camera permission is asked on the first tap, not at launch; refused for good → the tab says so and offers system settings. A phone that cannot present the OS scanner (iOS 15, Android without Play Services) is told to use its camera app on the poster. Any other code (a wifi QR, the gym's own `/join` poster) **closes the scanner** and says what to scan instead — the sheet covers the screen, so a message left behind it is a message nobody reads.
- **The poster is unchanged:** it encodes the public **`https://…/checkin/<academyId>`** page, so a first-time, no-app visitor still lands on the **drop-in form** (§4), and **"Open the app to check in"** stays there as the deep-link fallback (`matops://checkin/<academyId>`) for anyone who scans with the camera app. The scanner accepts either form and refuses anything else, including the gym's `/join/<token>` invite poster.
- **The web has no scanner** _(v3.2, ADR 73)_. It does not need one: the poster's own URL is a web page, so a student who scans it with their phone's camera app lands on `/checkin/<academyId>` and checks in there. Only scanning from **inside** the app is app-only.
- Works **even if the class is full** (you're physically there); **already booked → attend, no double-book**; **pending member → allowed** (provisional). Edge messages, never a dead end: not signed in → sign in then complete; no class live → _"No class to check into right now."_; not a member → clear message (owner can still mark present, O5).

### S9 · Pay (dues + requisites) _(v1.3 — manual bank transfer; ADR 40)_

**On the web too** _(v3.2, ADR 73):_ `/payments` serves the owner screen (O7) to an owner and this one to everyone else, so a student who lands on the URL sees their own dues rather than a load error. Same amount, status, bank details, copyable reference and **I paid** claim. A **pending** member has no read on `payments.myDues`, so the tab is hidden and the page says dues appear after approval.

- **Approved members only.** The requisites card carries the gym's bank details, so a **pending** joiner does not see this section at all (it appears once the owner approves them). ADR 60.
- **What you owe, at a glance:** your plan, amount, and next-due date, with a status — **paid** / **due soon** / **overdue** (derived from the due date, ADR 40). Empty until the gym sets up your dues. _(When **overdue**, a global header (S11) also promotes it across the tab screens.)_
- **How to pay → requisites card:** the gym's bank details plus a **reference code** to put in the transfer note (copy buttons on each). You pay in your own bank app. _(No card on file, no in-app card payment in v1.3 — manual bank transfer only.)_
- **"I paid":** after you transfer, tap **I paid** (optionally attach a screenshot as proof). This raises a claim the owner confirms (O7); when they confirm, the status turns to paid and the next-due date rolls forward.
- One open claim per period (you can't double-claim); the reference code is what lets the owner match your transfer fast.

### S10 · Home-screen widget _(v1.3 — native, fast-follow; ADR 27 promoted)_

- The next class you'd book, on the **phone home screen** — one tap to book **without opening the app**. Mirrors the S6 next-class card.
- Native widget code (iOS WidgetKit / Android); ships as a fast-follow, last in the wave, off the payments critical path.

### S11 · Overdue warning header _(v1.8 slice 4 / ADR 45)_

**On the web too** _(v3.2, ADR 73):_ the same thin strip, in the shell under the pending banner, so it shows on every student screen and links to `/payments`. It matters more here than on the phone: the web has no push and no class reminders, so this strip is the only thing that can chase a payment.

- A **thin, persistent strip** at the top of the main tab screens (Schedule / My classes / Profile) shown **only** when the member's dues are **overdue** (status derived from `next_due_at`, ADR 40 — never stored). Copy is plain, non-shaming: _"Membership payment overdue — tap to pay."_
- **Non-dismissible while overdue**; it **self-clears** within one refetch after the owner confirms payment (status leaves `overdue`). A paid / due-soon member never sees it.
- **Tap → S7 Profile**, landing on the dues section (bank details + reference ready to copy). Thin by design — it never stacks as a heavy block beside the S3 pending banner.

### S12 · Settings _(v1.8 slice 5 / ADR 45 — split out of S7)_

**On the web** _(ADR 73):_ there is no separate settings screen. Appearance and sign out sit on `/profile` and in the shell footer, and there is no push toggle because the web registers no push token.

- A **pushed screen** reached via the ⚙ gear in the Profile header (not a tab — the tab bar is reserved for the four jobs in §S8). Holds **appearance** (light / dark / system), the **push notifications** on/off toggle (one switch covers reminders + cancellation alerts; off drops this device's token **and clears the scheduled local class reminders**, ADR [54](issues/54-local-class-reminders.md)), and **sign out**.

### S13 · Notifications _(v3.7, ADR 77 — web + phone)_

- **A feed of everything the gym has sent you**, newest first, one per academy. A cancelled class, a changed time, a payment reminder, a welcome, and the gym's own news all land here, whether or not the push arrived. This is the durable copy; push is the alert.
- **Unread rows carry a dot and the nav item carries a count.** Opening the screen marks the feed read, but the dots stay for that visit, so you still see what was new.
- **On a phone the feed has no tab.** A **bell in the app header** carries a red dot while anything is unread and opens the feed as a pushed screen. Same in the Expo app and on the web's mobile top bar. The tab bar stays on the four jobs (§S8), and the web's desktop sidebar keeps its Notifications item with the unread count. The bell is hidden until the membership is active, because the feed is members-only.
- **A row that points somewhere opens it** — a class notice opens the class, a dues notice opens your dues. **Gym news points nowhere**, because the row already holds the whole message: it is a card, not a link, on both clients.
- **On the phone only a class row opens.** The stored links are web routes, and `/payments` has no phone route (dues live on Profile, S9), so a row that does not point at a class is a card with no tap target rather than a dead end.
- **Not in this release:** replies, per-kind toggles, deleting a row, and anything older than the last 50.

**Every tab screen wears the same top bar** _(v3.7)_: the mark, the academy you are in, then the icons (the notification bell, plus the settings icon on Profile). It is the phone twin of the web shell's mobile header, on the card surface with a hairline under it, and the screen title sits below it in the content, exactly as the web does it. Appearance and sign out are not in the bar the way the web puts them there: on the phone they live in Settings (S12). Icons are the web shell's own glyphs redrawn for React Native, never emoji.

**Student v1 = 8 screens** (S1–S8). **v1.3 adds S9 (pay) + S10 (home widget); v1.8 adds S11 (overdue header) + S12 (settings), removes the in-app Check-in tab and redefines S8 as the QR walk-in (ADR 45); v3.0 gives S8 its own Scan tab with an in-app scanner (ADR 70), so the tabs are Schedule · My classes · Scan · Profile.** Core loop (S4 → booked) is now **one tap** from the schedule list; the two class tabs (all vs mine) are self-explaining. **v3.2 gives the web student the same set minus Scan (ADR 73)**, so S4-S7, S9, S11 and S12 all describe two clients now, not one.

---

## 3. Owner / instructor web app (Next.js)

**Owner onboarding is seamless too (A3).** Same low-friction sign-in (social or email + magic link, minimal fields). Schedule setup has quick tools so building a week isn't a chore: **duplicate a template**, **copy a day**, and a "typical week" starter. The owner should reach a working schedule + printable QR in minutes.

**Signing in lands you in your academy (ADR 49).** Creating a gym is rare, so it is **not** pushed at everyone on login — it's a separate **"Start a gym"** link on the sign-in page (→ `/start`), and "Start a gym" makes you the active owner at once, no waiting. On a normal sign-in the web routes you by what you belong to: **one** academy → it opens automatically; **several** → pick which one; **none** (a brand-new member) → **"Join your gym"** — type the academy's 6-digit code, add name + phone, and land **pending** as a student (same gate as an invite link).

### O1 · Dashboard _(the "run the week" home)_

- **Needs you**: an action queue of blockers, each linking to the screen that clears it. Every staff member sees **classes to mark** — a class that finished without anyone filling in the register (see below). Owners also see **payments to confirm** (pending "I paid" claims), **pending approvals**, **overdue members** (count, plus what they owe in total when a single currency is in play — two currencies are never added together), and **new drop-in leads** (the last 7 days only: a lead has no handled flag, so an all-time count could never reach zero and the queue would read as permanently dirty). An item appears only while its count is above zero. When every item is clear the queue collapses to one line saying nothing needs them — that empty state is the point of the block. The overdue card opens O4 with the **Overdue** filter already on (`/members?tab=members&filter=overdue`).
- **Classes to mark** _(staff)_: a class counts as unmarked once it has **ended**, is not cancelled, somebody had booked it (confirmed or provisional), and **not one** attendee was marked present or absent. Every number the gym reads later — visits, attendance rate, the drift bands below — is built on marks, so a forgotten class quietly corrupts all of them. Two deliberate exclusions: a class **nobody booked** is skipped, because an empty register cannot be marked and the item could never be cleared; a **partly marked** class is skipped, because leaving the no-shows unmarked is how coaches normally work. The look-back is **7 days**, shorter than the 14-day backfill window, so every class it reports is still markable. Today's classes that have ended and are still unmarked also carry an **Unmarked** tag in the Today list.
- **The day block:** the day's classes with booking counts and the coach's name — the caller's own are marked **You**. Each row carries the class's state: **Now** while it is running, **Unmarked** once it has ended with no register filled in, and a quieter title once it is done. **Clicking a row opens the class roster** — the same panel as O5 (mark present/absent, mark all present, add a walk-in), so attendance is taken without leaving the dashboard. Once **today's last class has ended** the block rolls forward and shows **Tomorrow** instead: a finished day is a log, not a plan, and anything still needing a mark is already in the queue above. A rest day with classes tomorrow rolls the same way.
- **Quick counts:** active members, classes this week. "Classes this week" counts from today forward, even though the read reaches back a week for the unmarked hunt.
- **Insights** (v1.2 C.1, trimmed in D.4, money added in D.5): a handful of numbers, each carrying the baseline that makes it mean something. **Confirmed this month** — owner-confirmed payment money for the academy calendar month, against last month, **owner-only** (instructors never see money). "Confirmed" is the only honest basis: dues are manual bank transfers (ADR 40), so money exists once the owner has matched a transfer to a claim, never before. Currencies are never added together — one figure per currency, each with its own previous month, and a currency billed in either month appears in both so a drop to zero is visible. A gym that has confirmed nothing sees no money figure rather than a zero. **Visits this week**, against **the same point** in last week — a part-week measured against a whole one reported a collapse every day until Saturday, so Wednesday noon is compared with last Wednesday noon. **New members this month**, against last month (both sides count only retained members, so the two are biased the same way and stay comparable) — owner-only. **Attendance rate** over 30 days, shown only when the gym marks absences, otherwise it would read a meaningless 100%; it carries no comparison, because a 30-day window has nothing to compare itself against. Below them, the **busiest classes** over the same 30 days, each drawn as a **bar of its share** of the top class and filled with its **discipline colour** (cool gi / warm no-gi / neutral open mat, ADR 53) — the length is the data, the hue says what kind of training. A comparison figure is coloured by direction (up `--success`, down `--warning`, never `--error`); the values themselves stay neutral, because the product does not know what a good one looks like. _"Visits this month" was dropped: a part-month count says less than the weekly pulse, and its own baseline (last month) falls outside the 30-day read this block is built on._ Each number states its own period, so the block no longer claims one window for all of them. From attendance already stored (ADR 39).
- **Who's drifting** (v1.2 C.1, owner-only): members who used to train here but have gone quiet — banded `cooling` / `at risk` / `dormant` by days since their last session — each linking to their member detail (O4) so the owner can reach out.
- Direct actions: _Take attendance_, _Add class_. _(Approving members moved into the "needs you" queue, where it only shows when someone is waiting.)_
- **First run** _(v3.6, ADR 76)_: an owner whose academy has no active members and no classes this week sees a **three-step checklist** where the queue would be, not "All clear." An empty gym has nothing to do, and the empty state reads as finished rather than not-started. The three steps link to where they happen: add your weekly classes, share your join link, print the QR poster. It disappears on its own once either count moves. Nobody is standing next to a new owner to say this out loud.
- **Pending approvals** are shown to **instructors** too _(v3.6, ADR 76)_, since they can clear that queue now (O4). The rest of the owner queue (payments, coach requests, overdue, leads) stays owner-only.

### O2 · Schedule (classes)

- **Week calendar** of concrete classes, each showing **N/Capacity** booked. On a wide screen this is a **timetable grid** (ADR 53): Monday to Saturday across, hours down, each class placed at its real time, with the coach's name on the block. A colored left rail splits the board at a glance (gi teal, no-gi amber, open mat dashed and railless), a violet line marks the current time, and runs of empty hours collapse into one "no classes" band. On a phone the same week stays a day-by-day list.
- **Click a class** (grid block or phone card) to open its **detail modal**: who is on it and the same attendance controls as O5 — mark present/absent, mark all present, add walk-ins. It is the O5 roster panel, reused. A class further out than tomorrow, or older than the 14-day backfill window, shows a read-only attendee list (the server refuses to mark there).
- Per-class actions: **cancel** (sends booked students a **push + email** — see §4), edit capacity/instructor, add a **one-off class**.
- Jump to **O3 templates** for the recurring engine.
- New/edited schedules **appear immediately** (classes are materialized on save; a daily job only extends the calendar forward).
- Empty state: "Create your first class."

### O3 · Recurring templates

- List of templates; **create/edit**: title, discipline, **days of week**, start time, duration, capacity, instructor, status (active/paused).
- **Time zone is not asked for** _(v2.9, ADR 68):_ a new template takes the **academy time zone** (O6); an existing one keeps the zone it was created with, so changing the academy setting never cancels a class someone already booked. The form shows the zone in force, and offers a one-click move when it disagrees with the academy's.
- Explains materialization plainly ("runs every Mon/Wed at 6:00 PM"). Pausing stops future generation; existing classes stay. Deleting soft-deletes (existing bookings preserved).
- **Classes are generated six months ahead** _(v3.9, ADR 79)._ Saving a template fills that window at once, so a new or edited template shows up immediately and the calendar does not run out mid-term. Nothing runs on a schedule: the horizon is the owner's to fill.
- **Rebuild schedule** _(v3.9, ADR 79, owner only)._ Pausing or deleting a template stops new classes but leaves the ones it already made on the calendar. One button at the foot of the Templates tab throws the forward schedule away and regenerates it from the **active** templates alone, six months out. Before the owner confirms, it names the damage from a live count: "Removes 34 upcoming classes and 12 bookings." **Students lose those bookings and are not told.** What it never touches: **past classes and all attendance history** (a past class carries its attendance on the same row as its booking), **one-off classes** the owner added by hand (nothing would recreate them), and a class the owner **deliberately cancelled** at a time the templates still want (it stays cancelled). Per-instance edits are discarded, because "rebuild" means the templates win.
- **Export poster** _(ADR 54):_ one button turns the active templates into a landscape PNG the owner can post or print — the weekly board with times, class names, and coaches, and **no booking numbers**. Paused templates are left out. A preview shows first; **Download PNG** saves it. The footer carries the gym's **6-digit join code** and an "Updated <date>" stamp, so a member can tell whether the board is current. No dates on the board itself, so it stays true until the schedule changes.

### O4 · Members (people + leads)

- **Three tabs** — **Requests** (pending approvals, default, with a count badge when someone waits), **Members** (the active roster), and **Drop-in leads**. Approvals block a person from training, so they come first. Every tab is **addressable** (`?tab=requests` / `?tab=members` / `?tab=leads`), so each O1 queue item opens the tab that clears it; arriving from the "who's drifting" widget (`?member=`) opens on **Members**, so the deep link still lands on the person. The query string survives a reload.
- **Pending approvals** tab: approve / reject **students**. Someone invited as an **instructor** is approved on the **Coaches** screen instead (O10), so the two queues match the two decisions. Approving assigns the intended role and activates them. A pending person's bookings simply become normal bookings on approval.
- **Who can open this screen** _(v3.6, ADR 76)_: **owner and instructor**. In most gyms the head coach runs the desk, so an instructor can open the roster, **approve and decline** students, **set rank**, read and write staff notes, and see the pending count on their own dashboard. An instructor does **not** see the dues figures (the member's plan, price and payment status are blank for them), and does not get the invite links, the drop-in leads tab, the CSV export, suspend, restore, remove, or the role picker. Those stay with the owner. **A pending coach is the owner's decision**, approve and decline both: a coach who could approve one would be minting colleagues, which is the same reason the role picker is owner-only. The server refuses it, not just the screen.
- **Search** _(v3.2)_: the **Members** tab has a search box above the roster. Typing filters the list by **name, email or phone** as you type, and it stacks with the **Overdue** filter. It runs on the list already loaded in the browser, so there is no extra request and no page reload. An empty result says so and suggests trying part of a name.
- **Export CSV** _(v3.4)_: the **Members** tab has an **Export CSV** button next to the Overdue chip. It downloads the roster as a spreadsheet file: name, email, phone, role, status, joined date, visit count, plan, dues status and next due date. It exports **what is on screen**, so the search box and the Overdue filter narrow the file the same way they narrow the list. The file is built in the browser from the list already loaded, so there is no extra request and nothing new leaves the server. A member's name that starts with `=`, `+`, `-` or `@` is written with an apostrophe in front, so a spreadsheet reads it as text instead of running it as a formula. Owner-only, like the member list itself.
- **Active members** list → **member detail** (v1.2 C.2): a tabbed panel — **Overview** (role, contact, attendance stats, drift band), **Attendance** (the member's full present-session history, paginated), **Rank** (v1.4 G.2), and **Notes** (v1.4 G.4) — plus remove/suspend — and, on an already-suspended member, a **Restore** action (`membership.restore`) that reverses the suspend and makes them active again (a suspend was never a dead end). Opening a member from the O1 "who's drifting" widget deep-links straight to their detail. _(Activity/audit tab deferred — needs the audit log.)_ _(Making/stepping-down **owners** lives in the **Staff** section of **Coaches** — ADR 50, moved there by ADR 63; the member list no longer has a "Make owner" button.)_
  - **Role:** Overview carries a **role picker** (student ↔ instructor) on any active non-owner member, so a coach who already joined as a student is fixed here instead of being re-invited. An **owner's** role is not editable here (Coaches → Staff owns that, §4 never-ownerless).
  - **Rank (v1.4 G.2, ADR 41):** the coach sets/changes the member's rank **per discipline** (e.g. _BJJ · Blue · 2 stripes_, _Judo · Green_), picking from the **seeded** rank systems (BJJ belts + stripes, Judo belts). Belt + stripes are validated against the system. **Rank only goes up** — a belt or stripe can be **bumped, never lowered**; to fix a mistake the coach **clears** the rank (removes it, keeps the history) and sets it fresh. Changing rank records a **promotion history** (from → to · date · who) shown below. **No automation, no progress bar** — the coach decides. Disciplines with no belt ladder (boxing, MMA) have no rank control.
  - **Notes (v1.4 G.4, ADR 41):** **staff-private** coaching notes on the member (injuries, goals, readiness). Visible to **all staff at this academy**, timestamped + authored; **never** shown to the member.
- **Drop-in leads** section: the **venue check-in QR poster** (print it for the gym door) sits at the top of the tab, then the **first-time visitors** who checked in via that QR without an account (name, phone, email, which class, consent flag). Kept for **follow-up** — the owner can send them an **app invite link (deep-linked to this gym)** to convert them into a member. Repeat visitors are nudged to register, so the form stays a first touch.
- **Academy ID:** a plain **6-digit number** shown to copy + share. Members enter it — in the mobile app (S2, docs/issues/32) or on the **web** sign-in gate ("Join your gym", ADR 49) — to find and join the gym. Joining by ID lands **pending/view-only** as a student, same as an invite link.
- **Invite links:** live on the screen that uses them (ADR 63) — the **student** link on **Members**, above the tabs, under "How students join"; the **instructor** link on **Coaches**, in the **Staff** section. Either way the joiner lands **pending/view-only** until the owner approves — so a forwarded link never grants access on its own. One active link per role. Opening a link while **still pending** replaces the intended role, so the **newest link wins** (a student who then opens the instructor link is approved as an instructor). Opening one while **already active** changes nothing and says so, because an approved member's role is the owner's call, made in the member detail.
- **Show QR** _(v2.2):_ every invite link (student **and** instructor) can be shown as a **QR code**, because the moment a student joins is almost always face to face at the gym. The owner holds up their phone, the joiner scans it with the phone camera and lands on the join form — no typing, no copy-paste, no spelling an email out loud. The same card prints, so a gym can put the student join code on the wall next to the check-in poster.
- **Venue check-in QR:** one static poster per gym (it covers both app check-in and the drop-in form), viewable and printable from the **Drop-in leads** tab — the tab it fills.

### O5 · Attendance

- Pick a class (today / recent past, ≤14-day backfill window) → see everyone present: **booked members** (confirmed + provisional), **self check-ins** (via QR), and **drop-ins** (from the public form).
- Mark **present / absent** with one segmented control per row. A filled **green** dot means present, a filled **red** dot means absent, **two empty rings** mean nobody has marked that person yet. The header counts carry the same three dots, so the tally and the rows read as one thing. Clicking the mark that is already on clears it back to unmarked. Self check-ins arrive already marked present — the owner just confirms.
- **Add someone who isn't listed** — one place, two cases:
  - **A member who didn't book:** search the academy's active members (anyone not already on this class), tick them, mark them present. The search matters once a gym passes a screenful of members.
  - **A visitor who isn't a member:** first name and phone (last name optional). This writes the **same drop-in lead** the public QR form writes, attached to this class, so the person appears on the roster and in the owner's leads for follow-up. Deduped by phone: a returning visitor bumps their visit count instead of creating a second lead. Staff **cannot** give contact consent on someone else's behalf, so a staff-recorded visitor starts with **no consent** — and recording them never clears a consent they gave earlier themselves.
- **Mark all present** _(v1.3, F.2):_ one tap marks everyone who booked as present; the owner then removes the few no-shows — faster than adding one by one. Respects the 14-day backfill window.
- _(This is the payoff of QR check-in: most attendance is already filled in before the owner touches it.)_

### O6 · Settings

- **Academy name** — the owner can **rename** it: a mutable label, _not_ unique-constrained. Identity is the **Academy code** — a unique, permanent 6-digit number shown read-only (students type it to join; it never changes) — plus the internal org id. **Owner-only.**
- **Time zone** _(v2.9, ADR 68):_ the academy runs on one IANA zone, picked from a list so a typo cannot be stored. Every class time, week boundary, and statistic is drawn in it. A **new** class template inherits it; templates that already exist keep the zone they were created with, because re-timing them would cancel classes students have booked. Settings names any template zone that disagrees, and the template form offers a one-click move. _(Disciplines toggle: later.)_
- **Address** _(v2.9, ADR 68):_ free text, up to 200 characters, with an **Open in Maps** link. Students see it on the mobile Profile tab and on the join confirm step, so nobody joins the wrong gym after mistyping a digit.
- **Map link** _(v3.1, ADR 71):_ an **optional** share link from Google Maps, Apple Maps, OpenStreetMap, or Waze, pasted next to the address. When it is set, the student's tap opens that exact pin; when it is not, the tap searches the address text as before. It exists for the gyms an address string cannot describe — a unit in a mall, a basement, a building with no number. Only those four hosts are accepted, because the value is rendered as a tappable link for every member. The field is disabled until an address is typed: students tap the **address text**, so a pin with nothing to read shows up nowhere. While editing, the card shows a **Check the pin ↗** link that opens exactly what the student's tap will open — the only honest way to validate an address without a geocoder.
- **Delete the academy** _(v2.9, ADR 68):_ owner-only, and the owner must type **`delete <academy name>`** to confirm — the phrase names the gym so it cannot be done to the wrong one by habit. It is a **soft** delete: every member loses the academy at once (each lands back on the post-login gate) and its 6-digit code is never reissued to another gym, but the data survives, so a mistaken delete is reversible in the database. No restore screen, no export, no hard purge in v1.
- **Everything else moved out** _(ADR 63):_ each control now sits on the screen that uses it — **Staff** + the **instructor invite link** on **Coaches** (O10), the **student invite link** and the **venue check-in QR poster** on **Members** (O4), the **bank details** on **Payments** (O7). The rules did not change, only where they are.

### O7 · Payments _(v1.3 — manual bank transfer; ADR 40)_

- **Four tabs:** the screen splits into **To confirm** (pending "I paid" claims, with a count badge), **Member dues** (each member's plan + next-due date, grouped by **Overdue / Due soon / Paid / No plan set**), **Plans** (the academy's membership plans), and **Bank details** (the gym's bank details, free text, which feed the student's requisites card S9 — ADR 40, moved here from Settings by ADR 63). Same data and actions as before — one job per tab instead of one long page.
- **Edit a plan:** a plan's name, price, and currency can be changed after it is created (`payments.updatePlan`). Members on that plan show the new name and price immediately (their dues read the plan live); payment claims already confirmed keep the amount they were confirmed at. Deleting stays a soft-delete.
- **Membership plan + dues:** the owner sets a plan (name, price, currency, cycle) and each member's next-due date. The date defaults to the **1st of next month** — billing is anchored to the start of the month for everyone, so the day a member joins never changes when their dues fall due. The owner can still pick any date. No card processor, no auto-charge — this is manual reconciliation. **Editing the date never changes the plan:** the form holds the member's actual plan id, and a member sitting on an **archived** plan keeps it (shown as "archived" in the picker) so a date-only edit cannot silently move them onto a different price (ADR 59).
- **Who paid / who's overdue:** the O4 member list shows a **status dot** per member — **paid** / **due soon** / **overdue** (derived from the due date, ADR 40) — with an **Overdue** filter. Member detail shows next-due + last confirmed payment.
- **Confirm claims:** a "claims to confirm" list of student **"I paid"** submissions (S9). One tap to **confirm** (rolls the member's next-due date forward by the cycle) or **reject**. The student's reference code matches the bank-transfer note.
- **Payment reminders:** push + email, **one per member per billing period** — sent when the member is within 3 days of the due date, or once they are overdue. A member who stays overdue is not messaged again until the next period. Sent by a **daily** sweep (`/api/cron/remind`), scheduled from this repo's GitHub Actions rather than by the host (ADR [75](issues/75-daily-cron-on-github-actions.md)). This is the only automatic message a student gets without a person acting.

### O8 · Install as an app (PWA) _(v1.5 — owner on the mat; ADR 42)_

- The owner/instructor web app is an **installable PWA**: add it to the iOS / Android home screen and it opens **standalone** (no browser chrome), with the matops icon + brand splash. No app store, no separate binary — the same web app earns its keep on the phone.
- It exists for the owner's **on-the-mat, one-handed, five-second** jobs: take attendance, cancel / edit a class, **share** the invite link + venue QR through the phone's native share sheet, and approve a pending join — the same screens, tuned for thumb reach at phone size.
- **Cut on mobile (desk-first / the deferred-native tail):** the O1 dashboard analytics reflow, editing payments / plans / settings, and **native push + offline** — dues + class notices ride the existing email / reminder path (§4). Design intent, not a port of the desktop layout.
- **Students install it too** _(v2.2, ADR 57):_ the manifest scope is the whole site, so the student week at `/` has always been installable — nothing told a student so. The student screen now carries a quiet **"Keep this on your home screen"** card at the bottom: an **Install** button where the browser offers one (Android / Chromium), and the **Share → Add to Home Screen** wording on iOS, where no browser prompt exists. It disappears once the app is running standalone, and it is **not** shown to a suspended member. It names installing as the best experience rather than pointing at an app store, because **there is no store listing yet** — the iOS build is blocked on an Apple developer account and Android has never been submitted. A dead "Download the app" button would cost more trust than it buys. When a listing exists, this card is where the link goes.

### O9 · Referrals _(internal attribution; ADR 52, layout ADR 56, owner-only ADR 69)_

- **Owner-only, referrer-first (ADR 56, narrowed by ADR 69):** the screen lists the members who brought students in, ranked by how many, each with their students and the owner-confirmed revenue those students paid this academy-calendar month and lifetime. Students nobody is credited for sit in a second **"Nobody credited yet"** section. Membership state (pending / active / suspended; removed hidden by default) shows on each person as a dot and a word. It exposes **no contact details, plan, dues, or payment-confirmation controls** — those are O4 and O7.
- **One permanent initial assignment, recorded in one dialog:** **"Record a referral"** asks two questions — which student, and who brought them in — and says above the save button that only an owner can change it later. Clicking a student with nobody credited opens the same dialog with that student filled in. Any retained member of this academy may be the referrer — student, instructor, owner, suspended, or removed. A student cannot refer themselves and has at most one current referrer.
- **Owner correction + audit:** the owner can replace or clear an existing attribution — they click the student's chip on a referrer's card and get the same dialog, with **"Remove the credit"** as an option and the audit history behind a link. Clearing leaves a locked, auditable unassigned state; only the owner correction flow may assign it again. Every assignment, correction, and clear records old/new referrer, actor, and time. Corrections move all historical reporting to the current referrer; the old attribution remains only in audit history.
- **Reporting:** one sentence at the top says how many members brought how many students in, and what those students have paid this month and in total. Two controls only — a search that finds a person by name (matching a referrer or any of their students) and **show removed students**, which the counts and totals follow. Revenue includes confirmed claims recorded before attribution and stays grouped by currency — incompatible currencies are never added together.
- **Tracking only:** no commission, referral discount, balance, payout, referral code/link, export, or student-visible referral UI in this release.

### O10 · Coaches _(workload and coverage; v2.5, ADR 62)_

- **Who taught it is now recorded on purpose.** Every recurring template and one-off class has a **coach picker**, and every class roster (the O5 attendance screen and the O2 class detail) has a **change the coach** control for the night somebody covers. Before v2.5 the field silently held whoever created the template, so the figures below only describe classes created or corrected since.
- **Any staff member may set the coach on a class that has not started. Only an owner may change one that already happened**, because that rewrites reported history. Correcting a finished class **notifies nobody** — a student cannot act on a class that is over.
- **Credit follows the class.** A class counts for whoever its coach is right now, with no separate confirmation step. So reassigning a past class moves that class's figures to the new coach, the same way an O9 referral correction moves reporting. The screen says so.
- **What a card shows,** over a window of this month, last month, or the last 90 days: **classes led**, **time on the mat**, **students taught**, **average headcount**, and **how much of it got marked**. Cancellations show when there are any. Expanding a card gives which classes, by weekday, by week, and the list of classes led with each one's headcount or a "not marked" tag.
- **Averages cover marked classes only,** and the card says in words when some are unmarked. A gym that forgets the register would otherwise read a missing mark as a weak coach. Classes led and time on the mat are always true, so the card leads with them.
- **Never a leaderboard.** Cards are ordered by name and are never sorted by headcount: a 07:00 class fills less than a 19:00 one whoever teaches it, so ranking coaches that way measures the timeslot. **An owner sees every coach; an instructor sees only their own card.**
- **Coach requests land here, not in O4.** Someone who opens the **instructor** invite link waits at the top of this screen (owner-only), with **Approve** / **Decline**: approving grants the schedule and attendance tools, which is a staffing call. The Members requests tab stays the **student** queue, and the O1 queue carries the two counts separately ("Pending approvals" → Members, "Coach requests" → Coaches).
- **The staff list lives at the bottom of this screen** _(ADR 50, moved by ADR 63):_ every active owner and instructor, the **instructor invite link** to add one, and the quiet per-person **⋯ menu** to make a co-owner or step an owner down (the last active owner can't be stepped down, §4). Owner-only — an instructor sees only their own card and no staff list.
- **A coach who leaves keeps their row,** marked "no longer staff", so the per-coach numbers still add up to the gym's.
- **Not in this release:** pay of any kind (hourly rate, amount owed, payroll periods), more than one coach per class, per-coach retention, export, and any student-visible view of this.

### O11 · Profile _(the person, not the gym; v2.8, ADR 67)_

- **Settings is the academy; Profile is you.** Every signed-in person on the web reaches **Profile** from the sidebar footer — their avatar, name and role, which is where a web app puts the account. It is a route with **no nav item**, like O5 Attendance.
- **Your details:** name and phone are editable, email is read-only because it is the sign-in identity. Same fields, same rules and the same `account.updateProfile` procedure the mobile Profile (S7) has always used, so a coach who edits their name on the phone sees it on the web and the other way round.
- **In this academy:** the active academy's name, the caller's role there (or "pending approval"), and the month they joined. Read-only — nobody changes their own role here. When several academies are on the switcher this reflects the active one.
- **Appearance and sign out** live here too, next to the account they belong to. Both stay in the sidebar as well: the theme toggle and sign out are one click from anywhere and are not worth a detour.
- **Something broken?** _(v3.6, ADR 76)_ A feedback link sits in the sidebar footer and on Profile. It opens an email with the academy, the person's role and the screen they were on already filled in, so a report arrives with enough to act on. The pilot runs at gyms nobody from matops is standing in, and a coach who hits a bug and shrugs is a bug we never hear about.
- **Not in this release:** avatar upload, email change, password or passkey management, per-academy notification preferences, and any student-facing bio.

---

### O12 · Announcements _(gym news; v3.7, ADR 77)_

- **An owner or an instructor writes an update and picks who gets it:** everyone, students only, or coaches only. The button names the number it will reach ("Post to 34"), taken from the same rule that picks the recipients, so nobody posts blind.
- **It lands in every recipient's notification center and pushes to their phone.** _(v3.8: nothing the gym sends goes out by email. matops has no mail layouts worth sending, so the feed plus push is the whole delivery.)_
- **Only active members receive one.** A pending person has not been approved yet; a suspended or removed one has lost access while keeping their history.
- **The sender gets their own copy**, which is the proof it went out.
- **Every post keeps the name of the person who sent it.** The feed row shows it under the message, so a member knows who wrote it and the gym has a record. The name is stored as it read at the time of sending, so a later rename or a coach leaving does not rewrite history. System messages (class changes, dues reminders) carry no name.
- **The compose box sits on `/notifications`,** above the feed it writes into. Owners and instructors both get it; students do not.
- **Not in this release:** editing or deleting a post, scheduling one for later, drafts, attachments, and any "who read it" report.

**Owner web includes O1–O12.** **O11 Profile and O12's feed are for every role, students included** (the O12 compose box is staff only). Instructors see O1–O3, **O4** (the desk: approve, decline, rank and notes, but no dues figures, invites, leads, CSV, suspend, remove or role picker — v3.6, ADR 76), O5 and **O10** (their own card only; no O6 Settings, O7 Payments controls, or O9 Referrals) — the shell hides those nav items and the server procedure tiers guard them. _(v3.3, ADR 74:_ typing the URL of a page your role does not have no longer renders it. The shell says the page is not part of your account and offers the way home, rather than filling the screen with refused queries. The tiers are still the guard; this only decides what a person is offered.) O8 describes installability rather than a separate data screen. _(ADR 38 role split, extended by ADR 52, narrowed by ADR 69.)_

---

## 4. Cross-cutting rules

- **Uniform approval (students + coaches):** everyone joins via a link → **pending / view-only** (browse schedule, book, check in — no names, no tools) → owner approves → the intended role is granted (student features, or instructor schedule+attendance tools). A forwarded link never grants access by itself.
- **Capacity is a soft guide, not a gate:** booking is **never blocked**. A class shows "booked / capacity"; at/over capacity it turns **red** ("22/20 · may be busy") and asks the user to confirm. The owner manages the room. (Hard caps, priority, waitlists, no-shows, cancel cut-offs → next iteration.)
- **Privacy on the schedule:** only **approved** members see who's in a class (names) — a pending viewer sees counts alone, so a self-join never turns into a member directory. An approved viewer then sees **all booked members** by name, **pending ones included** (amended by ADR [55](issues/55-attendee-names-include-pending.md); it was approved-only). **Drop-ins stay a count** — they consented to the gym contacting them, not to being listed to students. Owner/coach see names for attendance.
- **Check-in (QR):** one static **gym QR**. App users → book+attend in a tap; marks present even if the class is "full". No-app **first-time visitors** → the drop-in form (below).
- **Drop-in / lead form (public web, first visit):** the same gym QR opens a short **public page** (no login): first name, second name, phone, email (optional), and a **consent checkbox** ("OK for the gym to contact me"). Saved as a **lead + attendance**, no capacity impact. The owner follows up with an app link. QR-inside-the-gym is the anti-spam.
- **Privacy page** _(v3.6, ADR 76)_: a public `/privacy` page, in plain English, names who is responsible for the data, says the academy controls its members' data while matops processes it, lists what is stored and why, names the companies that run parts of matops, and says how to ask for a copy or a deletion. Every form that collects a stranger's details links to it: the drop-in consent line and the join form. The link sits **outside** the consent checkbox's label, so tapping it never ticks the box.
- **Rate limits on the public surface** _(v3.6, ADR 76)_: the join QR goes on a wall, so the pages behind it have a brake. A drop-in form can be submitted 5 times per 10 minutes from one address, an academy or invite lookup 30 times a minute, and a magic-link sign-in email 5 times per 5 minutes. Over the limit the page says to wait a minute and try again. Sign-in email is the one that matters: it is a shared quota, so one flooder would break sign-in for every academy at once.
- **Notifications (v1 — push + the notification center, no full comms domain):** a thin helper sends. _(v3.8: no gym message is emailed. Email is sign-in only, until matops has mail layouts worth sending.)_
  - **Class cancelled** → **push** to every booked student.
  - **Class reminder** → push, ~2h before. On mobile this is a **local notification the phone schedules when the student books** and drops when they cancel (ADR [54](issues/54-local-class-reminders.md)), so it needs no scheduler. The server-side sweep behind `/api/cron/remind` stays built but **switched off** — ADR [75](issues/75-daily-cron-on-github-actions.md) schedules that route daily for dues only, and a daily tick would reach only the classes inside the 2h window. **A web-only student gets no class reminder**; the S11 overdue strip is what chases them.
  - **Membership dues** → push, one per billing period, due-soon or overdue (O7 above, ADR 75).
  - **Membership approved** → push ("You're in at {Academy}").
  - **Staff announcements** _(v3.7, O12)_ → the notification center + push.
  - **Every one of the above also lands in the notification center** _(v3.7, S13; ADR [77](issues/77-notification-center.md))_, written before the send, so a failed push never costs the member the message.
  - Delivered via Expo Push (mobile); Resend carries the sign-in magic link only. _No live in-app updates (WebSockets) in v1_ — screens stay fresh by light polling; the unread badge polls with the rest of the shell.
- **Time zones:** every academy has one; classes render in it. No per-user tz in v1.
- **Empty / error states** are first-class (crowded-niche UX bar): every list has a purposeful empty state; every mutation has an optimistic path + a human error toast.
- **Loading states** _(v3.9, ADR [80](issues/80-loading-states.md))_ are the third of the three, and the rule is that the placeholder looks like what follows it. On the **web**, a route draws the skeleton of its own screen from the moment you click it until the data lands, so nothing jumps into place. On the **phone** each screen draws its own shape the same way, from the week of classes to the dues card. Where there is no screen to imitate yet - the cold open, the academy gate, the magic link, an invite opening - the **basketweave mark weaves itself** instead, with a line saying what is happening ("Opening your academy"). A wait shorter than 180ms shows nothing at all. A spinner is left with one job: an action already in flight, like a button mid-submit. Reduced motion holds every placeholder still.
- **Offline:** not supported in v1 (documented non-goal); the app assumes connectivity, degrades to a clear "you're offline" state.
- **Freshness (mobile):** the student tab screens (Schedule / My classes / Profile) **pull to refresh**, and the app refetches stale reads when it comes back to the foreground. A student who reopens the app never acts on a spots-left count from hours ago.

### Edge rules (v1 defaults — the small cases, settled)

- **Editing a class:** change **time or instructor** → booked students are **notified** (push + the feed), **unless the class already happened** — correcting who taught a finished class is bookkeeping, and a student cannot act on it (ADR 62). **Cutting capacity** below current bookings is allowed (soft cap — just shows red).
- **Editing a template:** applies to **future, non-cancelled** instances only; past and cancelled classes are untouched. A **timing** change (days / start time / zone) **cancels** the future occurrences rather than deleting them, then re-materializes: an occurrence the new timing still covers comes back **scheduled with its bookings intact**, and one the new timing drops stays visible as a **cancelled** class. A booked student never loses a class silently (ADR 60).
- **Deleting a class / template:** soft-delete; existing bookings/attendance are preserved; a deleted (cancelled) class notifies its booked students.
- **No gym message goes out by email** _(v3.8)_: the notification center plus push is the whole delivery. matops has no mail layouts, and a plain-text notice from an unknown sender is how a domain gets marked as spam. Email carries the sign-in magic link and nothing else.
- **A pending person keeps attending:** the member list shows each pending member's **visit count** ("attended 3×") so the owner is nudged to approve them. No auto-approve.
- **Duplicate drop-ins:** leads are **grouped by phone** — one lead per person with a **visit count**, not a row per visit.
- **Sole owner:** an owner can **promote another member to owner** (co-owner) from the member list, so a gym is never left ownerless. Full ownership transfer / account deletion is deferred.
- **Removing / rejecting someone with history:** their **attendance and lead records are kept** (they did train); access is revoked. Re-joining later starts pending again.
- **Referral history survives removal:** a removed student is hidden from O9 by default but can be included for historical reporting; removed members remain eligible as referrers while their retained membership row exists.
- **QR scanned with no class on:** the app shows "No class right now"; the public form still captures the person as a **general visit lead** for that day.

---

## 5. Explicitly NOT in v1

Mirrors the map's Out-of-scope: **card payment processing / auto-subscription / billing** (_note: manual-transfer dues ARE in v1.3 — see below_), **referral commissions / discounts / payouts / automated codes**, **belts & rank progression** (_note: member rank IS in v1.4 — see below_), **curriculum & games library**, a **full comms domain** (in-app DMs, email newsletters — _note: gym announcements + transactional push ARE in v1, §4_), **live in-app updates / WebSockets**, **cross-academy aggregated views**, **session packs**, **multi-currency / i18n**, **super-admin UI**, **rich offline/sync**.

Clarifications from the friction wave:

- **Public _booking_ page** stays OUT — but a controlled per-gym **check-in / drop-in lead form** IS in v1 (§4).
- **Capacity hygiene → next iteration:** hard caps / blocking a full class, priority for registered members, **waitlists**, **no-show tracking or penalties**, and **cancellation cut-offs** are all deferred. v1 shows a soft red "may be busy" warning and lets the owner manage the room.

Scope additions (v1.3 "Frictionless & Pay"):

- **Payments → v1.3 (manual bank transfer only).** Membership dues, a **requisites card**, an owner-confirmed **"I paid"** claim, member list **paid / overdue** status, and dues **reminders** ARE in v1.3 (S9, O7, ADR 40). **Card processing / auto-subscription / Stripe stays OUT** — a candidate only after the manual flow proves demand.
- **Home widget** (today's classes + one-tap book/cancel) is scheduled as the **v1.3 fast-follow** (S10, R.2), right after the launch build — needs native widget code (ADR 27, promoted).

Scope additions (v1.4 "Rank & Notes"; ADR 41):

- **Member rank → v1.4.** Per-discipline ranks the **coach sets** (BJJ belts + stripes and Judo belts seeded; the model is general), a student-visible **promotion timeline** (O4, S7), and **staff-private notes** on a member (O4) ARE in v1.4. **Still OUT:** attendance→promotion **automation / progress prediction**, owner-defined **custom rank ladders**, **bulk** promotion, and a **student training journal** (submissions / rolls / competition log / session notes — a separate product, rejected not deferred).

Scope additions (v1.5 "Owner on the mat"; ADR 42):

- **Owner PWA → v1.5.** The owner/instructor web app becomes an **installable PWA** for on-the-mat jobs (O8). **A unified both-roles native app stays OUT** — the two clients keep their natural axis (**student = native / casual**, **owner = web / admin + now mobile**). A **separate** native owner app is revisited only on a native-only mat need (reliable push, offline attendance, a home widget) **and** the Apple-account / device-test blockers clearing. **Student web** also stays OUT (rejected — Kano _Indifferent_, no natural laptop moment; the shared router keeps it cheap to revisit).

The architecture leaves seams for the deferred items ([architecture.md](./architecture.md) §8).

---

## 6. Definition of done (v1)

A new academy can: owner signs up → creates a recurring schedule → prints the **gym QR** and shares the **invite link** → a student joins on their phone (magic link, minimal info), sees the schedule at once, and **books before approval** (provisional) → the owner approves → the student **checks in with one QR tap** at the gym → a **drop-in without the app** is captured via the QR web form → attendance is mostly filled in before the owner lifts a finger. Both loops work end to end, with low student friction and full owner data, on a portable, expandable foundation.
