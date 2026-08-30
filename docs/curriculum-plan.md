<!-- matops — product plan for the curriculum feature. Not an ADR: no decision is taken yet. -->

# Curriculum — product plan

**Status:** plan only. Nothing built, nothing decided. `docs/map.md` still lists "curriculum planner" as out of scope; this doc is the case for graduating it, and the shape it should take when it does. The gate question in §14 can still move it back down the roadmap.

Written 2026-08-22. **Revised 2026-08-28:** the first slice changed. The original plan shipped the class log alone and left the plan itself two waves out, which measures teaching without aligning it. The revision cuts the looping cycle down to a date-ranged **block**, so the alignment half is one table and ships in the same wave as the log. Slices renumbered C.1 to C.10. Spec IDs corrected: the original claimed O12 and S13, both taken since v3.7.

## 1. The job, split three ways

"Curriculum" is one word for three different jobs. Build one thing for all three and you get a document library nobody opens.

| Who | The moment | What they actually want |
| --- | --- | --- |
| **Owner** | Sunday night, or after a student quits | "My four coaches each teach whatever they feel like. Beginners see armbars three weeks running and never a guard retention class. I can't defend a promotion." Wants **consistency and coverage**. |
| **Instructor** | 17:40, driving to the gym, class at 18:00 | "What am I teaching tonight?" Wants **one screen, on a phone, in five seconds**. |
| **Student** | Wednesday, trying to remember Tuesday | "What was that thing called?" Wants a **log of what we covered**. |

The owner is the buyer. The instructor is the user who makes or breaks it. The student is the retention payoff, and the biggest risk. Build in that order.

The industry writing agrees on the failure mode. The default is "technique of the day", random and unconnected, which slows beginners and hurts retention. The fix everyone names has the same shape: a **12 to 16 week looping cycle**, split into one or two week themes, so a new student can join any week; the owner sets the frame, the coaches write the lessons; a **central place for lesson plans plus a teacher's log** of what was taught.

## 2. What competitors ship, and the gap

BJJLink sells a **curriculum builder**: lesson plans, uploaded video tutorials, technique flowcharts. Zen Planner and Gymdesk sell **templates plus rank requirements**: copy last week, pick a theme, publish, and track technique milestones inside the student profile.

So the market sells **a content library that sits beside the schedule**. Nobody binds the plan to the class that actually happened.

matops already has what they lack: real `class` rows with a coach, a register, and attendance (O2, O5, O10).

> **Position: not a content library. A plan that runs your week.**
> The theme lands on tonight's class card. The coach logs what they covered in one line. The coverage report writes itself out of the register.

Four actions on the value curve:

- **Eliminate:** video hosting and upload. Storage, transcoding, rights, moderation, all for content that already lives on YouTube and Instagram. Allow a link, host nothing.
- **Reduce:** authoring. Nobody fills a blank builder.
- **Raise:** distribution. The plan appears where the coach already stands.
- **Create:** the taught-log and coverage loop. No competitor turns "what got taught" into data.

## 3. Recommendation: the smallest thing that both plans and records

**Verdict: build, in one small wave that does both halves at once.**

The riskiest assumption is not "do owners want a curriculum". They all say yes. It is **"will coaches keep it alive past week three"**. Curriculum modules die of neglect, not of missing features.

The original plan answered that risk by shipping the **class log** first, alone: one field on the class the coach already opens to take the register. The reasoning holds. The sequencing does not. A log with no plan above it is measurement without alignment, and it leaves the owner asking "so where do I put the plan?" for two more waves.

The revision keeps the test and adds the plan, because the plan half turned out to be one table. Cut the looping cycle down to a **block**: a date range plus a theme. Then wave one is one new table, one new column, one sub-tab, and one line on a panel that already exists.

**Why a date range and not a looping 12 to 16 week cycle.** The industry pattern loops so a new student can join any week. That is a rule about how you **write** the content, not about what the software has to compute. A loop needs a cycle start date, week-index arithmetic, and an answer for "the owner edited week 4 mid-cycle". A date range needs none of that, and for the first four months the two look identical to every user. Looping becomes a **repeat these blocks forward** button (C.3) when a real gym reaches the end of its first set.

## 4. The model: two objects in v1

- **Block** — a date range with a theme. *Aug 25 to Sep 7 · Closed guard: attacks and retention.* Free-text notes field underneath. Nothing else.
- **Taught line** — what the coach actually covered tonight. One nullable text column on the class row. Not authored, captured.

That is the whole v1 model. Everything below is growth, and every piece of it is gated on a signal from a real gym.

Do **not** add in v1: a program object, a technique taxonomy, flowcharts, versioning, per-belt syllabus, a drag-and-drop builder, structured lesson rows. Each is a month of work and none is the reason a gym buys.

**Where the pieces live.**

- `curriculum_block(id, academy_id, starts_on date, ends_on date, theme text, notes text null, created_at, updated_at)`. Tenant-scoped like every domain table: `academy_id` plus `ENABLE ROW LEVEL SECURITY` and the standard policy in a hand-written migration, next number **0028**, following the `0006` pattern. Needs an RLS leak test in `packages/db/test`.
- `class.taught text null`. One column on `class_instance`, same migration.
- The pure rule goes in `packages/domain` **before** the API or UI, per delivery.md §5: given the blocks and a date, return the block that covers it. Overlap resolves to the most recently created. No block covering the date returns null.

**Title versus taught, keep them apart.** `class_instance.title` is already per-instance overridable, so a coach could edit the title instead of writing a taught line. The spec must say which is which. **Title** is the recurring name of the slot ("Gi Fundamentals"). **Taught** is what happened that night.

**Edge cases, decided cheaply.** No block covers today: show nothing, no empty state nagging the coach. Two blocks overlap: take the most recent by `created_at`. Do not build overlap validation, and do not stop an owner from leaving gaps.

## 5. Who can create, edit, see

Maps onto the roles that already exist. No new role.

**v1 rule: any staff writes.** The owner-authors split below is real at four coaches and imaginary at one or two, and the pilot gyms are one or two. Staff-writable is one fewer permission tier to build and reason about. The split arrives with the comment thread in C.7, and both are gated on the same signal: a gym with three or more coaches.

| Action | Owner | Instructor | Student | Slice |
| --- | --- | --- | --- | --- |
| Create/edit **blocks** | yes | yes (v1) | no | C.1 |
| **Log** what was taught | yes | own classes | no | C.2 |
| See the **whole curriculum** | yes | yes | no in v1 | C.1 |
| Edit another coach's block | yes | yes in v1, no from C.7 | no | C.7 |
| **Comment** on a block | yes | yes | no | C.7 |
| See **coverage report** | yes | own classes only | no | C.6 |
| See **what we covered** | yes | yes | toggle, default off | C.9 |

Two rules carry the politics of this feature, and they land in C.7.

**The owner owns the *what*. The instructor owns the *how*.** The owner fixes the theme of the block. The coach picks which techniques, in what order, with what drill. Rigid systems get quietly ignored by senior coaches; this is the release valve.

**An instructor never silently rewrites the plan. They comment.** A comment on a block can be **accepted by the owner into the plan** with one click. A head instructor will not accept a tool where the owner can overrule them with no channel to push back, and an owner will not accept one where the standard drifts. The thread resolves both, and it is cheap.

**Students see nothing until C.9.** Coaches write differently when watched, the plan is competitive information the gym next door would like, and there is no evidence yet that students ask for it.

## 6. How it gets created (the part that decides success)

The number one killer is the blank page. Three answers, in order of laziness:

1. **Concierge it, at this stage.** Three pilot gyms means you can type their first eight blocks for them on a call. You learn more from watching an owner react to their own themes than from any seed file, and you will not have seeded a data model you are about to change. This is the v1 answer, and it costs nothing to build.
2. **Curriculum by accretion.** Coaches log what they taught (C.2). After eight weeks the owner clicks "turn this into blocks". The plan reflects what the gym really does, and the authoring cost was zero. This is C.8's cheaper half.
3. **Seeded starter cycles.** Ship a 16 week BJJ fundamentals set, a no-gi one, a kids one. The owner clones and edits. Rank systems are already seeded this way (ADR 41), same pattern. This is the adoption lever for a gym you have never met, so it lands in C.8, when onboarding stops being a phone call.

Build from class history ("make blocks from the last 8 weeks") stays out until someone asks.

## 7. Distribution: where the plan shows up

This is the feature. A curriculum page in a nav menu is a dead curriculum.

1. **On the class.** The active block's theme is one line at the top of the **class detail modal**. That modal **is** the O5 roster panel, reused (spec O2), so this is one component change that covers Schedule, the dashboard day block, and Attendance at once. The coach opens that screen to take the register anyway, so the plan costs zero navigation and the taught line is one field further down the same screen.
2. **The authoring screen is a tab, not a nav item.** **Schedule → Curriculum**, beside Templates. No new nav entry, no new route, no new row in the route access table.
3. **On the phone, via the PWA.** Coaches are web-only in matops, and O8 already makes the web app installable. Use that. Do **not** add a coach mode to the Expo app: mobile is the student lens, and a coach tab breaks that split for one screen.
4. **On the wall.** The block's theme on the O3 poster export (C.10). Almost free, and it tells every student walking past that this gym has a plan.
5. **Not** a push notification. Nobody asked. A Sunday "next block: closed guard" email to staff only is a one-liner to add if coaches ask.

## 8. Notes and comments: three things, keep them apart

- **Block notes** — the free-text field under the theme. In v1 this is the lesson plan. Watch what coaches type into it before giving it structure (C.4).
- **Taught line** — what actually got taught, by the coach, on the class. Visible to staff. This is the teacher's log, and it is the coverage data.
- **Comment on a block** — staff thread, C.7. "This ran long, cut the second entry." Makes the next cycle better than the first for free.
- **Private coaching note on a member** — **already exists** (G.4, ADR 41). Do not build a second notes surface. "Ana still cannot frame from bottom side" belongs on Ana, not on the class.

## 9. The report that justifies the feature

**Coverage.** "Last 12 weeks: guard retention taught 0 times. Armbar from guard, 6 times. Two blocks ran with no logs at all." No competitor gives this, and it falls out of the taught line for free.

It ships in C.6, not earlier, because it needs eight-plus weeks of logs before the screen is anything but empty.

Two guardrails, both borrowed from decisions already made:

- **Never a leaderboard.** Report coverage per block and per timeslot, never a ranking of coaches. Same principle as O10, and for the same reason: it measures the timeslot, not the coach.
- **Do not tie curriculum to promotion.** The Kicksite and Zen Planner model links syllabus to belt requirements. That fits karate and taekwondo, where there is a fixed test. It does not fit BJJ, and it contradicts ADR 41, where rank is the coach's call with no progress bar. Keep them apart.

## 10. Slices

Wave 1 is the only committed wave. Every slice after it names the signal that unlocks it. No signal, no build.

### Wave 1 — plan and record (the whole v1)

| # | Slice | Size | Surfaces | Why here |
| --- | --- | --- | --- | --- |
| **C.1** | **Curriculum blocks.** `curriculum_block` table + RLS + migration 0028. Domain rule `blockForDate`. **Schedule → Curriculum** tab: list, add, edit, delete a block (dates, theme, notes). The active block's theme renders as one line at the top of the class detail modal, which is the O5 roster panel, so it appears on Schedule, Dashboard and Attendance at once. Any staff writes. | M | DB · API · Web · Sh | The frame. One table, and it puts the plan where the coach already stands. |
| **C.2** | **The taught line.** `class.taught` nullable text, same migration. One field on the O5 attendance panel, below the roster, optional, staff-visible. Must never block "mark all present" and must be skippable with zero taps. | S | DB · API · Web | Tests the riskiest assumption. Useful alone, and it is the seed data for everything downstream. |

Wave 1 total: **one migration, one new table, one new column, one sub-tab, one line and one field on a panel that already exists.**

### Wave 2 — take the friction out (gated)

| # | Slice | Size | Signal that unlocks it | Why |
| --- | --- | --- | --- | --- |
| **C.3** | **Repeat blocks forward.** One button: duplicate the current set of blocks with shifted dates. This is where "looping cycle" finally arrives, as a button rather than a data model. | S | A gym reaches the end of its blocks. | The one thing a date range cannot do that a cycle can. Cheap once, and only then. |
| **C.4** | **Structured lesson lines.** Split block `notes` into 3 to 5 technique rows with optional links. Host no video, link only. | M | Coaches are already pasting line lists into `notes`. | Give structure to a shape you observed, not one you guessed. |
| **C.5** | **Prefill the taught line.** "Taught as planned" fills the field from the block's theme in one tap, still editable. | S | Taught lines mostly restate the theme. | Removes the last excuse not to log. Held back from v1 on purpose: free text is the honest test of engagement, a one-tap button is not. |

### Wave 3 — what the owner buys (gated)

| # | Slice | Size | Signal that unlocks it | Why |
| --- | --- | --- | --- | --- |
| **C.6** | **Coverage report.** Planned versus taught over the last N weeks, per block and per timeslot. Never per coach. | M | 8 weeks of logs at 50%+ fill in at least one gym. | The owner's reason to pay. Empty before the data exists. |
| **C.7** | **Comments, and the owner/instructor write split.** Thread on a block; owner accepts a comment into the plan with one click. Blocks become owner-authored, instructors comment. | M | A gym with 3 or more coaches, or a coach asks how to push back. | The political release valve. Both halves are the same politics, so they ship together. |
| **C.8** | **Seeded starter cycles.** A 16 week BJJ fundamentals set, a no-gi set, a kids set. Clone and edit. Plus the accretion path: "turn my last 8 weeks of logs into blocks". | M | Onboarding a gym you will not speak to on the phone. | The adoption lever, once the model has stopped moving. |

### Wave 4 — the student payoff (gated)

| # | Slice | Size | Signal that unlocks it | Why |
| --- | --- | --- | --- | --- |
| **C.9** | **Students see "what we covered".** Per-academy toggle, default off. On the web class detail and the Expo class screen. | S | Students ask, and coach logging holds at week 8. | The retention hook. Also the biggest behaviour risk: coaches write differently when watched, so it goes last. |
| **C.10** | **The block theme on the O3 poster export.** | S | Any time after C.1. | Nearly free. Most of the student-facing value with none of the student-facing risk. |

**Spec IDs when this ships: `O13` for the web screen, `S14` if C.9 lands on mobile.** The original plan claimed O12 and S13. Both were taken in v3.7: **O12 is Announcements** (spec.md §O12) and **S13 is Notifications** (spec.md §S13).

**Out of scope, and staying out:** video hosting, technique taxonomy and flowcharts, per-student technique checklists, curriculum tied to promotion, AI generated plans, sharing or selling curricula between gyms, plan version history, multi-branch curriculum inheritance, a coach tab in the Expo app.

## 11. Definition of Done for wave 1

Per delivery.md §4, and in this order:

1. Pure rule (`blockForDate`) in `packages/domain` **first**, with its test: block covers the date; no block returns null; overlapping blocks return the most recently created.
2. Migration `0028`: `curriculum_block` + `class.taught`, with `ENABLE ROW LEVEL SECURITY`, the standard `academy_id` policy, and the `matops_app` grant, copying `0006`.
3. RLS leak test in `packages/db/test` for `curriculum_block`.
4. Router test in `packages/api/test` over PGlite: a student is `FORBIDDEN` on every curriculum mutation; an instructor can write a taught line on their own class.
5. `docs/spec.md`: a new **O13** section, plus the title-versus-taught rule, plus one line in the O5 section for the field.
6. `docs/architecture.md` + an ADR at [`docs/issues/104-curriculum-blocks-as-a-timeline.md`](issues/104-curriculum-blocks-as-a-timeline.md). **Landed 2026-08-28** for the block half; 103 was taken the same day by an unrelated note. This doc stopped being a plan for §4 and C.1, which ADR 104 supersedes. C.2 onward is still a plan.
7. `docs/roadmap.md`: new C.1 and C.2 rows, and remove "curriculum" from the deferred-domains line.
8. One line in `CHANGELOG.md`.

Do not run the test suite in-session. Hand over `pnpm test`, `pnpm typecheck`.

## 12. How it fails (inversion)

- **Owner writes 16 weeks, nobody reads it, dead by week 3.** Never a page you have to remember. It lives on the class screen.
- **Coaches feel policed.** "The owner is checking whether I taught the right thing." Coverage is per block and timeslot, never a coach ranking. The taught line is optional and takes one line.
- **The register gets slower.** A new field lands on the screen that already works. The taught line must never block "mark all present", and must be skippable with zero taps. This is the counter-metric in §13.
- **Two places for the same text.** A coach edits `class.title` instead of writing a taught line, and the schedule name rots. Fixed by naming the split in the spec, and by putting the taught field where the title field is not.
- **Head coach resents an owner-only edit rule.** Which is why v1 lets any staff write, and the split waits for C.7 with the comment thread that makes it survivable.
- **The gym has one instructor.** Then there is no consistency problem and C.1 is premature for them. C.2 still stands on its own. See §14.

## 13. Measurement

- **Primary:** share of finished classes carrying a taught line, per week.
- **The number that tells the truth:** that same share in **week 8**. Curriculum features die at week three, not week one. Everything else is vanity next to this.
- **Adoption:** share of academies with at least one block covering today, 30 days after they see the feature.
- **Inputs:** blocks created per academy, class detail opens per coach per week, share of blocks with notes filled.
- **Counter-metric:** attendance marking rate must not fall, and time to mark a register must not rise. New content is landing on that screen.
- **Second-order, later:** 90 day student retention in gyms with an active block versus without. Needs more gyms than exist today.
- **Funnel:** open Curriculum → create a first block → coach opens tonight's class and sees the theme → coach writes a taught line. A drop above 50% at step one to step two means the blank page won, and C.8 moves up.
- **Kill criterion.** Under **30%** of finished classes carry a taught line by **week 4** across the pilot gyms: stop. Do not build wave 2 or 3. C.1 can stay as a cheap standalone board.

## 14. The gate question, and two that follow it

1. **How many instructors do the pilot gyms actually have?** This is the gate on C.1 and on all of wave 3. If they are one-coach gyms, the consistency problem does not exist for them and the block board solves nobody's pain. C.2 still stands alone. Check it directly:
   ```
   psql "$POSTGRES_URL&sslrootcert=system" -c "select o.name, m.role, count(*) from \"member\" m join organization o on o.id=m.organization_id group by 1,2 order by 1,2;"
   ```
   No academy with two or more instructors: ship C.2, park C.1.
2. **Is the installable web app good enough for a coach standing on the mat?** If not, the distribution plan in §7 changes and this gets far more expensive.
3. **Should students eventually see it?** If yes, that changes how coaches write from day one, and C.9 belongs earlier rather than bolted on.

## Sources

- [Gymdesk — how to build a curriculum for your martial arts school](https://gymdesk.com/blog/how-to-build-a-curriculum-for-your-martial-arts-school)
- [Gymdesk — BJJ lesson planning and curriculum](https://gymdesk.com/blog/bjj-lesson-planning-curriculum)
- [Zen Planner — systemize your curriculum without losing flexibility](https://zenplanner.com/blogs/how-to-systemize-your-martial-arts-curriculum-without-losing-flexibility/)
- [Zen Planner — gym management software for martial arts schools](https://zenplanner.com/blogs/gym-management-software-for-martial-arts-schools-what-to-look-for/)
- [BJJLink — curriculum builder](https://bjjlink.com/features/curriculum-builder)
- [Martial Journal — structuring a successful martial arts curriculum](https://www.martialjournal.com/structuring-a-successful-martial-arts-curriculum/)
