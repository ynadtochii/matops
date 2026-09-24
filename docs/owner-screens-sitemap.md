# Owner screens: sitemap and design pass plan

What this is: a map of every screen an owner can open on the web app, what sits on
each one, and what it lets them do. It is the input for a design pass that goes
page by page. It is not a spec change. Behaviour of record stays in
`docs/spec.md`; the visual rules stay in `docs/design.md`.

Read before the pass: `docs/design.md` (tokens, motifs, motion, voice),
`packages/domain/src/entity.ts` (who may open which path),
`apps/nextjs/src/app/_components/primitives.tsx` (the shared layout vocabulary).

## 0. Who sees what

Two levels of screen, both inside one shell.

- **Gym level** (the organization): `/overview`, `/people`, `/people/[userId]`,
  `/memberships`, `/settings`. Owner only. The current branch travels in a
  `?branch=` query so the sidebar keeps its place.
- **Branch level** (one entity): `/entities/[entityId]/...`. The route table in
  `packages/domain/src/entity.ts` decides what is offered. `runsBranch` is owner
  or manager. `isStaff` adds instructors.

Roles, shortest form:

| Screen | Owner | Manager | Instructor | Student |
| --- | --- | --- | --- | --- |
| Gym overview / People / Memberships / Gym settings | yes | no | no | no |
| Branch dashboard | yes | yes | yes | student view |
| Schedule, Roster, Reception, Coaches, Attendance | yes | yes | yes | no |
| Referrals, Branch settings | yes | yes | no | no |
| Membership, My classes, Profile | no (staff see none) | no | no | yes |

## 1. The shell (every page wears it)

Files: `_components/app-shell.tsx`, `shell-frame.tsx`, `entity-selector.tsx`,
`share-links-dialog.tsx`.

- Sidebar, two groups. The branch group is Dashboard, Schedule, Roster,
  Reception, Coaches, Referrals, Branch settings, Notifications. The Gym group
  is Gym overview, People, Memberships, Gym settings, Add branch.
- Count badges on Roster, Coaches, People, Memberships, Notifications. One query
  feeds them all (`stats.navigationSummary`). Each badge has four states:
  loading, error, unavailable, a number.
- Branch selector at the top. Switching is a link, never a mutation, and keeps
  the same screen when the target branch has it.
- Header: share link button, notification bell with an unread dot.
- Footer: avatar to profile, role label.
- Banners under the header: pending approval, and the dues strip for students.
- Sidebar extra: "Send someone a link" opens the share dialog (join link, QR,
  printable poster).
- Content width is per route: 1600px on Schedule, 768px on class and profile,
  1152px everywhere else.

Design notes for the pass: the two sidebar groups, the badge states, and the
branch selector are the parts a new owner meets first, so they set the tone for
every page below.

## 2. Gym level

### 2.1 `/overview` — Gym overview
`_components/overview-screen.tsx`, `setup-checklist.tsx`

- First run: a single card, "Create your first branch".
- Setup checklist, full size when the gym is new and compact later.
- **Needs attention**: one list built from four queries, grouped by reason.
  Payment claims, join requests, coach access requests, missing membership,
  bookings without access. Every row links to the place that resolves it.
- **Branches**: one card per branch with its stats, plus what is waiting there.
- A non-owner who lands here gets a plain list of their branches.

Known gaps: the metrics query (`stats.organizationMetrics`) is read but the
section is thin. Five separate queries means five loading and error states on
one screen.

### 2.2 `/people` — People
`_components/people-screen.tsx`

- Tabs: Members, Staff.
- Filters: search by name or email, branch, membership plan, status.
- One card per person: name, email, the branches they belong to, their plan.
- Checkbox selection, then **bulk assign to a plan**.
- **Add a student** dialog: name, email, branch, plan, with a live preview of
  what the first month will cost.
- **Paste emails** for bulk invite.

Known gaps: the row is a card holding a checkbox, a name, a branch list and a
plan. At 200 people it is a long scroll of soft cards with no column rhythm.

### 2.3 `/people/[userId]` — Person
`_components/organization-person-screen.tsx`

- Header: name and email.
- Memberships held, with the plan, the branch, and the month state.
- Actions: assign a plan, schedule a plan change for the 1st, cancel a change,
  suspend, end a membership. A waiting payment claim is **shown** here, not
  answered: confirming or rejecting it is on Memberships.
- Branch assignment: add the person to a branch, approve them per branch.
- Payment history per assignment.
- Archive and restore the person.

Known gaps: this is the densest owner screen in the app, about 800 lines, and
every action is a dialog. Worth a hierarchy pass before anything cosmetic.

### 2.4 `/memberships` — Memberships
`_components/memberships-screen.tsx`

- Tabs: Payments, Needs action, Plans.
- **Payments**: the month board. Everyone holding a plan this month, their
  state (paid, silent, reminded, claimed), and a mark-paid action.
- **Needs action**: payment claims waiting for a yes or no, bookings without
  access, missing memberships with a re-check and a reconcile run.
- **Plans**: a card per plan with price, branches covered, holders. Dialogs for
  a new plan, a price change, and branch coverage with a preview and a version
  check on save.

Known gaps: three tabs, six sub-sections, four dialogs, roughly 1200 lines. The
biggest single screen in the product.

### 2.5 `/settings` — Gym settings
`_components/organization-settings-screen.tsx`

- Gym name.
- Optional features (modules) with on and off switches.
- Account: the commercial plan, its status, what is offered.
- Membership settings: the grace period, the booking rule, bank details for
  transfers.
- Branches: per branch, the switch from branch dues onto shared memberships,
  with a preview of who it affects.

### 2.6 `/staff`
Redirect to `/people?tab=staff`. Kept alive for old links only.

## 3. Branch level

### 3.1 `/entities/:id` — Dashboard
`_components/dashboard-screen.tsx`

- **Needs you**: an instrument panel of equal channels on a hairline grid. A
  count and a label per job. Empty jobs are dropped, not drawn empty. First run
  replaces it with a two or three step opening guide.
- A caption under the panel: active members, classes this week.
- **Today** (or Tomorrow after the last class ends): the day's classes on a
  vertical rail with a now line. Opening a class opens the roster in a dialog.
- **Who's drifting**: members who trained and went quiet. Owner only.
- A student who lands here gets the student schedule instead.

Known gaps: the layout declares a two column grid with a 20rem right rail and
puts nothing in it, so the whole page sits in the left column at large widths.
The Insights rail from v4.9 is gone.

### 3.2 `/entities/:id/schedule` — Schedule
`_components/schedule-screen.tsx`, `schedule.tsx`, `templates.tsx`,
`curriculum.tsx`, `week-grid.tsx`, `schedule-poster.tsx`

Tabs: This week, Templates, Curriculum (BJJ only).

- **This week**: a week grid, previous and next week, back to this week. Per
  class: edit, cancel, share on the public booking link. Export a poster.
- **Templates**: recurring classes, create and edit, and a Rebuild schedule
  action that refills the 180 day horizon.
- **Curriculum**: a block library on one side, per track timelines on the other.
  Drag to place, reorder, and resize a block by its bottom edge. A note per run.
  A switch for whether students see the theme.

Known gaps: the widest screen in the app (1600px). Three tabs that look like
three different products. Curriculum alone is 33k of TSX.

### 3.3 `/entities/:id/members` — Roster
`_components/members-screen.tsx`, `members.tsx`, `member-detail.tsx`,
`leads.tsx`, `venue-checkin.tsx`, `invites.tsx`

Tabs: Requests, Members, Drop-in leads, Archived.

- **Requests**: approve or decline a join request.
- **Members**: search, one row per member, actions to suspend, archive, and
  permanently delete.
- **Drop-in leads**: the lead pipeline with stages, source, and a funnel.
- **Archived**: who left, and restore.
- Member detail opens **inline under the row**, not in a dialog, with its own
  tabs: Overview, Attendance, Rank, Notes, Membership.
- Invite link card and the venue check-in block.

### 3.4 `/entities/:id/reception` — Reception
`_components/staff-reception.tsx`, `reception-classes.tsx`

- Pick a class that is on now or next.
- Search a member and check them in, or book them onto the class.
- Shows the roster as it fills.

Known gaps: new, still in flight (`docs/issues/138`, `139`). It is a desk
screen, often on a tablet, so it needs bigger targets than the rest of the app.

### 3.5 `/entities/:id/coaches` — Coaches
`_components/coaches-screen.tsx`, `staff.tsx`, `invite-link-card.tsx`

- Window tabs: This month, Last month, Last 90 days.
- A card per coach: classes led, needs review, cancelled. Expanding it shows a
  breakdown by weekday and by week, then the class list.
- Pending coach requests with approve and decline.
- Staff list and the instructor invite link.
- An instructor sees only their own card.

### 3.6 `/entities/:id/referrals` — Referrals
`_components/referrals-screen.tsx`

- Summary of who brought whom, with money grouped by currency.
- A card per referrer, the students they brought, and the status of each.
- A dialog to record a referral, which groups students into "nobody credited
  yet" and "already recorded".
- Per student referral history.
- BJJ branches only, and only when the module is on.

### 3.7 `/entities/:id/settings` — Branch settings
`_components/settings-screen.tsx`, `academy-identity.tsx`,
`academy-location.tsx`, `public-booking.tsx`, `academy-danger-zone.tsx`,
`reception-setup.tsx`

- Identity: branch name, six digit join code.
- Location: time zone, country, address, map link.
- Public booking (BJJ only): the master switch, the API key, allowed websites,
  the shared `/book/<code>` link.
- Reception screen setup (through the check-in block).
- Danger zone: delete the branch. Owner only.

Known gaps: four stacked cards with no page structure between them. No section
navigation on a screen that keeps growing.

### 3.8 `/entities/:id/attendance` — Attendance
`_components/attendance.tsx`, `class-roster.tsx`

- Past classes that still need a review.
- Open one to mark who attended, with mark all present.
- No sidebar item. Reached from the dashboard queue.

### 3.9 `/entities/:id/class/[id]` — Class detail
`_components/class-detail.tsx`

- Title, day and time.
- Access that needs action.
- Who is booked, with a full class warning.
- Narrow column (768px).

### 3.10 `/entities/:id/notifications` — Notifications
`_components/notifications-screen.tsx`

- The feed of what this branch has sent, read and unread.
- Email delivery issues, with send remaining and retry failed.
- Mark all read.

### 3.11 Student screens an owner can still reach
`/training` (My classes), `/payments` (Membership), `/profile` (Profile),
`/entities/:id` in student mode. Staff do not get these in the sidebar. They
matter to the pass only because the shell is shared.

## 4. Outside the shell

Not owner screens, but an owner passes through them.

- `/start` — start a gym.
- `/sign-in` — magic link and Google.
- `/reception` — the standalone desk device screen, no chrome, not indexed.
- `/join/[token]`, `/checkin/[academyId]`, `/book/[code]`, `/privacy` — public.

## 5. What the pass works inside

The design system exists and is documented. The pass improves screens within it
rather than replacing it.

- Tokens: `tooling/tailwind/theme.css`. Violet `#6a4dff` as the single brand
  hue, warm stone light theme, pure black dark theme, functional callout colours
  per theme, radius 0.2rem, Geist and Geist Mono.
- Layout vocabulary: `primitives.tsx` gives `cardClass`, `Panel`, `Section`,
  `SectionHeading`, `Stat`, `Eyebrow`, `CountBadge`, plus the entrance,
  stagger, and resolve motion constants.
- Rules: `docs/design.md` sections 1 to 7.

Anything the pass wants to change at token level is an ADR, not a screen edit.

## 6. Proposed loop order

Ordered by how much an owner uses the screen times how far it currently sits
from the design language.

1. Branch dashboard. The daily screen, and the dead right rail is a real bug.
2. Gym overview. The first screen after login for an owner.
3. Memberships. The largest screen, and where the money lives.
4. People and Person. The second largest, and the densest.
5. Roster. Four tabs and a detail view inside a dialog.
6. Schedule. Three tabs that need to read as one screen.
7. Coaches.
8. Branch settings and Gym settings, together, so the two settings screens match.
9. Reception. Needs a tablet pass, not a desktop pass.
10. Referrals, Attendance, Class detail, Notifications. Small, quick.

## 7. Per page checklist for the loop

Same questions on every screen, so the pass stays consistent.

1. What job does an owner come here to do, and is it the first thing they see?
2. Hierarchy: one primary action, everything else quieter.
3. Loading, error, empty, and first run. All four drawn, none of them an
   afterthought.
4. Density: does the row shape suit 5 items and 500?
5. Tokens only. No hardcoded colour, no new radius, no new shadow.
6. Motion: entrance once, press feedback on every control, reduced motion
   respected.
7. Copy: plain words, active voice, the same verb from button to toast.
8. Keyboard focus visible, targets at least 44px, labels on every control.
9. Responsive from 400px up.
10. Nothing added that the screen did not already need.
