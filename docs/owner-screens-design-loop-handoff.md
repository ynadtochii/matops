# Handoff: owner screens design loop (matops)

Written 2026-09-16. For a fresh agent picking up a page by page design pass on
the owner facing web screens.

## What the last session did

Read the whole owner route tree and wrote the sitemap plan:

**`/Users/kuna/projects/matops/docs/owner-screens-sitemap.md`**

That file is the input for this work. It holds the route list, what each screen
contains and does, per screen known gaps, the proposed loop order, and a ten
point checklist to run on every page. Do not restate it here or in any new doc.
Read it first.

Nothing was changed in the app. No code edits, no commits.

## What the next session does

Run the loop from section 6 of the sitemap: one owner screen per iteration,
improve it, move on. Section 7 is the checklist for each page.

Order as proposed: dashboard, gym overview, memberships, people and person,
roster, schedule, coaches, both settings screens, reception, then the four small
ones.

Start with the branch dashboard. It has a real bug to fix, not only polish:
`apps/nextjs/src/app/_components/dashboard-screen.tsx:332` declares a two column
grid with a 20rem right rail and puts one child in it, so the page sits in the
left column at large widths. The v4.9 Insights rail is gone.

## Rules this work runs under

From `/Users/kuna/.claude/CLAUDE.md` and `/Users/kuna/projects/matops/CLAUDE.md`,
both auto loaded, so read them rather than trusting this summary. The ones that
bite hardest on a design loop:

- **Never run tests.** Not unit, not e2e, not a suite. Write or update them, then
  hand the user the command. `pnpm lint` and `pnpm typecheck` are fine to run.
- **Zero comments on edits.** No comment next to a line you touched, no docblock
  on a field you added. Only a genuine non obvious why.
- **Plain language in every output.** No em dash or en dash as punctuation. Short
  sentences, active voice, plain words. This covers chat replies, docs, commit
  messages, and anything a subagent returns.
- **Read a file before editing it.** Absolute paths.
- **Do not commit unless asked.** No AI co author trailer.
- **Definition of Done** (project CLAUDE.md): if user visible behaviour changed,
  update `docs/spec.md`; if a technical decision changed, update
  `docs/architecture.md` and append an ADR under `docs/issues/`; flip the cells in
  `docs/roadmap.md`; add one line to `CHANGELOG.md`.

## Design system: work inside it

Already built and documented. A design pass improves screens within it. Changing
a token is an ADR, not a screen edit.

- `docs/design.md` sections 1 to 7: colour, typography, radius, surface, button
  weight, motifs, components, motion, voice, logo, status.
- `tooling/tailwind/theme.css`: the tokens. Violet `#6a4dff` as the single brand
  hue, warm stone light theme, pure black dark theme, per theme callout colours,
  radius 0.2rem, Geist and Geist Mono.
- `apps/nextjs/src/app/_components/primitives.tsx`: the shared layout vocabulary.
  `cardClass`, `Panel`, `Section`, `SectionHeading`, `Stat`, `Eyebrow`,
  `CountBadge`, plus `ENTER`, `stagger`, `RESOLVE`, `TAP`.
- `packages/domain/src/entity.ts`: the route access table. It decides what each
  role is offered, so it tells you which states a screen must draw.

## Repo state, 2026-09-16

- Branch is **`main`** with **66 uncommitted files**. The project rule is to work
  on `dev`, and merging `dev` into `main` deploys to production. Ask the user how
  they want this handled before committing anything.
- The uncommitted work is a reception feature in flight, plus a playwright
  addition. See `docs/issues/138-reception-class-checkin.md`,
  `docs/issues/139-reception-permanent-link.md`,
  `docs/reception-implementation-plan.md`. Reception is new and unfinished, which
  is why it sits ninth in the loop order.
- Do not tidy or revert that work as part of a design pass.

## Running the app to look at a screen

- `pnpm dev:next` serves on **http://localhost:3004**. Port 3000 is kept free on
  purpose.
- Sign in with the magic link form, then copy the `[auth] magic link ...` URL
  printed in the terminal into the browser. No email provider needed.
- The user's Chrome profile is already signed in as owner of the **Alma beta**
  seed academy (code `990001`), which has demo data on every owner screen except
  curriculum, which the seed leaves empty.
- Screenshots have failed in this setup before. Measure the DOM with JS instead.
- Demo data commands: `pnpm db:seed`, `db:seed:down`, `db:seed:reset`.

## Suggested skills

Invoke these rather than working from memory.

- **`frontend-design:frontend-design`** at the start of each screen, for aesthetic
  direction and for the list of generated looking defaults to avoid.
- **`better-interface`** when a whole screen needs one ranked holistic review.
  It coordinates the discipline specific ones below.
- **`better-layout`** for the dashboard rail, the settings stacks, and anything
  with a density problem.
- **`better-ui`** for states, icons, shadows, and subtle motion.
- **`better-typography`** and **`better-colors`** only if a screen actually needs
  them. The tokens are already set, so most screens will not.
- **`better-accessibility`** on every screen. Focus, keyboard, targets, labels.
- **`better-writing`** for labels, buttons, errors, and empty states. Checklist
  item 7 is a copy pass.
- **`frontend-review`** to evaluate a screen before changing it.
- **`ponytail:ponytail`** when a fix starts growing. These screens are already
  large; Memberships is about 1200 lines and Curriculum about 33k of TSX.
- **`loop`** if the user wants the pass to run on a cadence without being asked
  each time.
- **`run`** to launch the app and confirm a change works in the real screen.

Skip `redesign-existing-projects`. It is aimed at a site with no design system,
and this one has `docs/design.md`.

## Open question for the user

Whether each screen lands as its own commit on `dev`, or the whole pass lands as
one slice with one ADR. That decides how much doc work each loop iteration
carries under the Definition of Done.

---

# Epic: owner screens design pass

This file is the source of truth for the pass. State lives here, not in a
session. One loop iteration finishes one unchecked task and logs it.

## Goal

Every owner facing web screen reads as one product built to `docs/design.md`.
Each screen gets the section 7 checklist run on it: the job first, one primary
action, all four data states drawn, a row shape that survives 500 items, tokens
only, motion that answers an action, plain copy, visible focus and 44px targets,
responsive from 400px, and nothing added the screen did not need.

## Constraints

- Work inside the design system. A token change is an ADR, not a screen edit.
  `tooling/tailwind/theme.css` and `docs/design.md` sections 1 to 7 stay as they
  are unless a task says otherwise.
- Reuse `_components/primitives.tsx` (`cardClass`, `Panel`, `panelCell`,
  `Section`, `SectionHeading`, `Stat`, `Eyebrow`, `CountBadge`, `ROSTER_LIST`,
  `ROSTER_ROW`, `ENTER`, `stagger`, `RESOLVE`, `TAP`) before writing anything
  new. New shared shapes go in that file, not in a screen.
- Never run tests. `pnpm lint` and `pnpm typecheck` after each task, and hand
  the user the test command at the end.
- Zero comments on the lines you touch. Only a genuine non obvious why.
- Plain language everywhere. No em dash or en dash as punctuation.
- Do not commit. The branch is `main` with a reception feature in flight; the
  project rule is to work on `dev`. The user decides when and where this lands.
- Do not touch the in flight reception work outside its own task.
- The whole pass is **one slice with one ADR**, so the Definition of Done
  paperwork is the last task, not a step in every iteration. That is the answer
  to the open question above unless the user says otherwise.

## Tasks

- [x] 1. Branch dashboard. `dashboard-screen.tsx`. Fix the dead 20rem right rail
  at `:332` (one child in a two column grid), then decide what the rail holds or
  drop the grid. Run the checklist.
- [x] 2. Gym overview. `overview-screen.tsx`, `setup-checklist.tsx`. Five queries
  means five loading and error states on one screen; give them one treatment.
  Thicken the metrics section or cut it.
- [x] 3. Memberships. `memberships-screen.tsx`. Three tabs, six sub-sections,
  four dialogs, about 1200 lines. Hierarchy pass before anything cosmetic.
- [x] 4a. People list. `people-screen.tsx`. Give it a column rhythm that works
  at 200 rows.
- [x] 4b. Person. `organization-person-screen.tsx`. Rank the actions. About 760
  lines and every action is a dialog, so it is its own pass.
- [x] 5. Roster. `members-screen.tsx`, `members.tsx`, `member-detail.tsx`,
  `leads.tsx`, `invites.tsx`, `venue-checkin.tsx`. Four tabs plus a detail view
  in a dialog.
- [x] 6. Schedule. `schedule-screen.tsx`, `schedule.tsx`, `templates.tsx`,
  `week-grid.tsx`, `curriculum.tsx`. Make three tabs read as one screen.
- [x] 7. Coaches. `coaches-screen.tsx`, `staff.tsx`, `invite-link-card.tsx`.
- [x] 8. Both settings screens together. `settings-screen.tsx`,
  `organization-settings-screen.tsx` and their cards. Give them page structure
  and section navigation.
- [x] 9. Reception. `staff-reception.tsx`, `reception-classes.tsx`,
  `reception-setup.tsx`. A tablet pass, not a desktop pass. Check
  `docs/issues/138` and `139` first; the feature is still in flight.
- [x] 10. The four small ones: Referrals, Attendance, Class detail,
  Notifications.
- [x] 11. Definition of Done. Update `docs/spec.md` where behaviour changed,
  `docs/architecture.md`, append the ADR under `docs/issues/`, flip the cells in
  `docs/roadmap.md`, add one line to `CHANGELOG.md`, and hand the user the test
  command.

## Log

- 2026-09-16 Planning pass. Turned this handoff into the epic file: goal,
  constraints, eleven tasks from section 6 of the sitemap, this log. No code
  touched. Decided the pass is one slice with one ADR, so doc work is task 11.
- 2026-09-16 Task 1, branch dashboard. `dashboard-screen.tsx` and
  `skeletons.tsx`.
  - The rail now holds "Who's drifting", moved out of the left column into a
    19rem `aside`. The grid is two columns only when `isOwner`, because an
    instructor has no drifting list and would get the empty rail back.
  - Drift rows restacked for the narrow column: name and badge on one line, the
    last-trained line under it. Capped at `DRIFT_SHOWN` = 6 with a "See all N"
    link, since the query returns every drifting member with no server cap.
  - Real bug beyond the rail: a failed query read as a job at zero, so a broken
    roster read showed "All clear". The panel now collects `queueErrors` and
    draws one full-width notice naming what could not be checked, with a single
    Try again that refetches all of them. `Intl.ListFormat` joins the names.
  - Deleted the duplicate green "All past classes reviewed" link under the
    panel. The panel's own "All clear." notice already says it, and the link
    showed even when other jobs were waiting.
  - Copy: the screen said "class"/"classes" everywhere, which is wrong for a
    general space. It now uses `branchWords`. "No classes today." said "today"
    even when the section was showing tomorrow. Dropped the "Add a class →"
    arrow.
  - Accessibility: `DriftRow` was a link with no visible focus ring. Both rows
    got `FOCUS_RING` and `PRESS`, and `min-h-11` for a 44px target.
  - `SkeletonQueue` drew four stacked cards that resolved into one short
    hairline strip, and `SkeletonDayRail` drew cards where the real thing is a
    vertical rail. Both are now cut to the shape they resolve into, so loading
    no longer jumps the layout. Dropped the dead `dot` and `variant` props from
    `SkeletonRow`; `variant` was accepted and ignored, and only the one call
    site passed it.
  - Verified: `pnpm typecheck` green, eslint clean on both files. Not opened in
    a browser this pass.
- 2026-09-16 Task 2, gym overview. `overview-screen.tsx` only.
  - The six queries had six hand-rolled states: two "Loading…" paragraphs and
    two different inline error boxes, none of them the shared vocabulary. They
    are now `SkeletonLines` / `SkeletonRows` for loading and one local
    `PartialFailure` strip for both failures. `ErrorState` is deliberately not
    used here: a failed figure does not stop an owner opening a branch, so the
    strip is the honest weight. Both retries now say "Try again", matching
    `ErrorState` and each other.
  - Deleted `OverviewSection`. It was a second heading language on the screen an
    owner meets first. Both sections now use `SectionHeading`, which is what 22
    other call sites use, and "Needs attention" gets the real `CountBadge`
    instead of a look-alike brand pill.
  - Real bug: `BranchCard` took `known = metrics.data !== undefined`, so while
    the figures were still loading every card said "Not loaded". Loading was
    being drawn as failure. It now takes three states and shows a `Bar` while
    in flight. Dropped the stat whose visible text said "Not loaded" and whose
    `aria-label` said "unavailable".
  - Hierarchy: the branch card led with "Open branch →" and buried the work
    waiting in the last muted line. `branchRows` already sorts by `waiting`, so
    the card now leads with the name, a `CountBadge` of what is waiting, and the
    breakdown under it. Figures moved to context below.
  - Removed the three `→` glyphs and the hover-translate on the card arrow.
    Fifty attention rows each carried a decorative arrow.
  - Focus: four hand-written `focus-visible:outline-*` rules, one of them
    `outline-brand` where its neighbours used `outline-ring`. All four are now
    `FOCUS_RING`. Attention rows got `min-h-11`.
  - Deleted a dead `contents ... xl:flex` wrapper around a single section, and
    a wrapper div that only carried `ENTER`.
  - Copy: the first-run heading said "Add your first branch" over a button that
    said "Create your first branch". Both say Add now.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean, prettier applied. Not
    opened in a browser this pass.
- 2026-09-16 Task 3, memberships. `memberships-screen.tsx` only.
  - The hierarchy fix: the tabs now carry counts. "Payments" wears the waiting
    claims, "Needs action" wears missing memberships plus bookings without
    access. Before, the tab named "Needs action" gave no sign whether anything
    needed action, so an owner had to click to find out.
  - Swapped the hand-rolled tab nav for the shared `Tabs`, which 7 other screens
    use and which already had the count badge and the travelling rail. Kept the
    URL param as the seed value, the same way `people-screen.tsx` does, so
    `/memberships?tab=access` stays linkable from the overview.
  - The counts cost nothing: the shell calls the same three queries with the
    same keys as the sections, so React Query serves one request.
  - Real bug: `MonthBoard` had `disabled={mark.isPending}` on every row's
    button, so marking one person paid deadened all the others until the request
    came back. It is now per-row `busy`, matching what the claims list already
    did. `Reconcile` and the claims Confirm also moved to the `busy` prop
    instead of a disabled button with a swapped label, so the action keeps its
    name.
  - Killed the card-in-card: both payment sections were a `cardClass()` wrapper
    holding a list of bordered rows. Now `SectionHeading` plus a flat list of
    card rows, which is what the dashboard and overview do.
  - Third heading language gone. The screen used `h2 text-base font-semibold`
    inside cards and `Section` in one place. All five sub-sections now use
    `SectionHeading`, and the page title uses `PageHeader`.
  - Dropped the empty claims block. Its usual state is nothing to review, and it
    was drawing a heading plus a sentence saying so above the month board every
    day. It renders `null` now; the tab count carries the news.
  - Copy: deleted the page subtitle that restated the three tab names, and the
    "Plans" heading inside the Plans tab.
  - Not done here: the four dialogs (new plan, price change, coverage) keep
    their current shape. They are a task of their own if the pass wants them.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean, prettier applied. Not
    opened in a browser this pass.
- 2026-09-16 Task 4a, the people list. `people-screen.tsx` only. Split task 4 in
  two: the person screen is ~760 lines of dialogs and deserves its own
  iteration, so it is now 4b.
  - The gap was "200 soft cards with no column rhythm". The list is now one
    bordered container with hairline rows on a shared grid template, plus a
    header strip naming the columns: Person, Membership, Visits 30d, Branches.
    One `cols` const drives the header and every row, so they cannot drift.
  - Visits came out of the middle of the email line, where it read " · no visits
    in 30 days" as prose, and became a mono tabular column. That is the column
    an owner scans to find who stopped coming.
  - Branch badges were `Button variant="outline"`. At 200 people with two
    branches each that is 400 outline buttons, all reading as decisions when
    they are links. They are chips now (`BranchChip`), with the role, the status
    and the warning as separate pieces instead of one concatenated string.
  - Small bug in that string: the warning was `" ·  ⚠"` with a double space. The
    chip now uses `text-warning border-warning/40` like `DriftBadge`, plus a "!"
    and an sr-only "membership needs attention", so it is not hue alone.
  - `BulkAssign` appeared *below* the list. Select somebody at the top of 200
    rows and the action was 200 rows away. It now sits above the rows, sticky,
    with a "N selected" count beside the total.
  - The "12 people" count moved from the bottom of the page to the top of the
    list, where it describes what is under it.
  - Status filter options rendered raw lowercase values. Capitalised.
  - Mobile: the grid stacks below `sm`, the header strip hides, and the visits
    cell grows a visible "visits in 30 days" suffix so a bare number is never
    alone on a line.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean, prettier applied. Not
    opened in a browser this pass.
- 2026-09-16 Task 4b, the person screen. `organization-person-screen.tsx` only.
  - The ranking problem: every action on the screen was `size="sm"
    variant="outline"`, so Change plan, Pause and End read as three equal
    choices, and Approve was a solid `primary` repeated down every pending
    branch. `docs/design.md` §1.5 already decides this mechanically, so I
    applied the rule rather than inventing one: affirmative row actions
    (Approve, Resume, Change plan, both Add buttons) are `secondary`, neutral
    ones stay `outline`, and End, whose confirm is a `destructive` fill, becomes
    `destructive-outline`.
  - Archive person got the §1.5 worked example instead: Restore sits next to it,
    so it is not the point of no return. Its confirm is now `variant="primary"`
    and the trigger stays `outline`.
  - Real bug, the same class as the month board: one screen-wide `busy` ORed six
    mutations and disabled every button on the page. Pausing one membership
    deadened Approve on every branch and End on every other membership. Each
    control now watches only its own mutation, keyed on the row, and shows the
    `busy` spinner rather than going dead.
  - Hierarchy: a waiting payment claim was the fifth line down inside a card, in
    11px brand text. An owner arriving from the overview's claim link landed on
    a page where the thing they came for was nearly invisible. It is now a
    "Says they paid" pill beside the plan name, and the scheduled plan change
    moved up with it. The figures moved below.
  - Accessibility: the three section headings were `Eyebrow`, which renders a
    `<p>`, so the screen had nothing between `h1` and the content. They are
    `SectionHeading` (h2) now, and Branches carries a count of pending requests.
  - Accessibility: `Add another membership` was an `Eyebrow as="span"` above a
    `Select` with an `id` and no `htmlFor`, so the control had no accessible
    name. Both inline forms use a real `Label` now.
  - `{assign.isPending ? "Adding…" : "Add"}` became the `busy` prop, so the
    action keeps its name.
  - Noticed, not fixed: `docs/owner-screens-sitemap.md` §2.3 lists "confirm or
    reject a payment claim" as an action on this screen. The code only displays
    the claim; confirming happens on Memberships. That is a doc or scope
    question, not a design edit.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean, prettier applied. Not
    opened in a browser this pass.
- 2026-09-16 Task 5, the roster. `members-screen.tsx`, `members.tsx`,
  `member-detail.tsx`. This screen was already in good shape: it used `Tabs`
  with a count, per-row `rowBusy`, `ConfirmDialog` with the right variants and
  `destructive-outline` triggers. So the pass is narrower than the last four.
  - Hierarchy: "How students join" sat above the tabs, so the first thing on the
    daily screen was a setup step. It moved below the tab content. Same move
    inside the leads tab, where the check-in poster block sat above the lead
    pipeline the tab is named after.
  - The Requests empty state was a dead end ("New sign-ups show up here"). It
    now points at the student link below it.
  - `member-detail.tsx` carried the same two bugs the person screen had. One
    `busy` const ORed four mutations, so marking one membership paid deadened
    Pause and End on every other one. And "Mark paid" was `variant="primary"`
    repeated down a list, which §1.5 forbids in as many words. Both fixed:
    per-row `busy`, and `secondary`.
  - Behaviour change worth a spec line in task 11: **ending a membership from
    the member detail had no confirmation**, while the identical action on the
    person screen opens a `ConfirmDialog`. The two doors now agree, using the
    same title and wording, and the trigger is `destructive-outline`.
  - Four more buttons dropped the hand-rolled `Spinner` plus label swap
    ("Approving…", "Adding…", "Saving…") for the `busy` prop, so the action
    keeps its name. `Spinner` is no longer imported by `member-detail.tsx`.
  - Archived rows used `Eyebrow` (mono, uppercase, 10px) for "student · joined 4
    Mar 2025", which uppercased a date and made the archived list a different
    shape from the member list. Now the same muted line `MemberRow` uses.
  - Open question, not decided here: `CountBadge` is documented as the brand
    spark for "N things want you", but `people-screen.tsx` uses it for plain
    totals on its tabs. That is a vocabulary question for an ADR, not a screen
    edit, so the roster tabs still count only Requests.
  - Noticed: `docs/owner-screens-sitemap.md` §3.3 says member detail "opens with
    its own tabs" in a dialog. It opens inline under the row. Worth correcting
    in task 11.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean, prettier applied. Not
    opened in a browser this pass.
- 2026-09-16 Task 6, schedule. `schedule-screen.tsx`, `schedule.tsx`,
  `templates.tsx`, `curriculum.tsx`, `primitives.tsx`.
  - "Three tabs that look like three different products" turned out to be
    literal: three heading treatments. This week had no headings at all,
    Templates had a hand-rolled `h2 text-lg font-semibold` next to one
    `SectionHeading`, and Curriculum had two `h3`s carrying a byte-for-byte copy
    of `Section`'s own label classes.
  - Fixed by naming that look once. `SECTION_LABEL` is now exported from
    `primitives.tsx`, `Section` uses it, and Curriculum's two `h3`s use it
    instead of the copy. Templates' `h2` became a `SectionHeading` with "New
    template" in its action slot, so the two sections in that tab match.
  - The Schedule tab was the only tabbed owner screen not keeping its tab in the
    URL, so `/schedule` always opened on This week and Templates and Curriculum
    could not be linked. It now seeds from `?tab=`, the same way people,
    memberships and the roster do, and the panel carries `key` + `RESOLVE` like
    the roster's.
  - Four more label-swapping buttons moved to the `busy` prop: "Adding…",
    "Saving…", "Extending…", "Rebuilding…". `Spinner` is no longer imported by
    `schedule.tsx` or `templates.tsx`.
  - Copy: the page subtitle described two of the three tabs.
  - Left alone on purpose: Curriculum's board-level `busy`. Unlike the row
    `busy` bugs elsewhere, a write there ripples through every later placement,
    so locking the whole board while one lands is correct.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean on all five files,
    prettier applied. Not opened in a browser this pass.
- 2026-09-16 Task 7, coaches. `coaches-screen.tsx`, `staff.tsx`. Another screen
  already close to the language: `SectionHeading` with a count, `Tabs`,
  `ConfirmDialog` with `destructive-outline`, `ENTER` / `RESOLVE` and a stale
  fade on the window switch. Three real fixes, no restyling.
  - Failure read as nothing to do, the same bug the dashboard had. The coach
    requests section began `if (memberList.isPending || memberList.isError ||
    waiting.length === 0) return null`, so a failed roster read drew no requests
    and no sign anything had failed. Error is now its own branch with a retry.
  - `staff.tsx` passed one screen-wide `busy` into every `StaffRow`, so
    suspending one coach greyed out every other row's menu. Now `rowBusy` keyed
    on the member, which is what `members.tsx` already did. It takes
    `string | null` because a manager who does not train at the branch has no
    `memberId` (v7.7, ADR 129).
  - The Approve button's spinner was `busy && approve.isPending`, which could
    light up on the wrong row when two requests were in flight. Keyed on the row
    like its neighbours.
  - `invite-link-card.tsx` needed nothing: its variants already follow §1.5.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean, prettier applied. Not
    opened in a browser this pass.
- 2026-09-16 Task 8, both settings screens. `settings-screen.tsx`,
  `organization-settings-screen.tsx`, `academy-identity.tsx`,
  `academy-location.tsx`, `academy-danger-zone.tsx`.
  - The two screens spoke different languages. Branch settings used `<section>`
    plus `SectionHeading`; gym settings wrapped every section in a `cardClass()`
    box headed by an `Eyebrow`. `Eyebrow` renders a `<p>`, so the whole gym
    settings screen had no `h2` at all. Five headings became `SectionHeading`
    and the card wrappers came off, so both screens now read as one stack of
    labelled sections.
  - `academy-identity.tsx` opened branch settings with an unlabelled bordered
    box holding the name and the join code. It has a heading now, "Name and join
    code", so the screen no longer starts mid-sentence.
  - Both pages were titled "Settings" and told apart only by a subtitle listing
    their sections. They are now "Branch settings" and "Gym settings", matching
    what the sidebar already calls them, and each subtitle says where the other
    kind of setting lives rather than enumerating its own.
  - Six more label-swapping buttons moved to the `busy` prop, across both
    screens and the danger zone's `AlertDialogAction`.
  - Not built, deliberately: the sitemap asks for section navigation on a screen
    that keeps growing. At four and five sections a sticky in-page nav would be
    more chrome than the content it indexes. Consistent headings buy the same
    scannability for nothing. Worth revisiting when either screen passes about
    eight sections.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean on all five files,
    prettier applied. Not opened in a browser this pass.
- 2026-09-16 Task 9, reception. `staff-reception.tsx`, `reception-classes.tsx`,
  `reception-setup.tsx`. Deliberately the lightest pass of the eleven: ADR 138
  says the feature is implemented locally with tests and a real iPad check still
  pending, and the handoff says not to tidy that work. So nothing here touches
  behaviour, state or the token flow.
  - The tablet sizing was already right and needed no pass: `min-h-16` class
    rows, `min-h-24` action cards, `min-h-12` inputs and buttons, and every time
    formatted in the branch zone rather than the viewer's.
  - What did not match: reception had invented a third eyebrow. Five hand-
    written label strings across two files, at `tracking-wider` and
    `tracking-wide`, neither matching `Eyebrow` (10px) nor `Section`'s label
    (11px, `tracking-[0.16em]`). All five now use the `SECTION_LABEL` const that
    task 6 extracted, so the desk reads as part of the same product.
  - Three more label-swapping controls in `reception-setup.tsx` ("Rotating…",
    "Disabling…", "Creating link…") lost the swap. The two confirm labels are
    now constant strings, which also means the `ConfirmDialog` no longer renames
    its own confirm button while the request is in flight.
  - Left alone on purpose: the screen-wide `busy` in both files. Unlike the list
    screens, a desk handles one person and one class at a time, so locking the
    screen while a check-in lands is right.
  - Still outstanding from ADR 138, not design work: the real iPad check on
    autofill and history.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean, prettier applied. Not
    opened in a browser this pass.
- 2026-09-16 Task 10, the four small screens. `notifications-screen.tsx`,
  `class-detail.tsx`. Referrals and Attendance needed nothing.
  - **Attendance** was the cleanest screen in the pass: skeleton, error and
    empty all drawn, buttons already sized. No edit.
  - **Referrals** already uses `SectionHeading` with a count and `Eyebrow`. Its
    one `return null` is a presentational component given data, not a query
    failure being hidden, so it stays. The `font-mono text-[10px]` at the bottom
    is a timestamp rather than a label, so `Eyebrow` (which uppercases) would be
    wrong there. No edit.
  - **Notifications**: "Email delivery" was a hand-rolled `h2 font-semibold`
    beside the shared `Section`, and the kind label under every notification was
    a byte-for-byte copy of `Eyebrow`'s classes. Both now use the primitives.
  - **Class detail**: the back link had its own `focus-visible:outline-brand`
    rule where its neighbours use `FOCUS_RING`. Its two card headings were
    `font-semibold` and `text-lg font-semibold`, so two cards on one screen
    carried two title sizes. Both are `text-lg` now. The leading arrow on "Back
    to schedule" stays: a back affordance is not the trailing `→` tell.
  - Verified: `pnpm typecheck` 17/17 green, eslint clean on all four files,
    prettier applied. Not opened in a browser this pass.
- 2026-09-16 Task 11, Definition of Done. Docs only, no code.
  - `docs/issues/140-the-owner-screens-design-pass.md`: the ADR. It records the
    four patterns the pass kept finding rather than listing screens, because the
    patterns are the finding. Three of the four are bugs.
  - `docs/map.md`: ADR 140 indexed above 139.
  - `docs/spec.md`: one line under O4's member detail for the one behaviour
    change, that ending a membership asks first from either door, and that Pause
    does not because Resume sits beside it.
  - `docs/roadmap.md`: a v7.8 built-wave block above v7.7, eleven slices, web
    only. It says plainly that nothing was clicked through and no suite was run.
  - `CHANGELOG.md`: an Unreleased section above "the signed-out door".
  - `docs/owner-screens-sitemap.md`: two errors the pass found. §2.3 claimed the
    person screen can confirm or reject a payment claim; it only shows one. §3.3
    said member detail opens in a dialog; it opens inline under the row.
  - Final gates on the whole pass: `pnpm typecheck` 17/17 green, `pnpm lint`
    15/15 green.

## Done

All eleven tasks are complete. Two things the user still owns:

1. **Run the suite.** `pnpm test`. The session rule forbids running it here. The
   pass changed presentation only, but task 5 added a confirmation dialog to the
   member detail's End button, so any test that clicked straight through to
   `end` on that screen now has a dialog in the way.
2. **Decide where this lands.** Nothing was committed. The branch is still
   `main` with the reception work in flight, and the project rule is to work on
   `dev`, where merging into `main` deploys.

Open questions left for an ADR rather than decided in a screen edit:

- Does `CountBadge` mean "N things want you" or a plain total? `docs/design.md`
  says the first, `people-screen.tsx` uses the second.
- Section navigation for the settings screens, worth revisiting past about eight
  sections.
