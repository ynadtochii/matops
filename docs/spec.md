# matops: Product Spec

_The product behaviour of record for **matops**, the from-scratch rebuild of the old app **MAT**. Every rule has an ID. Two clients: the **Next.js web app** for owners, managers, instructors and students, and the **Expo student app**. The build sits on [architecture.md](./architecture.md). History lives in the ADRs ([map.md](map.md)) and [../CHANGELOG.md](../CHANGELOG.md)._

The first release is **one BJJ academy per gym** with **approval-only booking** ([ADR 142](issues/142-first-release-approval-only-booking.md)). The FR rules below state it. Where an older rule further down disagrees, the FR rules win.

---

## First release: approval-only booking (ADR 142)

- **FR1: Approval is admission.** A new academy starts with payment admission off. An approved, active student books with no plan, no payment claim and no payment standing. Pending, suspended, archived and removed students cannot book. The booking window, class state, capacity, cancellation and tenant checks stay. No control turns payment admission on: a later release or a direct database change sets `membership_enforced_at`, and the payment gate then applies with no other code change.
- **FR2: Payment screens follow the one flag.** The web shows payment only when the academy requires payment to book. With it off there is no Membership or Memberships menu item, no dues strip, no plan fields in import, no bulk assign and no membership tab on a student. `/entities/<id>/payments` and `/memberships` say plainly that payments are not in use.
- **FR3: Nobody books for a student.** A student books for themselves under FR1. Staff have no book-for action and no override of the booking window or the payment check.
- **FR4: The owner can cancel for a student.** An owner can cancel a named student's booking. The place goes back to the class. Cancelling twice does nothing the second time. Managers and instructors cannot. In the class roster, the owner sees "Cancel booking" on each booked student of a class that has not started (`booking.cancelFor`).
- **FR5: Small screens.** Each coach card on Coaches shows three numbers: classes led, needs review, cancelled. Settings has no booking window row and no phone country row: a student books up to 7 days ahead (the stored default), and the phone country is guessed from the time zone. Settings has no days-to-pay or deadline time zone rows; bank details show only while the academy requires payment.
- **FR6: One academy, one set of screens.** The owner's sidebar is Dashboard, Schedule, Students, Coaches and Settings, plus Memberships only while payment is on. **Students** keeps its tabs and member detail, and adds Import students and Export data for the owner or a manager. There is no Add student form: a student registers through the join link or join code (2026-09-28). **Settings** holds the academy name, join code, location and time zone, bank details while payment is on, and the danger zone. Renaming the academy renames the gym too, so the two names match. The student join link has one home: **Invite students** on Students opens it with copy, share, QR and rotate. The setup checklist has a close button; closing it hides it in that browser for that gym.
- **FR7: Removed features.** matops has no reception screens, no public booking page (`/book/<code>`) and no public REST API, no referrals, no curriculum, no general spaces (the only entity type is `bjj_academy`), no gym overview, People, person or gym settings screens, no academy selector or "Add academy" on the web, no notifications page or notice retry, and no per-academy payment switch. Their tables and columns are dropped by migration `0004_first_release_drops.sql`. What stays: the payments code behind FR1, drop-in leads and the wall-QR drop-in form at `/checkin/<id>`, the organization and entity model with entity URLs and the `x-matops-entity` header, `booking.cancelFor`, and every procedure the Expo app calls. An owner lands on their academy; an owner whose gym has no academy lands on `/start`, which offers the FP1 form in resume mode.

Attendance rules do not change: staff may correct attendance within 14 days, and an older change needs an owner or manager and a reason.

## First academy contract (ADR 135)

- **FA1: Adult person records.** Staff can create students without a login only through CSV import; the single Add student form was removed (2026-09-28). One verified account may link to the person for self-service. There is no guardian access.
- **FA2: Staff-assigned memberships.** Only where the academy requires payment to book (FR1): an approved student needs a staff-assigned shared plan to train. There is no student plan shop or purchase record.
- **FA3: Monthly evidence.** A month is unpaid, reported, confirmed, or rejected. Reports and staff decisions keep the actor, time, version, amount, currency, deadline, and time zone evidence.
- **FA4: Access deadline.** Only where the academy requires payment to book (FR1). A new booking or self check-in stops after the fixed seven-day local grace unless a claim is pending. Existing reservations stay. Older unpaid months stay visible but do not create a lasting hold.
- **FA5: Rejection hold.** A rejected month creates a person hold for the assignment's coverage. Month rollover cannot bypass it. An owner or manager must resolve it explicitly.
- **FA7: Safe schedule maintenance.** Owners and managers extend the generated calendar by hand. Rebuild starts from a versioned preview, keeps past and one-off classes, never revives cancelled classes, and refuses booked stale classes.
- **FA12: Fresh install.** The schema ships as one fresh baseline. There is no legacy conversion, backfill, or compatibility rollout.

See [ADR 135](issues/135-first-academy-fresh-install-contract.md).

## Staff and student separation (ADR 132)

- **ST1:** Students lists students, including pending student requests. The Staff section on Coaches lists owners, managers and instructors; pending coach requests wait at the top of Coaches. Inactive staff stay in Staff.
- **ST2:** Active staff train at their academy without a paid membership. Staff role, approval status, and payment standing are separate. Gym-level authority creates no student enrolment.
- **ST3:** Roster warnings and booking review respect staff access.
- **ST4:** Staff participants stay in class attendance with role badges and count toward capacity. Teaching alone creates no student attendance.
- **ST5:** Staff lifecycle controls keep history. Moving an instructor to Students is explicit and creates no paid plan. Academy actions cannot remove gym-level authority.
- **ST6:** New assignments cannot sell access only to staff. Existing assignments and payment history need review, not automatic cancellation.

See [ADR 132](issues/132-staff-roster-isolation.md).

## Pending students (ADR 130)

- **SP1: Approval comes before booking.** A student joins with the academy's join code or an invite link. While pending, they can browse the schedule and class details and edit their account. They cannot book or check in.

## The manager (ADR 129)

- **MB1: A manager runs the academy.** An active manager of the gym enters the academy without a membership there, and is written down as a manager, never as an owner. They run the schedule, attendance, students and their approvals, instructor assignments, leads, and ordinary settings. Four actions stay with owners: making or removing an owner, permanent erase, deleting the academy, and cancelling a booking for a student (FR4). Management access enrols nobody as a student: a manager who does not train at the academy cannot book a class there. Removing their gym membership takes effect on the next request. No screen in this release makes someone a manager.
- **MB4: Losing coverage cancels nothing.** Only while payment is on. Ending a membership leaves every booking where it is: the reservation, the place it holds and the attendance history all stay, and nobody is told their class was cancelled. The affected sessions become a review list of future bookings that the academy will not admit when the session starts. It clears itself when coverage comes back, when staff cancel the booking from the class, or when the session passes.
- **MB8: The academy picker in the app.** On the phone the academy name in the header opens the picker, so a student at two academies compares two schedules without opening Profile. A member of one academy is offered nothing. A switch is committed only after the session change it needs succeeds; a failure leaves them where they were and says so. The web has no picker.

## Starting a gym (ADR 128, amended by ADR 142)

- **FP1: Starting a gym creates its academy.** `/start` is one form: the academy name and a time zone, which starts on the browser's zone. It writes the organization with you as owner, then one BJJ academy with that name and zone, and opens `/entities/<id>`. If the second write fails, the gym exists with no academy and the owner lands back on `/start` in resume mode, which writes only the academy. A signed-in user who already runs a gym is sent away from `/start`, so nobody makes a second gym by accident.
- **FP2: A gym with no academy is a normal state.** It is where a new owner begins after a failed second write, not a broken setup. The only action offered is the FP1 form in resume mode. Nothing repairs the gym behind the owner's back. Join by code stays for the person it was written for: signed in, owning no gym, belonging to no academy.
- **FP3: The academy is a BJJ academy.** It is a `bjj_academy`; there is no type choice. It takes the gym's own id where that does not conflict, so a join code, a QR poster or a check-in link printed against the gym still resolves.
- **FP4: Creating the academy is safe to repeat.** Two requests at once produce one academy, never two. A half-finished attempt is repaired into the same academy. The creator becomes its owner.
- **FP5: A new academy starts with payment admission off.** Approval alone admits a student (FR1). No control turns the gate on.
- **FP6: A membership plan carries a price.** Only while payment is on. A plan has a monthly amount and a currency. A price change names the month it starts, so it reaches existing members from that month and never rewrites a month already behind them. There is no proration. A month marked paid means somebody says money was sent; the gym counts revenue only where the owner confirmed it.
- **FP7: A manager runs the daily work.** The gym can have managers beside its owners (MB1). Every rule is enforced where the work happens, so hiding a menu item is decoration and never the check.
- **FP8: Setup is guided, not guessed.** The academy carries a setup list the server works out from what exists: the academy, its address and time zone, a weekly schedule, a shared join link, a first approved student and a first booking. There is no gym-name step and no instructor step, because a teaching owner is the staff. Plan, bank details, assignment and readiness steps appear only while payment is on. Each item opens the screen that finishes it. The list shows at the top of the dashboard for owners and managers, and hides when it is done or closed.
- **FP9: One set of words.** A **gym** is the business somebody owns. The **academy** is the place it runs. A **class** is one dated thing on the schedule. Nothing is called an organization or an entity in front of a person: those are the words in the database, not the words in a gym.
- **FP10: Starting a gym is invite-only.** Only a signed-in user whose email is on the operator's list (`GYM_CREATOR_EMAILS`, comma-separated) can create a gym. An unset or empty list lets nobody in. The check runs in Better Auth, so it also covers the raw `/api/auth/organization/create` endpoint. A signed-in user who is not on the list sees "MatOps is invite-only for now" and a **Request a demo** email link on `/start`, not the form. The landing page and sign-in offer **Request a demo** instead of `Start a gym`, and the operator sends the `/start` link to each invited owner. An owner whose gym has no academy still finishes it (FP2), because that step creates no gym (ADR 149).

---

## 1. What matops is

A grappling academy's **schedule and attendance**, done well, for two audiences:

- **Students** book classes from their phone or the web.
- **Owners, managers and instructors** run the schedule, the student list, and attendance from the web.

The bet (a crowded niche) is that _simple and fast_ beats _feature-rich_. Every screen below serves one of the two core loops.

### The two core loops

- **Student loop, "train":** open the app, see this week's classes, **book the next class in 3 taps or fewer**, show up.
- **Owner loop, "run the week":** set the recurring schedule once, approve new students, see who is coming, mark attendance after class.

### The student-friction principle

The owner is the buyer, but the **student is the user**. The owner's data only exists if students use the app. So matops asks students for **almost nothing**:

- **Sign up first, book after approval.** Anyone can sign up and browse the schedule before the owner approves them. Until approval they are **view-only**: they can browse, but cannot book or check in, and see no member names (SP1). Approval gives the real role.
- **Capacity is a guide.** When a class passes its capacity it shows in **red** ("22/20, may be busy") and asks you to confirm. The owner manages the room. _(Hard caps, priority for members, waitlists, no-show and cancel cut-offs are not built.)_ Payment never blocks booking in this release (FR1).
- **Showing up is one tap.** A **QR code inside the gym** marks attendance (and books first if needed). Booking is optional intent; the QR is the real "I'm here".
- **No app? No problem.** The same gym QR opens a **short web form** for **first-time visitors**, saved as a lead the owner can follow up. It is a first touch, not a repeat path.

### Roles

| Role                           | Client       | Can do                                                                                                                                                                                 |
| ------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**                      | Web          | Everything: academy settings, invites, students, **approve students and coaches**, all templates and classes, attendance, cancel a booking for a student (FR4)                         |
| **Manager (gym)**              | Web          | What an owner does, except making or removing an owner, permanent erase, deleting the academy and cancelling for a student (MB1)                                                       |
| **Instructor**                 | Web          | _(after approval)_ Run the **whole schedule**, **take attendance**, approve and decline students, rank and notes, and see **their own Coaches card**; _not_ settings, invites or leads |
| **Pending (student or coach)** | Mobile / Web | **View-only:** browse the schedule. **No** booking, no check-in, no member names, no tools until approved (SP1)                                                                        |
| **Student**                    | Mobile / Web | _(after approval)_ View the schedule, **book and cancel**, own classes and profile                                                                                                     |

_(Everyone joins **pending and view-only**. The invite link carries the intended role, and **approval** grants it. This is the same for students and coaches, so a forwarded coach link cannot hand out real access. Roles are **per membership**: one login can be an owner at one gym and a student at another. The web opens one academy at a time from its URL; the app keeps an academy picker for a student at more than one (MB8).)_

---

## 2. Student app (Expo) and student web

### S1 · Sign in / Sign up

- **Email and magic link** (passwordless), plus **Continue with Google** on the **web** when the server has OAuth credentials set (ADR 35). **Mobile is magic-link only**: the iOS browser-to-app session return does not land (`docs/mobile-google-login-handoff.md`).
- **Fields:** first name, last name, phone, **email (required)**. Email is the sign-in identity. Nothing else.
- **The web door is one screen, no scroll** (`/sign-in`). A brand panel beside the form on a desktop, the form alone on a phone. No marketing section and no pricing: owners, instructors and students all sign in here, so the copy stays role-neutral. `Request a demo` (an email link, FP10) is the one secondary link off it, and `/start` is the same shell. Both link the **privacy notice**, because both ask for an email.
- **Signed out, `/` is a short landing page**: the headline, `Request a demo` (FP10) and `Sign in`, a static picture of the week schedule, three points (approval, booking from the phone, class change notices) and a closing `Request a demo`. Signed in, `/` opens the first academy as before.
- **Questions and features (AI search).** The landing page ends with a visible Questions list (what MatOps is, BJJ focus, booking, attendance and belts, pricing, how to start), marked up as `FAQPage`. `/features` is a static page with one short section per feature and a pricing link. Public copy (landing, `/features`, sign-in, `/start`, `llms.txt`) shows no email address, only `Request a demo` and `Ask for a price` links that open an email, and it names no exact numbers (code length, booking window, calendar horizon) or detailed feature specifics, so the copy stays true while the product changes. Header and footer link to it.
- **Landing analytics (ADR 148).** In production the landing page loads Google Analytics with analytics storage denied until the visitor accepts. A small banner offers Accept and Decline with equal weight and links the privacy notice; `Cookie settings` in the footer reopens it. The choice is kept six months. No other page loads analytics.

### S2 · Join an academy

- **Mobile:** the owner shares the academy's **join code, a plain 6-digit number**. The student **types it** in the app, sees _"Join **{Academy}**"_ with the academy's **address** when it has one, confirms, and gets a **pending** membership. No academy for that code gives "No gym found with that ID. Check the number with your gym."
- **Web:** through an **invite link** (`/join/<token>`) with the academy preselected, or by typing the join code on the post-login "Join your gym" form.
- **Every form asks for a person the same way** (ADR 119). A **phone** is a country picker beside the number; the picker opens on the country guessed from the academy's time zone. What is stored carries the country code (`+351912345678`). An **email** completes the domain once you type the `@`. The join forms, the profile, the walk-in row, the wall QR and sign-in share these components. The **mobile app keeps its own fields**, so a number typed there may arrive without a country code.
- **Web join is one form** (ADR 57, amended by ADR 59): a signed-out visitor on an invite link fills **first name, last name, phone and email together**, then gets the magic link. Opening the link returns them to the same form, already filled in, and one press of **Join** finishes it. The link **prefills, it never joins on its own**: an invite URL is public, so a link that both joined and wrote the profile could rewrite any signed-in person's name and phone. A **Google** sign-in skips the email step and is asked for name and phone on return.
- **Student sign-up answers** (ADR 146, ADR 147): a student on an invite link or the app's code-join form picks their **belt and stripes** (required, no default: "Never trained", White to Black, or "Enquiring for a child"; stripes show only for a belt). "Never trained" saves White, 0 and the staff note "Never trained before". "Enquiring for a child" saves no rank and the staff note "Enquiring for a child", answers **"Any injuries or medical conditions?"** when the academy asks it (optional, "Only coaches at {Academy} can see this."), and may tick **"Keep me updated on changes at {Academy}"** (not ticked by default). The belt becomes their rank unless staff already set one. The health answer becomes a staff note. When the academy requires its **agreement**, the form shows the full text and a required **"I have read and agree"** tick, and Join without it gives the box a red border. Every join form checks its fields and gives each wrong field a red border, not a browser popup. If the owner edited the text meanwhile, the join is refused with "The agreement changed. Please read it again." and the form shows the new text. An instructor invite asks none of these.
- **No waiting wall.** The student lands straight on the schedule (S4) and can browse at once. Booking opens when the owner approves them (SP1).
- _(Joining a **second** academy from the app: enter another gym's code while signed in. It appears in the app's academy picker, MB8.)_

### S3 · Pending state _(not a blocker)_

No blank waiting screen. A pending student sees the schedule with a note that the gym has not approved them yet, and gets no Book control. When the owner approves, the note clears, the app gets a **push** ("You're in at {Academy}") and the student gets the same text **by email** (ADR 146), whatever their news choice. The email has a **Book a class** button. A coach approved from the Coaches screen gets a coach version instead: it says they can see the schedule and take attendance, and its button is **Open MatOps**.

**Archived member (ADR 84):** an archived member has **no** enrolled access, the same as a suspended one, and sees the "your access to this academy has been removed" message. The row and every record attached to it are kept, so **Restore** (O4) brings the whole person back. `archived` is a distinct status from `removed`: `removed` marks an applicant an owner **declined**, who was never a member, and who never shows on the Archived tab.

**Suspended member:** a suspended member has **no** enrolled access; the server rejects the schedule and dues reads. The student sees a **calm notice** ("Your membership is paused. Contact your gym to restore your access.") on Schedule and My classes. Profile stays reachable. An owner reverses this with **Restore** (O4).

### S4 · Schedule _(home, the core screen)_

**On the web too** (ADR 57, ADR 73): a student signed in on the web gets the same week, grouped by day, Today first, with **Book** and **Cancel** on the row and the same "looks full, book anyway?" confirm. It reads `class.mine` and the `booking` router, the same calls the app makes. The web student has **Schedule**, **My classes** (`/training`, S6) and **Profile** (`/profile`, S7), plus **Membership** (`/payments`, S9) only while payment is on, in the same shell the owner uses, plus the **class detail** screen (`/class/<id>`, S5). The in-app QR scan (S8) and push and class reminders stay app-only. A **suspended** member sees the calm notice here as well.

- The next seven days of classes, grouped by day (Today first). Each row: **title, time, instructor, "N spots left"**. The window rolls with the day.
- **Inline book:** each upcoming, bookable row has a compact **Book** control, so booking is **one tap from the list** (plus the "looks full, book anyway?" confirm when over capacity). A booked row shows the **Booked** pill; cancelled and past rows show no control.
- **Day carousel (web):** above the list, one card per class still to come on the next day that has one (today, or the next day with classes). Each card has the time, length, title, coach, a "Starts in …" countdown inside 12 hours, a capacity bar with "N spots left" (or "You and N others" once booked) and **Book** or **Cancel**. It opens on the student's first booked class. Arrows and dots appear when the cards do not all fit.
- **Day strip (web):** a sticky row of the days with classes, each with its class count and a dot when the student is booked that day. It jumps to that day in the list.
- **Share with a friend (web):** an approved, active student sees a copy icon next to **Book** or **Cancel** on each row a visitor can still join (today and the next six local days, not cancelled, not ended). It copies the class drop-in link (S8). Pending students do not see it.
- Tap a class to open **S5**.
- Empty state: "No classes scheduled this week."

### S5 · Class detail + book/cancel

**On the web too** (ADR 73): `/class/<id>`, reached from any row on the schedule or on My classes. Same read (`class.get`), same capacity label, same soft-capacity confirm. A cancelled class says booking is closed and a class that already started says so, so the screen is never a dead end.

- Title, discipline, day and time, duration, instructor, capacity ("8 / 12").
- **You can book up to 7 days ahead** (ADR 79). Classes exist six months out so the owner can plan and print a poster, but a booking further ahead is refused. Both clients ask the same `canBook` rule the server does, so a direct link to a class further out shows "You can book up to 7 days ahead" and no Book button.
- **Booking requires approval and an active membership at the academy.** A plan and payment count only while payment is on (FR1). Nobody books for a student (FR3). Primary action, in a **sticky bottom bar** on the phone:
  - Not booked: **Book** (success **toast**, for example "Booked, Tue 18:00"). Pending members cannot book (SP1).
  - At or over capacity: the count shows **red** ("**22/20, may be busy**") and Book asks **"This class looks full. Book anyway?"**
  - Booked: **Cancel booking** (also toasts).
- **Who's booked (web):** an **approved** student sees every booked member by name, alphabetically, pending members included, and never themselves (ADR 55). Drop-in visitors and anyone with no name on file show only as a count ("+2 others"). A **pending** student sees counts only, plus "Names show once your gym approves you." A class only they booked reads "Just you so far". Staff see everyone on the roster (O5). Built by `class.attendees` and the pure `visibleAttendees`.
- Cancelled class: shown read-only as **Cancelled**.
- **Copy link for a friend (web):** an approved, active student sees this button on a class a visitor can still join. It copies the same class drop-in link as the S4 row (S8).

### S6 · My classes

**On the web too** (ADR 73): `/training`, with Upcoming (with Cancel) and Attended. Reads `booking.mine` and splits it with the same pure `splitMyClasses` / `nextClass` the app calls. A class the gym cancelled shows no Cancel control.

- The app shows a **next-class card** at the top (the soonest upcoming booked class), then **Upcoming** and **Past** (attended, read-only).

### S7 · Profile / account

**On the web** (ADR 67, ADR 73, ADR 145, ADR 152): `/profile` holds a **Profile picture** (same as O11, a pending student can set one too), the identity edit (name and phone; email read-only), the academy with its **address** and **Open in maps** link, **My rank** with the promotion timeline, appearance, feedback and **Privacy** links, and sign out. There is no join-another-gym control on the web. A student (not staff) also sees **Your data** with **Ask to erase**: it records a request (`membership.requestErasure`) and deletes nothing. The request shows its date and can be withdrawn. An owner or manager answers it with **Delete permanently** (O4). A suspended student is told to ask the gym directly. A student also sees **Emails** with **Email me news from {Academy}**, which turns the news opt-in from sign-up on or off (ADR 146). Membership and class emails always arrive.

- Name, phone, email, current academy, with the gym's **address** and an **Open in Maps** link under it when the owner has set one (ADR 68). The link opens the owner's pinned map when there is one, otherwise the phone's own map app on the address (ADR 71). **Name and phone are editable**; email is read-only. A **settings icon** in the app header opens Settings (S12).
- **My rank** (ADR 41): your rank per discipline (for example _BJJ, Blue, 2 stripes_) plus a short **promotion timeline**. **Read-only**: only the gym sets rank. Empty until a coach sets it.
- **Membership** (S9) lives here in the app, only while payment is on.
- **Academy picker** (app only, MB8): shown only if the student belongs to more than one academy. The phone remembers the last academy only as a preference inside the list of academies you still train at (ADR 125).

### S8 · Check in (drop-in booking) _(ADR 147)_

- **A student who booked can open the app or web and taps Booked to attend.** Attendance is at the class detail or roster after the class finishes (O5).
- **A first-time visitor or walk-in without a membership uses the drop-in link,** a public `/drop-in/<token>` page. One token per academy. Any staff member can copy and share it from the Dashboard or Students ("Share drop-in link"); the first read creates it. Only owners and managers rotate it. A visitor types email and phone, the server checks for one lead with both values matching in that academy and shows only the first name ("Are you {name}?"). No match or one-field match opens the full form. Accepting the match skips the full form; clicking No or no match opens it. Returning leads with up-to-date agreement answers do not refill.
- **The visitor picks a class.** The form shows only title, date and time. It offers every unfinished class that started today, future classes later today, and all scheduled classes on the next two days, in the academy's local time. A class that started yesterday is not offered after midnight. Staff can copy a class-specific drop-in link from the weekly Schedule, and approved, active students from their web schedule and class page (S4, S5). A class link works for any eligible class up to seven local days out (today and the next six), while the list without a class keeps three days. It shows only that class, without a picker, and gives an unavailable message if the class is no longer offered. The class ID in the link changes the display, not access: the academy link still permits booking any eligible class. Picking a class on now marks the visitor present (`present` on `drop_in_visit`). Picking a future class books them (`booked` on `drop_in_visit`, `unmarked` on `class_participation`). No eligible class means no submission. Soft capacity never refuses a visitor booking.
- **Visitors answer the same questions as student join** (S2): **belt and stripes** (required, same choices), optional **injuries and medical conditions** when the academy asks it (staff-only; bounded to 1000 chars; removed by erase), **"Keep me updated"** (unticked by default), and the current **required agreement** with a required **"I have read and agree"** tick when it is on. These answers stay on `drop_in`, never copied to a member. The visitor cannot read them back. Staff see **belt and stripes** on the class roster, and **health only for this academy's staff on the class the visitor booked** (not for cancelled visits).
- **Rate limiting:** lookups and submits are limited to 10 tries per 10 minutes per link, shared across all instances (Postgres counter keyed by IP + token SHA-256 hash). Rejected lookups, invalid links and refused submits log with `console.warn`, no contact data.
- **The poster** could encode the public **`/drop-in/<token>`** URL for a human-readable link printed on paper or sent over text. The drop-in page identifies the academy by resolving the token server-side before any query.
- Works **even if the class is full**; soft capacity shows red but never refuses.

### S8b · Desk check-in tablet _(ADR 150)_

- **One secret link per academy** at `/desk/<token>`. Owners and managers find it in Settings ("Front desk tablet") with copy, QR and Rotate. The first read creates it. Instructors and students cannot read it. Rotating stops the old link on its next request; an unknown and a replaced link get the same "This link was replaced or turned off" message.
- **The page does one thing.** It has no links and no sign-in. It reads the academy only from the token, never from a session, so a browser signed in to MatOps gets nothing more from it.
- **Class first.** It opens on the class open for check-in now, or else the next class today. If two classes are open at once, it asks which. Buttons list today's classes that have not ended. When no class is left today, the page shows tomorrow's classes under "No more classes today. Tomorrow:", and says "Check-in opens tomorrow at" a time. **The first class in the list is open for check-in at any time today, until it ends. Once it starts, the next class opens too**, so latecomers to the running class and early arrivals for the next one can both check in. Classes that start at the same time count as one step. A later class says "Check-in opens at" the start of the class before it. Tomorrow's classes never open early. The desk uses this rule instead of the 60-minute check-in window.
- **Then the name.** Booked members show as name buttons, already present ones greyed with a tick. "Not on the list? Type your name" finds any other active member after 2 letters (at most 10 results), as a walk-in. Names show as first name and last initial, or the full name when two would look the same. No contact, health or status data is shown.
- **Tapping a name** marks the member present and books them if they had no booking (the same write as S8 check-in: approval, class state and soft capacity apply). It records `check_in_source = reception_self`. Pending, suspended or archived members see "Please talk to the desk". A second tap changes nothing.
- **Undo.** The success screen shows "Not you? Undo" for 10 seconds. The server allows undo for 30 seconds, only for a desk check-in that no staff member has marked since. Undo clears attendance and cancels the booking if the tap made it. Later fixes happen in Attendance (O5).
- **Rate limit:** 600 desk requests per 10 minutes per link (Postgres counter), plus the per-IP limit on every public procedure.

### S9 · Membership _(only while payment is on, FR1)_

With payment off, the web hides this screen and `/payments` says payments are not in use. With it on:

- **Approved members only.** The card carries the gym's bank details, so a **pending** member does not see it.
- The student sees each membership's plan, amount, the month they are judged on, and its standing, with the gym's bank details and a **reference** to put in the transfer note (copy buttons on each). You pay in your own bank app. There is no card payment.
- **"I paid"** reports the month as sent (`accessPlan.claimMonth`). Claiming twice is one claim. An owner or manager confirms it, which marks the month paid, or rejects it (FA3, FA5). While a claim is pending, booking stays open (FA4).
- There is no plan shop: staff assign the plan (FA2).

### S10 · Home-screen widget

Not built. The design is in `docs/home-widget-implementation.md`.

### S11 · Dues warning strip _(only while payment is on)_

- A **thin strip** at the top of the student screens, on both clients, shown **only** when a membership carries a warning from `accessPlan.mine` (unpaid past the deadline, or a hold). The copy is plain and not shaming, and says what to do.
- It **clears itself** within one refetch after the owner confirms payment. A student in good standing never sees it. With payment off it never shows.
- **Tap** opens the membership section (S9).

### S12 · Settings _(app)_

**On the web:** there is no separate settings screen. Appearance and sign out sit on `/profile` and in the shell footer.

- A **pushed screen** reached from the gear in the Profile header. Holds **appearance** (light, dark, system), the **push notifications** on/off switch (one switch covers reminders and class alerts; off drops this device's token **and clears the scheduled local class reminders**, ADR [54](issues/54-local-class-reminders.md)), and **sign out**.

### S13 · Notifications _(app only, ADR 77)_

- **A feed of what the gym has sent you**, newest first, in the app. A cancelled class, a changed time and an approval land here, whether or not the push arrived. This is the durable copy; push is the alert.
- **Unread rows carry a dot.** A **bell in the app header** carries a red dot while anything is unread and opens the feed. Opening the feed marks it read. The bell is hidden until the membership is active.
- **Only a class row opens something**: it opens the class.
- **The web has no notifications page.** Nobody can post gym news in this release.

**Every app tab screen wears the same top bar:** the mark, the academy you are in, then the icons (the notification bell, plus the settings icon on Profile). Icons are the web shell's own glyphs redrawn for React Native, never emoji.

**The app has four tabs: Schedule, Training (My classes), Scan and Profile.** The web student has the same set minus Scan (ADR 73).

---

## 3. Owner and instructor web app (Next.js)

**Owner onboarding is quick too.** Same sign-in. Schedule setup has quick tools: **duplicate a template**, **copy a day**, and a "typical week" starter.

**Signing in lands you in your academy (ADR 49, ADR 142).** Creating a gym happens at `/start`, which makes you the owner at once (FP1). It is invite-only: the sign-in page offers **"Request a demo"**, and the operator sends `/start` to invited owners (FP10). On a normal sign-in, `/` opens the first academy you can reach. An owner whose gym has no academy goes to `/start` in resume mode (FP2). Someone with no academy at all gets **"Join your gym"**: type the 6-digit join code, add name and phone, and land **pending** as a student.

### O0 · One gym, one academy _(ADR 124, ADR 142)_

- **A gym is an organization; its academy is an entity.** The academy has its own name, time zone, address, schedule, students, six-digit join code and invite links.
- **The URL names the academy.** Every screen lives under `/entities/<id>`, so a reload keeps it and a pasted link opens the right place. The app stores the academy the student picked and names it on every request the same way.
- **A person can be different things at different academies**, an owner at one and a student at another. Approving, suspending, archiving and removing someone happens at one academy.
- **Not in this release:** a second academy on the web, any place that is not a BJJ academy, moving a member or a class between academies, a shared roster, and billing of any kind.

### O1 · Dashboard _(the "run the week" home)_

- **Needs you:** an action queue, each item linking to the screen that clears it. Every staff member sees **Classes to review** and **Pending approvals**. Owners and managers also see **Erase requests** (opens the Students Requests tab, ADR 145), **Coach requests**, **New drop-in leads** (nobody has replied yet) and **Trained, not joined** (they came at least once and are still not a member); the lead items open O4 on the matching filter (`?tab=leads&stage=new` / `&stage=trained`). An item appears only while its count is above zero. A cleared queue says **All clear**. A query that failed says what it could not check and offers **Try again**, so a failure never reads as zero.
- **Attendance review** (ADR 133): the dashboard counts every ended, live, non-cancelled class that needs review. There is no look-back limit. The item opens Attendance with **Needs review** selected. A reviewed class returns to the queue when its roster or attendance changes.
- **The day block:** the day's classes with booking counts and the coach's name. Each row shows the class's state: **Now** while it runs, **Needs review** once it has ended without a current review. **Clicking a row opens the class roster** (the O5 panel). Once **today's last class has ended** the block shows **Tomorrow** instead.
- **Quick counts:** active members (owners and managers) and classes this week.
- **Who's drifting** (owners and managers): members who used to train here and have gone quiet, banded `cooling` / `at risk` / `dormant` by days since their last class, each linking to their member detail (O4).
- **Setup card** (FP8): owners and managers see the setup list at the top until it is complete or closed.
- **First run:** an owner whose academy has no active members and no classes this week sees **two steps** where the queue would be: add your weekly classes, share your join link. It disappears once either count moves.

### O2 · Schedule (classes)

- **Week calendar** of concrete classes, each showing **people / capacity**: confirmed bookings plus everyone marked present without a booking (staff walk-ins and drop-in visitors who came to a class on now), each person counted once. The Dashboard day block uses the same number. On a wide screen this is a **timetable grid** (ADR 53): Monday to Saturday across, hours down, each class at its real time, with the coach's name. A coloured left rail marks the discipline: the first five names in the academy's list get their own colour, and every other class (no discipline, or past the fifth name) gets the default, white in the dark theme. A line marks the current time, and runs of empty hours collapse into one band. On a phone the week is a day-by-day list.
- **Click a class** to open its **detail modal**: the O5 roster panel. A class further out than tomorrow, or older than the 14-day window, shows a read-only list.
- Per-class actions: **cancel** (booked students get a notice, §4), edit capacity and instructor, add a **one-off class**.
- Jump to **O3 templates** for the recurring engine.
- New and edited schedules **appear at once** (classes are made on save).
- Empty state: "Create your first class."
- A one-off class may have no discipline. When staff choose one, it must belong to this academy's list (O6).

### O3 · Recurring templates

- List of templates; **create and edit**: title, optional academy-defined discipline, **days of week**, start time, duration, capacity, instructor, status (active or paused).
- **Discipline picker** (ADR 144): one list holds None, the academy's names and Add discipline at the bottom. Owners and managers select a name or add one in a single name-and-save row; saving adds it to the list and selects it. Each name has a three-dot edit button that opens rename and delete in the same picker. Both changes ask for confirmation and explain their effect on matching templates and future scheduled classes, including one-offs; past and cancelled classes keep their saved value. Instructors can select but cannot manage names. The one-off class form reads the same list.
- **Time zone is not asked for** (ADR 68): a new template takes the **academy time zone** (O6); an existing one keeps its zone, so changing the academy setting never cancels a booked class. The form shows the zone in force and offers a one-click move when it disagrees.
- Pausing stops future generation; existing classes stay. Deleting soft-deletes (existing bookings kept).
- **Classes are generated six months ahead** (ADR 79). Saving a template fills that window at once. Nothing runs on a timer: an owner or manager uses **Extend** to add future classes.
- **Rebuild schedule** (FA7, owner or manager). It regenerates the forward schedule from the **active** templates. It starts from a preview that names what it will change, and the save rechecks that preview. It keeps **past classes and all attendance history**, **one-off classes**, and every class the owner **cancelled**. It refuses to remove a stale class that still has active bookings. It also **removes** the future cancelled classes of a **deleted** template from the schedule (soft delete, so their records stay).
- **Export poster** (ADR 54): turns the active templates into a landscape PNG for the wall: the weekly board with times, class names and coaches, and **no booking numbers**. A preview shows first; **Download PNG** saves it. The footer carries the **join code**. It shows no date, so a printed poster does not look out of date. The button sits on the week view beside **Add class**.

### O4 · Students (people + leads)

- **Four tabs:** **Requests** (pending approvals, the default, with a count badge), **Members** (the active roster), **Drop-in leads** and **Archived**. Instructors see only Requests and Members. Every tab is **addressable** (`?tab=requests` / `members` / `leads` / `archived`), so each O1 item opens the tab that clears it; `?member=` opens on **Members** at that person.
- **Actions** (owner or manager): **Invite students** (the join link with copy, share, QR with a printable poster, and rotate), **Import students** (CSV, previewed before it writes) and **Export data**.
- **Requests:** approve or decline **students**. Someone invited as an **instructor** is approved on **Coaches** (O10). Approving gives the intended role and activates them.
- **Who can open this screen** (ADR 76): owner, manager and instructor. An instructor can open the roster, **approve and decline** students, **set rank**, and read and write staff notes. An instructor does **not** get the invite link, the leads tab, the Archived tab, erase requests, import, export, suspend, restore, archive, or delete permanently.
- **Search:** the **Members** tab filters by **name, email or phone** as you type, in the browser, with no extra request.
- **Two ways a member leaves** (ADR 84):
  - **Archive** (owner or manager) is reversible. The member loses access at once, their **upcoming bookings are cancelled** and those places go back to the class. Nothing is deleted: attendance, rank, promotion history, notes and payment history stay. They move to **Archived**, where one click **restores** them. Cancelled places do **not** come back. A student who rejoins with the join code lands back on the **same** row. Archiving can never leave the academy without an owner (§4), and only an **active or suspended** member can be archived: a pending applicant is **declined**.
  - **Erase requests** (owner or manager, ADR 145): students who asked to have their data erased (S7) are listed at the top of the **Requests** tab with the date they asked, each with **Erase data**, which is Delete permanently below.
  - **Delete permanently** (owner or manager; a manager cannot erase an owner or anyone who runs the gym, ADR 145) cannot be undone. It lives behind the row's **⋯ menu**, and the dialog makes the owner **type the member's name**. It erases every row this gym holds about the person. Their **sign-in account is deleted too, unless they belong to another gym on matops**. This is how an owner answers a **data-deletion request**.
- **Member detail:** tabs **Overview** (role, contact, attendance stats, drift band), **Attendance** (full history, paginated), **Rank** and **Notes**, plus **Membership** for the owner while payment is on. Suspend, archive and, on a suspended or archived member, **Restore**. Making an owner lives in the Staff section of Coaches (O10).
  - **Rank** (ADR 41): the coach sets the rank **per discipline** from the seeded systems (the first release has BJJ belts and stripes only; the discipline is stored as text so more can be added later). **Rank only goes up**; to fix a mistake the coach **clears** the rank (the history stays) and sets it again. Each change records a **promotion** (from, to, date, who). No automation.
  - **Notes** (ADR 41): **staff-private** notes (injuries, goals, readiness), visible to **all staff at this academy**, timestamped and authored, **never** shown to the member. The student's own health answer from sign-up shows here as **From sign-up form** (ADR 146). Overview shows **Agreement: Agreed {date}** when the student accepted the academy's agreement.
- **Drop-in leads** (owner or manager): the **lead pipeline** (ADR 115, ADR 147).
  - **Stage** is stored: `new`, `contacted`, `joined`, with `ghosted` as a side exit. **Activity** is derived: booked, trained N times, last visit. `new` is automatic on the first booking or visit. The lead menu has only **Mark contacted** and **Mark ghosted** (2026-09-29); Mark contacted also brings a ghosted lead back. `joined` is automatic when a new member's phone matches the lead at self-join. Older rows may still hold `invited`; they show under All. `ghosted` deletes nothing.
  - Each lead records **where it came from**: the drop-in link or the front desk (staff-recorded visitor).
  - The list shows the visitor's **belt, stripes, health note, news opt-in choice and agreement acceptance date** (ADR 147).
  - **Brought by** (ADR 151): a lead who first came through a link a member copied or shared shows "Brought by {name} · student" or "· coach". The first sharer stays. A link with a broken or foreign sharer still books the visitor, with no credit. The QR code carries no sharer. The visitor never sees who shared the link.
- **A visitor's classes are their own rows** (ADR 115): each class a visitor books or attends is a separate row, so an earlier register keeps them. Drop-ins count in **no** member statistic or coach figure.
- **Join code:** a plain **6-digit number**, shown in Settings to copy and share. Joining by code lands **pending** as a student.
- **Invite links** (ADR 63): the **student** link is **Invite students** on this screen; the **instructor** link is in the **Staff** section of **Coaches**. The joiner lands **pending** until approved. One active link per role. Opening a link while **still pending** replaces the intended role (the **newest link wins**). Opening one while **already active** changes nothing.

### O5 · Attendance

- **Review list** (ADR 133): every ended, live, non-cancelled class, oldest first. Default filter **Needs review**, with **All** as the other. Optional start and end dates use the academy time zone. 50 rows per page. Each row shows the date, class, coach, review status and unmarked count.
- Open a class to see booked members, self check-ins and visitors.
- **Finish attendance:** staff resolve every unmarked member and visitor before finishing. Cancelled bookings do not block it. If nobody is present, staff confirm **Nobody attended**.
- **Review changes:** a later roster or attendance change makes the class need review again. Finishing from an older roster fails with a message to reload. The finished view records who reviewed it and when.
- **Historical corrections:** staff mark within 14 days; an older change needs an owner or manager and a reason, and is recorded.
- Mark **present / absent** with one control per row: filled green for present, filled red for absent, two empty rings for not marked. Clicking the current mark clears it. Self check-ins arrive marked present.
- **Cancel booking** (owner only, FR4) on each booked student of a class that has not started.
- **Add someone who isn't listed:**
  - **A member who didn't book:** search the academy's active members, tick them, mark them present. They show with no tag: **walk-in** is kept for visitors.
  - (Staff no longer add visitors directly; a visitor joins through the drop-in link or the staff mark them present in a lead's row after the visitor comes through the link, ADR 147.)
  - **A visitor can be marked present or absent** like anyone else on the register. A visitor who booked shows **booked**; one who came without booking shows **walk-in**, and the summary line counts them as "N walk-in".
- **Mark all present:** one tap marks everyone booked as present; the owner then removes the no-shows. Respects the 14-day window.

### O6 · Settings

Owner or manager. Instructors do not see it.

- **Academy name:** can be **renamed**; it is a label, not unique. Renaming the academy renames the gym too (FR6). Identity is the **join code**, a unique, permanent 6-digit number shown read-only. Every screen calls it the **join code** (ADR 137).
- **Academy icon** (ADR 152): optional. Upload, replace or remove a JPEG, PNG or WebP image; the browser shrinks it to 512 px and saves it as WebP (PNG if the browser can't). It shows in the sidebar next to the academy name, above the heading on the join and drop-in pages, and in place of the MatOps mark on the front desk tablet. With no icon, those places look as before. Up to 2 MB after shrinking, and 1 GB of files per academy.
- **Time zone** (ADR 68): one IANA zone, picked from a list. Every class time, week boundary and statistic uses it. A **new** template inherits it; existing templates keep their zone, and Settings names any that disagree.
- **Address** (ADR 68): free text, up to 200 characters. Students see it on Profile and on the join confirm step.
- **Map link** (ADR 71): an **optional** share link from Google Maps, Apple Maps, OpenStreetMap or Waze. Only those four hosts are accepted. The field is disabled until an address is typed. A **Check the pin** link opens exactly what the student's tap will open.
- **Sign-up questions** (ADR 146): **Ask about injuries and medical conditions** turns the optional health question on the student join form on or off (default off). Belt and the news opt-in are always asked. **Require agreement** makes new students accept the academy's agreement to join; it can only be turned on once a text is saved. **Agreement text** starts as a starter template the owner edits and saves. Each save with changed text is a new version, and the owner is responsible for the wording. Students who joined before are not asked.
- **Bank details:** only while payment is on (FR2, FR5).
- **Delete the academy** (ADR 68): owner only; the owner types **`delete <academy name>`** to confirm. It is a **soft** delete: every member loses the academy at once and its join code is never reissued, but the data survives in the database. No restore screen. The gym closes with its last academy.
- There is no booking window row, no country row and no payment switch (FR5, FP5).

### O7 · Memberships and payments _(only while payment is on, FR1)_

With payment off, the Memberships item is hidden and `/memberships` and `/entities/<id>/payments` say payments are not in use. With it on (owner or manager):

- **Plans** (FP6): a monthly price in one currency, a price history that names the month a change starts, and the academies it covers.
- **Assign** a plan to a student from their Membership tab (FA2). Suspend or end an assignment. Ending one cancels no booking (MB4).
- **This month:** a board of every active membership, unpaid first. Staff **mark a month paid**, or confirm or reject a student's **"I paid"** claim (FA3). A rejected month creates a hold (FA5).
- **Bank details** in Settings feed the student's card (S9).
- **No reminders are sent**: nothing runs on a timer.

### O8 · Install as an app (PWA) _(ADR 42)_

- The web app is an **installable PWA**: add it to the iOS or Android home screen and it opens **standalone**, with the matops icon and splash. No app store.
- It serves the owner's **on-the-mat, one-handed** jobs: take attendance, cancel or edit a class, **share** the invite link through the phone's share sheet, and approve a join.
- **Students install it too** (ADR 57): the student schedule carries a quiet **"Keep this on your home screen"** card: an **Install** button where the browser offers one, and the **Share, Add to Home Screen** wording on iOS. It disappears once the app runs standalone, and is not shown to a suspended member. There is no store listing yet.

### O10 · Coaches _(ADR 62)_

- **Who taught it is recorded on purpose.** Every template and one-off class has a **coach picker**, and every class roster has a **change the coach** control for the night somebody covers.
- **Any staff member may set the coach on a class that has not started. Only an owner may change one that already happened**, because that rewrites reported history. Correcting a finished class **notifies nobody**.
- **Credit follows the class.** A class counts for whoever its coach is now.
- **What a card shows** over a window (this month, last month, or the last 90 days): **classes led**, **needs review**, and **cancelled** (FR5). Classes led counts ended, non-cancelled classes with a current attendance review.
- **Changing the window keeps the figures on screen** while the new window loads.
- **Never a leaderboard.** Cards are ordered by name. **Owners and managers see every coach; an instructor sees only their own card.**
- **Coach requests land here.** Someone who opens the **instructor** invite link waits at the top of this screen (owner or manager), with **Approve** and **Decline**.
- **The staff list is at the bottom** (ADR 50, ADR 63): every owner, manager and instructor, the **instructor invite link** ("Invite a coach"), and a per-person **⋯ menu** to make a co-owner, suspend, archive or restore staff access. The last active owner cannot be stepped down (§4).
- **A coach who leaves keeps their row**, marked "no longer staff".
- **Not in this release:** pay of any kind, more than one coach per class, export, and any student-visible view.

### O11 · Profile _(the person, not the gym; ADR 67)_

- **Settings is the academy; Profile is you.** Every signed-in person reaches **Profile** from the sidebar footer avatar; on a phone the avatar sits in the header. It is a route with **no nav item**.
- **Profile picture** (ADR 152): upload, replace or remove a photo (JPEG, PNG or WebP; the browser shrinks it to 512 px). It replaces the initials in the sidebar footer and the phone header, and shows next to your name in Students (members, requests, archived), the class roster and walk-in picker, Coaches, and on the front desk tablet. It belongs to your membership at this academy, so another gym never sees it. A manager with no membership row at the academy has no photo there.
- **Your details:** name and phone are editable, email is read-only. Same `account.updateProfile` procedure the app uses.
- **In this academy:** the academy the URL names, your role there (or "pending approval"), and the month you joined. Read-only.
- **Appearance and sign out** live here and in the desktop sidebar (ADR 123).
- **Something broken?** (ADR 76): a feedback link on Profile opens an email with the academy, your role and the screen already filled in.
- **Not in this release:** email change, password or passkey management, notification preferences, and any bio.

**On a phone the bottom bar holds five slots** (ADR 123): past that the tail moves into a **More** menu, and the badges of the hidden items add up onto that tab. A student has at most four items and never sees More.

**Who sees what.** Owners and managers see O1 to O6, O10 and O11, plus O7 while payment is on. Instructors see O1, O2, O3, O4 (Requests and Members only), O5, O10 (their own card) and O11. `ROUTE_ACCESS` in `packages/domain/src/entity.ts` decides what a role is offered; the tRPC procedure tier is the guard. Typing the URL of a page your role does not have shows a short message and a way home instead of the page (ADR 74). O8 describes installability, not a separate screen.

---

## 4. Cross-cutting rules

- **Uniform approval (students and coaches):** everyone joins through a link or the join code, lands **pending and view-only** (browse the schedule; no booking, no check-in, no names, no tools), and the owner approves. Approval gives the intended role. A forwarded link never grants access by itself.
- **Capacity is a soft guide:** a class shows "booked / capacity"; at or over capacity it turns **red** and asks the user to confirm. The owner manages the room.
- **The booking window:** a student books from today up to 7 days ahead, in the academy's time zone. The same rule decides lists, direct links and self check-in.
- **The payment gate** (ADR 82, FR1): off for every academy. While `membership_enforced_at` is null, approval and an active membership are the only admission checks. If a later release turns it on, FA2 to FA5 apply: a pending claim keeps booking open, and cancel and staff are never gated.
- **Privacy on the schedule:** students see counts, never names. Staff see names for attendance. **Visitors** are never listed to students.
- **Drop-in link (public web, ADR 147):** the academy has one rotatable link at `/drop-in/<token>`, shared by any staff member (and, one class at a time, by approved students) and rotated only by owners and managers. A visitor types email and phone; if both match one lead in that academy, the server shows only the first name. No match or one-field match opens the full form. A returning lead with up-to-date agreement answers skips the full form. The visitor picks a class on now (marks them present) or coming up (books them), with title, date and time shown. The same field components as student join are used: **belt and stripes** (required), optional **injuries and medical conditions** (staff-only), **"Keep me updated"** (unticked by default), and the current **required agreement** with required tick when on. Answers stay on `drop_in`, never copied to membership. Staff see **belt and stripes** on the roster and **health only for this academy's staff on the class the visitor booked**. Soft capacity never refuses. Lookups and submits are rate-limited to 10 per 10 minutes per link (Postgres counter, shared across instances, keyed by IP + token SHA-256 hash).
- **Policies open where the person is** (ADR 121): on the drop-in form the privacy link opens in a **dialog**, so what the person typed stays. The form has no contact or risk ticks: one line above the button says that continuing lets the gym contact them, and the academy's own agreement covers training risk (2026-09-29). `/privacy` and the dialog render the same text.
- **A second tick, for the risk** (ADR 121): a required checkbox, "I understand training is full contact and carries a risk of injury", with the notice behind it. The notice names the **academy** and says it is **not the waiver**, which is signed at the desk. The tick is enforced in the browser and **stored nowhere**, on purpose.
- **A form never goes dead** (ADR 120): on every public form, the submit button is disabled **only while the request is in flight**. Pressing it either sends or says what is wrong, on the field it belongs to. The phone box refuses characters a number cannot contain. A message clears when that field is edited, and a refused drop-in refetches the class list.
- **Privacy page** (ADR 76): a public `/privacy` page in plain English says the academy controls its members' data while MatOps processes it, lists what is stored and why, and directs member data requests to the academy and MatOps questions to the existing support email. It says the data is stored in the **EU** and does **not name vendors** (ADR 121). The drop-in form and the join form link to it, outside the consent checkbox's label. The operator's legal identity and address must still be confirmed before real invitations (first-release plan S7).
- **Rate limits on the public surface** (ADR 76, ADR 147): a drop-in form lookup or submit can be tried 10 times per 10 minutes per link (Postgres counter, shared), an academy or invite lookup 30 times a minute, and a magic-link sign-in email 5 times per 5 minutes. Over the limit the page says to wait and try again. Academy and invite limits are per instance; the drop-in limit is persisted.
- **Notifications:**
  - **Class cancelled or given a new coach** (on a class that has not happened; a time change cancels the class): the notice is saved in the same transaction as the change. After commit, matops sends one email batch through Resend to booked members and to visitors who left an email, pushes to the app, and writes the app feed (S13). There is no retry screen. The coach notice names the new coach and never says the class moved. Each email has one button: a member gets **Find another class** (cancelled, opens the schedule) or **View class** (new coach, opens the class). A visitor gets **Pick another class** on the drop-in link when a class is cancelled and the academy has a live link, and no button otherwise.
  - **Every email** (sign-in link, approval, class notices) uses one HTML layout with a plain-text copy: a heading, the message, at most one button, and a footer that says why the person got it.
  - **Class reminder:** a **local notification the phone schedules when the student books** and drops when they cancel (ADR [54](issues/54-local-class-reminders.md)). A web-only student gets no reminder.
  - **Membership approved:** push and feed ("You're in at {Academy}").
  - **Nothing else is sent.** There are no dues reminders and no gym news: nothing runs on a timer.
  - Resend also carries the sign-in magic link. There are no live in-app updates; screens refresh by light polling.
- **Keyboard and focus** (ADR [136](issues/136-interface-review-fixes.md)): every control draws the same focus ring, and every signed-in page opens with a **Skip to content** link.
- **Time zones:** every academy has one; classes show in it. No per-user time zone.
- **Empty and error states:** every list has a purposeful empty state; every mutation has a human error toast. An **error toast waits to be dismissed**, and **every error names a next step** (ADR 136).
- **Loading states** (ADR [80](issues/80-loading-states.md)): the placeholder looks like what follows it. On the **web** a route draws the skeleton of its own screen until the data lands; on the **phone** each screen does the same. Where there is no screen to imitate yet, the **mark weaves itself** with a line saying what is happening. A wait under 180ms shows nothing. Going back to a web screen opened in the last 30 seconds draws no skeleton (ADR 100). A spinner is only for an action in flight. Reduced motion holds every placeholder still.
- **Offline:** not supported; the app shows a clear "you're offline" state.
- **Freshness (mobile):** the student tab screens **pull to refresh**, and the app refetches stale reads when it returns to the foreground.

### Edge rules

- **Editing a class:** changing **time or instructor** notifies booked students (§4), **unless the class already happened** (ADR 62). **Cutting capacity** below current bookings is allowed (soft cap, shows red).
- **Editing a template:** applies to **future, non-cancelled** classes only. A **timing** change (days, start time, zone) **cancels** the future classes rather than deleting them, then regenerates: a class the new timing still covers comes back **scheduled with its bookings intact**, and one it drops stays visible as **cancelled**. A booked student never loses a class silently (ADR 60).
- **Deleting a class or template:** soft delete; bookings and attendance are kept; a deleted class notifies its booked students.
- **Pending people:** the member list shows each pending member's **visit count** so the owner is nudged to approve them. No auto-approve.
- **Duplicate drop-ins:** leads are **grouped by phone**: one lead per person, with a row per class.
- **Sole owner:** an owner can **make another staff member a co-owner** from the Staff section on Coaches, so a gym is never left ownerless. Full ownership transfer is not built.
- **The gym's owner is an owner at its academy** (ADR 125), whatever their membership row says. They can be **erased from the academy roster**, but the erase never takes the gym away and never deletes their account.
- **The app's academy picker offers only academies you may open:** a suspended, archived or removed membership is left out.
- **Removing or declining someone with history:** their **attendance and lead records are kept**; access is revoked. Rejoining starts pending again.
- **Drop-in link opened with no class in the next three local days:** the form says so and asks the visitor to contact the gym. A class-specific link for an unavailable class says to ask the gym for a new link. There is no "just visiting" option: without an eligible class the form saves nothing (ADR 147).

---

## 5. Not in this release

**Card payment processing or auto-subscription** (manual-transfer payments exist but are off, FR1), **referrals**, **curriculum**, **public booking**, **reception**, **announcements**, **dues reminders**, **live in-app updates**, **cross-academy views**, **session packs**, **multi-currency or i18n**, **super-admin UI**, **rich offline and sync**.

- **Capacity hygiene:** hard caps, priority for members, **waitlists**, **no-show tracking** and **cancellation cut-offs** are not built. matops shows a soft red "may be busy" warning and lets the owner manage the room.
- **Rank:** attendance-to-promotion **automation**, owner-defined **custom rank ladders**, **bulk** promotion and a **student training journal** are out.
- **Home widget** (S10): designed, not built.
- **A separate native owner app** stays out: owners use the web app and its PWA (O8).

The architecture leaves room for the deferred items ([architecture.md](./architecture.md) §8).

---

## 6. Definition of done

A new academy can: the owner signs up, creates the academy (FP1) and a recurring schedule, and shares the **invite link** or join code; a student joins on their phone (magic link, minimal info) and sees the schedule at once; the owner approves; the student **books** and **checks in with one QR tap** at the gym; a **visitor without the app** is saved through the QR web form; and attendance is mostly filled in before the owner reviews it. Both loops work end to end with low student friction.
