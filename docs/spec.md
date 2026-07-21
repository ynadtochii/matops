# matops — MVP Product Spec (v1)

*First-iteration product surface for **matops** (the from-scratch rebuild of the old app **MAT**). Scope = "standard class management". Two clients: **student mobile** (Expo) + **owner web** (Next.js). This is the product half of the rebuild; the build sits on [architecture.md](./architecture.md).*

**🔒 PRODUCT SCOPE LOCKED (session 12).** Folds in the critical-review decisions (tickets 12–21), the low-friction student wave (22–27), the full product pressure-test (soft capacity, uniform approval, required email, schedule privacy, first-visitor drop-in), and the settled edge rules (§4). This is the v1 product surface; capacity hygiene (hard caps, waitlists, no-shows, cancel cut-offs) is the next iteration.

---

## 1. What v1 is

A grappling academy's **schedule + attendance**, done flawlessly, for two audiences:

- **Students** book classes from their phone.
- **Owners/instructors** run the schedule, roster, and attendance from the web.

Nothing else. The bet (crowded niche) is that *simple + fast* beats *feature-rich*. Every screen below earns its place in one of the two core loops.

### The two core loops

- **Student loop — "train":** open app → see this week's classes → **book my next class in ≤3 taps** → show up. That speed is the product.
- **Owner loop — "run the week":** set the recurring schedule once → approve new members → see who's coming → tap through attendance after class.

### The student-friction principle (the make-or-break)

The owner is the buyer, but the **student is the user**. The owner's data only exists if students actually use the app. So v1 is built to ask students for **almost nothing**:

- **Let them in first, confirm them later.** Anyone (student or coach) can sign up, see the schedule, and book **before** the owner approves them. Until approval they are **view-only** — they can browse, book, and check in, but see no member names and get no tools. Approval assigns the real role.
- **Booking is never blocked; capacity is a guide.** Anyone can book any class. When a class passes its capacity it shows in **red** ("22/20 — may be busy") and asks you to confirm — the owner manages the room. *(Hard caps, priority for members, waitlists, no-show and cancel cut-offs are the next iteration.)*
- **Showing up is one tap.** A **QR code inside the gym** marks attendance (and books first if needed). Booking is optional intent; the QR is the real "I'm here".
- **No app? No problem.** The same gym QR opens a **short web form** for **first-time visitors** — captured as a lead the owner can follow up (and send an app link to). It's a first touch, not a repeat path.

### Roles

| Role | Client | Can do |
|---|---|---|
| **Owner** | Web | Everything: academy settings, invites, roster + **approve members and coaches**, all templates/classes, attendance |
| **Instructor** | Web | *(after owner approval)* Run the **whole schedule** — create/edit/cancel **any** class or template, **take attendance**, see the roster; *not* academy settings, invites, or approvals |
| **Pending (student or coach)** | Mobile / Web | **View-only:** browse the schedule, book/cancel own, check in. **No** member names, no tools — until the owner approves |
| **Student** | Mobile | *(after approval)* View schedule, **book/cancel**, see who's in a class, own classes/profile |

*(Everyone joins **pending/view-only**; the invite link carries the intended role; **owner approval** grants it — this is uniform for students and coaches, so a forwarded coach link can't hand out real access. Roles are **per membership**: one login can be an owner at one gym and a student at another. The **client is the lens** — web shows gyms you run, mobile shows gyms you train at. Multi-academy is native; v1 shows one active academy with a **switcher** if you belong to more than one.)*

---

## 2. Student mobile app (Expo)

### S1 · Sign in / Sign up  *(as light as possible)*
- **Social login** or **email + magic link** (passwordless — no password to invent). One tap where possible.
- **Fields:** first name, second name, phone, **email (required)**. Email is the reliable channel for cancellations and gym announcements, so it's not optional for members. Nothing else.
- Reached before joining (S2). On mobile v1 the student picks the academy by its ID; sign-in comes first, then the join.

### S2 · Join an academy  *(the onboarding spine)*
- **Mobile v1 (docs/issues/32):** the owner shares the academy's **ID — a plain 6-digit number**. The student **types the ID** in the app → we find the academy → *"Join **{Academy}**"* → confirm + minimal profile → a **pending** membership. No link, no deep link, no list to scroll.
  - Edge: no academy for that ID → clear "No gym found with that ID — check the number with your gym."
- **Web + a later mobile iteration:** opens via an **invite link** (deep link `matops://join/<code>` or an https universal link) — the academy is preselected. On mobile this returns after v1 (docs/issues/31); the invite links stay live for the web (per-role, incl. instructors).
- **No waiting wall.** The student lands straight on the schedule (S4) and can **book right away** (provisionally). Approval happens in the background.
- *(Joining a **second** academy later: enter another gym's ID while signed in → another pending membership → appears in the S7 switcher.)*

### S3 · Pending banner  *(not a blocker)*
No blank waiting screen. A **slim banner** on the schedule: "Pending approval — you can browse and book; your gym will confirm you soon." Bookings made now are **provisional** (§4). When the owner approves, the banner clears and a **push** ("You're in at {Academy}") lands.

### S4 · Schedule  *(home — the core screen)*
- This week's classes, grouped by day (Today first). Each row: **title · time · instructor · "N spots left"**.
- Optional discipline filter chip row (BJJ / No-Gi / …) — only if the academy uses disciplines.
- Tap a class → **S5**. Your already-booked classes show a **Booked** pill inline.
- Empty state: "No classes scheduled this week."

### S5 · Class detail + book/cancel
- Title, discipline, day/time, duration, instructor, capacity ("8 / 12").
- **Booking is never blocked.** Primary button:
  - Not booked → **Book** (optimistic; success toast). Pending members can book too; theirs is tagged **"pending approval"**.
  - When the class is at/over capacity → the count shows **red** ("**22/20 · may be busy**") and Book asks **"This class looks full — book anyway?"** → user decides; the owner manages the room.
  - Booked → **Cancel booking**.
- **Who's in the class:** **approved members** can see the **names** of other approved attendees. **Pending members and drop-ins show only as a count** (e.g. "+3 others"). A pending viewer sees only counts, no names. *(Owner/coach see everyone by name for attendance.)*
- Cancelled class → shown read-only as **Cancelled**.

### S6 · My classes
- **Upcoming** classes (confirmed and provisional, clearly labelled; cancel from here too).
- **Past** (attended) — a light history; read-only. Nice-to-have; can ship thin.

### S7 · Profile / account
- Name, phone, current academy, sign out.
- **Academy switcher** — shown only if the student belongs to >1 academy; switching changes the active academy and all data follows.
- **Notification settings** (optional, thin): toggle class reminders / cancellation alerts.

### S8 · Check in (QR)
- Tap **Check in** (or scan the gym's poster) → the app reads the **gym QR** → confirms *"Check in to {today's class}?"* → one tap → marked **present**.
- If not booked, this **books + attends** in the same tap. Works **even if the class is full** — you're physically there; capacity only governs reservations.
- The single lowest-friction action in the product: show up, one tap, tracked.

**Student v1 = 8 screens.** Core loop (S4 → S5 → booked) is two taps from open; checking in is one.

---

## 3. Owner / instructor web app (Next.js)

**Owner onboarding is seamless too (A3).** Same low-friction sign-in (social or email + magic link, minimal fields). "Start a gym" makes you the active owner at once — no waiting. Schedule setup has quick tools so building a week isn't a chore: **duplicate a template**, **copy a day**, and a "typical week" starter. The owner should reach a working schedule + printable QR in minutes.

### O1 · Dashboard  *(the "run the week" home)*
- **This week at a glance:** today's classes with booking counts; **pending-approvals** badge; quick counts (active members, upcoming classes).
- Direct actions: *Approve members*, *Take attendance*, *Add class*.

### O2 · Schedule (classes)
- **Week calendar** of concrete classes, each showing **N/Capacity** booked.
- Per-class actions: **cancel** (sends booked students a **push + email** — see §4), edit capacity/instructor, add a **one-off class**.
- Jump to **O3 templates** for the recurring engine.
- New/edited schedules **appear immediately** (classes are materialized on save; a daily job only extends the calendar forward).
- Empty state: "Create your first class."

### O3 · Recurring templates
- List of templates; **create/edit**: title, discipline, **days of week**, start time, duration, capacity, instructor, status (active/paused).
- Explains materialization plainly ("runs every Mon/Wed at 6:00 PM"). Pausing stops future generation; existing classes stay. Deleting soft-deletes (existing bookings preserved).

### O4 · Roster (members + leads)
- **Pending approvals** section: approve / reject. This covers **both students and coaches** — approving assigns the intended role (student → member features; instructor → schedule + attendance tools) and activates them. A pending person's bookings simply become normal bookings on approval.
- **Active members** list → member detail: role, attendance history, contact, remove/suspend.
- **Drop-in leads** section: **first-time visitors** who checked in via the gym QR without an account (name, phone, email, which class, consent flag). Kept for **follow-up** — the owner can send them an **app invite link (deep-linked to this gym)** to convert them into a member. Repeat visitors are nudged to register, so the form stays a first touch.
- **Academy ID:** a plain **6-digit number** shown to copy + share. Students enter it in the app to find and join the gym (S2, mobile v1 — docs/issues/32). Joining by ID lands **pending/view-only** as a student, same as an invite link.
- **Invite links:** generate/copy a shareable link **per role** (student / instructor). Either way the joiner lands **pending/view-only** until the owner approves — so a forwarded link never grants access on its own. One active link per role.

### O5 · Attendance
- Pick a class (today / recent past, ≤14-day backfill window) → see everyone present: **booked members** (confirmed + provisional), **self check-ins** (via QR), and **drop-ins** (from the public form).
- Mark **present / absent**, or **add a walk-in** (search a member). Self check-ins arrive already marked present — the owner just confirms.
- *(This is the payoff of QR check-in: most attendance is already filled in before the owner touches it.)*

### O6 · Settings
- Academy name, **time zone** (drives class materialization), disciplines toggle. **Owner-only.**
- **Venue QR:** view / print the gym's check-in QR poster (one static code per gym — covers both app check-in and the drop-in form).
- *(Invite links live in O4 Roster.)*

**Owner v1 = 6 screens.** Instructors see O1–O3, O5 (no O4 approval, no O6).

---

## 4. Cross-cutting rules

- **Uniform approval (students + coaches):** everyone joins via a link → **pending / view-only** (browse schedule, book, check in — no names, no tools) → owner approves → the intended role is granted (student features, or instructor schedule+attendance tools). A forwarded link never grants access by itself.
- **Capacity is a soft guide, not a gate:** booking is **never blocked**. A class shows "booked / capacity"; at/over capacity it turns **red** ("22/20 · may be busy") and asks the user to confirm. The owner manages the room. (Hard caps, priority, waitlists, no-shows, cancel cut-offs → next iteration.)
- **Privacy on the schedule:** only **approved** members see who's in a class (names). Pending members and drop-ins appear only as a count, and a pending viewer sees only counts. Owner/coach see names for attendance.
- **Check-in (QR):** one static **gym QR**. App users → book+attend in a tap; marks present even if the class is "full". No-app **first-time visitors** → the drop-in form (below).
- **Drop-in / lead form (public web, first visit):** the same gym QR opens a short **public page** (no login): first name, second name, phone, email (optional), and a **consent checkbox** ("OK for the gym to contact me"). Saved as a **lead + attendance**, no capacity impact. The owner follows up with an app link. QR-inside-the-gym is the anti-spam.
- **Notifications (v1 — push + email, no full comms domain):** a thin helper sends:
  - **Class cancelled** → **push + email** to every booked student (high-stakes — both channels).
  - **Class reminder** → push, ~2h before (a scheduled job).
  - **Membership approved** → push ("You're in at {Academy}").
  - Delivered via Expo Push (mobile) + Resend (email). *No live in-app updates (WebSockets) in v1* — screens stay fresh by light polling.
- **Time zones:** every academy has one; classes render in it. No per-user tz in v1.
- **Empty / error states** are first-class (crowded-niche UX bar): every list has a purposeful empty state; every mutation has an optimistic path + a human error toast.
- **Offline:** not supported in v1 (documented non-goal); the app assumes connectivity, degrades to a clear "you're offline" state.

### Edge rules (v1 defaults — the small cases, settled)

- **Editing a class:** change **time or instructor** → booked students are **notified** (push + email). **Cutting capacity** below current bookings is allowed (soft cap — just shows red). 
- **Editing a template:** applies to **future, non-cancelled** instances only; past and cancelled classes are untouched.
- **Deleting a class / template:** soft-delete; existing bookings/attendance are preserved; a deleted (cancelled) class notifies its booked students.
- **A pending person keeps attending:** the roster shows each pending member's **visit count** ("attended 3×") so the owner is nudged to approve them. No auto-approve.
- **Duplicate drop-ins:** leads are **grouped by phone** — one lead per person with a **visit count**, not a row per visit.
- **Sole owner:** an owner can **promote another member to owner** (co-owner) from the roster, so a gym is never left ownerless. Full ownership transfer / account deletion is deferred.
- **Removing / rejecting someone with history:** their **attendance and lead records are kept** (they did train); access is revoked. Re-joining later starts pending again.
- **QR scanned with no class on:** the app shows "No class right now"; the public form still captures the person as a **general visit lead** for that day.

---

## 5. Explicitly NOT in v1

Mirrors the map's Out-of-scope: **memberships / payments / billing**, **belts & rank progression**, **curriculum & games library**, a **full comms domain** (announcements + in-app DMs — *note: transactional push + email notifications ARE in v1, §4*), **live in-app updates / WebSockets**, **cross-academy aggregated views**, **session packs**, **multi-currency / i18n**, **super-admin UI**, **rich offline/sync**.

Clarifications from the friction wave:
- **Public *booking* page** stays OUT — but a controlled per-gym **check-in / drop-in lead form** IS in v1 (§4).
- **Capacity hygiene → next iteration:** hard caps / blocking a full class, priority for registered members, **waitlists**, **no-show tracking or penalties**, and **cancellation cut-offs** are all deferred. v1 shows a soft red "may be busy" warning and lets the owner manage the room.
- **Home widget** (today's classes + one-tap book/cancel) is a planned **fast-follow**, right after the v1 launch — not in the launch build (needs native widget code).

The architecture leaves seams for the deferred items ([architecture.md](./architecture.md) §8).

---

## 6. Definition of done (v1)

A new academy can: owner signs up → creates a recurring schedule → prints the **gym QR** and shares the **invite link** → a student joins on their phone (magic link, minimal info), sees the schedule at once, and **books before approval** (provisional) → the owner approves → the student **checks in with one QR tap** at the gym → a **drop-in without the app** is captured via the QR web form → attendance is mostly filled in before the owner lifts a finger. Both loops work end to end, with low student friction and full owner data, on a portable, expandable foundation.
