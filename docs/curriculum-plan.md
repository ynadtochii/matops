<!-- matops — product plan for the curriculum feature. Not an ADR: no decision is taken yet. -->

# Curriculum — product plan

**Status:** plan only. Nothing built, nothing decided. `docs/map.md` still lists "curriculum planner" as out of scope; this doc is the case for graduating it, and the shape it should take when it does. Three open questions at the bottom can still move it back down the roadmap.

Written 2026-08-22. Sources at the end.

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

## 3. Recommendation: log first, plan second

**Verdict: build, but backwards from how everyone else builds it.**

The riskiest assumption is not "do owners want a curriculum". They all say yes. It is **"will coaches keep it alive past week three"**. Curriculum modules die of neglect, not of missing features.

Cheapest test of that assumption: ship the **class log** before the builder. One field on the class the coach already opens to take the register. If coaches will not type one line about what they taught, they will never follow a 16 week plan, and the whole build is saved. If they do type it, you have both the proof and the seed data for the plan.

## 4. The model: three objects, not seven

- **Program** — a named track: *Fundamentals*, *Advanced*, *Kids*. Most gyms need one. Maps to the existing `discipline` tag; do not invent a second taxonomy.
- **Cycle** — an ordered list of **themes**, each covering one or two weeks. 12 to 16 weeks, and it loops. *Week 1: closed guard attacks. Week 2: closed guard, opening and passing.*
- **Lesson plan** — what to teach in one class: the theme, three to five technique lines, a note, optional links. Attached to a class.

Plus one record that is not authored, it is captured:

- **Class log** — what the coach actually taught tonight. Free text, plus a tick if it matched the theme.

Do **not** add: technique taxonomy, flowcharts, versioning, per-belt syllabus, drag-and-drop builder. Each is a month of work and none is the reason a gym buys.

## 5. Who can create, edit, see

Maps onto the roles that already exist. No new role.

| Action | Owner | Instructor | Student |
| --- | --- | --- | --- |
| Create/edit **program and cycle** (the standard) | yes | no | no |
| Write **lesson plan** for a class they teach | yes | yes | no |
| Edit another coach's lesson plan | yes | no | no |
| **Comment** on any theme or plan | yes | yes | no |
| **Log** what was taught | yes | own classes | no |
| See the **whole curriculum** | yes | yes | no in v1 |
| See **coverage report** | yes | own classes only | no |

Two rules carry the politics of this feature.

**The owner owns the *what*. The instructor owns the *how*.** The owner fixes the theme of the week. The coach picks which techniques, in what order, with what drill. Rigid systems get quietly ignored by senior coaches; this is the release valve.

**An instructor never silently rewrites the plan. They comment.** A comment on a theme can be **accepted by the owner into the plan** with one click. A head instructor will not accept a tool where the owner can overrule them with no channel to push back, and an owner will not accept one where the standard drifts. The thread resolves both, and it is cheap.

**Students see nothing in v1.** Coaches write differently when watched, the plan is competitive information the gym next door would like, and there is no evidence yet that students ask for it. Ship it later as a per-academy toggle, default off.

## 6. How it gets created (the part that decides success)

The number one killer is the blank page. Three answers, in order of laziness:

1. **Seeded starter cycles.** Ship a 16 week BJJ fundamentals cycle, a no-gi one, a kids one. The owner clones and edits. This single decision moves adoption more than any builder feature. Rank systems are already seeded this way (ADR 41), same pattern.
2. **Curriculum by accretion.** Coaches log what they taught. After eight weeks the owner clicks "turn this into a cycle". The plan reflects what the gym really does, and the authoring cost was zero.
3. **Build from history.** Every class taught is already stored, with title and coach. Offer "make a cycle from the last 8 weeks". Nice, not required.

Do 1 and 2. Skip 3 until asked.

## 7. Distribution: where the plan shows up

This is the feature. A curriculum page in a nav menu is a dead curriculum.

1. **On the class.** Theme and plan sit on the O2 class detail and the O5 attendance panel, above the roster. The coach opens that screen anyway to take the register, so the plan costs zero navigation and the log is one field further down the same screen.
2. **On the phone, via the PWA.** Coaches are web-only in matops, and O8 already makes the web app installable. Use that. Do **not** add a coach mode to the Expo app: mobile is the student lens, and a coach tab breaks that split for one screen.
3. **On the wall.** Add the week's theme to the O3 poster export. Almost free, and it tells every student walking past that this gym has a plan. That is most of the student-facing value with none of the student-facing risk.
4. **Not** a push notification. Nobody asked. A Sunday "next week: closed guard" email to staff only is a one-liner to add if coaches ask.

## 8. Comments and notes: three things, keep them apart

- **Comment on a theme or plan** — staff thread. "This ran long, cut the second entry." Makes cycle two better than cycle one for free. The owner can accept a comment into the plan.
- **Class log** — what actually got taught, by the coach, on the class. Visible to staff. This is the teacher's log, and it is the coverage data.
- **Private coaching note on a member** — **already exists** (G.4, ADR 41). Do not build a second notes surface. "Ana still cannot frame from bottom side" belongs on Ana, not on the class.

## 9. The report that justifies the feature

**Coverage.** "Last 12 weeks: guard retention taught 0 times. Armbar from guard, 6 times. Two themes skipped." No competitor gives this, and it falls out of the log for free.

Two guardrails, both borrowed from decisions already made:

- **Never a leaderboard.** Report coverage per program, not a ranking of coaches. Same principle as O10, and for the same reason: it measures the timeslot, not the coach.
- **Do not tie curriculum to promotion.** The Kicksite and Zen Planner model links syllabus to belt requirements. That fits karate and taekwondo, where there is a fixed test. It does not fit BJJ, and it contradicts ADR 41, where rank is the coach's call with no progress bar. Keep them apart.

## 10. Slices

| # | Slice | Size | Why here |
| --- | --- | --- | --- |
| **C.1** | **Class log.** Coach types what was covered on the class, optional, on the attendance screen. Staff-visible. | S | Tests the riskiest assumption before anything else is built. Useful alone. |
| **C.2** | **Program, cycle, weekly theme.** Owner-authored, seeded starter cycles, assigned to weeks. Theme shows on the class card, the attendance panel, and the poster. | M | The frame. Seeded cycles are the adoption lever. |
| **C.3** | **Lesson plan per theme.** Technique lines, notes, links. Coach attaches one to their class; the log can pre-fill from it. | M | The instructor's five-second screen. |
| **C.4** | **Comments and suggestions.** Thread on a theme or plan, owner accepts into the plan. | S | The political release valve. |
| **C.5** | **Coverage report.** Planned versus taught, last N weeks, per program. | M | What the owner buys. |
| **C.6** | **Student-visible "what we covered"**, per-academy toggle, default off. | S | Retention hook, once coaches are known to write. |

C.1 alone is one wave. C.2 to C.4 is a wave. C.5 to C.6 is a wave.

Spec IDs when this ships: **O12** for the web screen, **S13** if C.6 lands on mobile.

**Out of scope, and staying out:** video hosting, technique taxonomy and flowcharts, per-student technique checklists, curriculum tied to promotion, AI generated plans, sharing or selling curricula between gyms, plan version history, multi-branch curriculum inheritance.

## 11. How it fails (inversion)

- **Owner writes 16 weeks, nobody reads it, dead by week 3.** Never a page you have to remember. It lives on the class screen.
- **Coaches feel policed.** "The owner is checking whether I taught the right thing." Coverage is per program, never a coach ranking. The log is optional and takes one line.
- **The register gets slower.** A new field lands on the screen that already works. The log must never block "mark all present", and must be skippable with zero taps.
- **Head coach resents an owner-only edit rule.** Comments, and the owner-accepts flow.
- **The gym has one instructor.** Then there is no consistency problem and the feature is premature for them. See the open questions.

## 12. Measurement

- **Primary:** % of classes with a log, per week. Target 60% by week 4.
- **Adoption:** % of academies with an active cycle 30 days after they see the feature.
- **Truth-telling metric:** % of academies still logging in **week 8**. Curriculum features die at week 3. This is the only number that tells you if it worked.
- **Inputs:** cycles cloned from a starter (target above 70% of all cycles created), plans opened per coach per week, comments per cycle.
- **Counter-metric:** attendance marking rate must not fall, and time to mark a register must not rise. New content is landing on that screen.
- **Second-order, later:** 90 day student retention in gyms with an active cycle versus without. Needs more gyms than exist today.
- **Funnel:** open Curriculum → clone starter cycle → assign to weeks → coach opens tonight's class and sees the theme → coach logs. Watch step one to step two. A drop above 50% there means the blank page won.

## 13. Three questions that change the plan

1. **How many instructors do the beta gyms actually have?** If they are one-coach gyms, the consistency problem does not exist for them and C.2 to C.5 solve nobody's pain. C.1 still stands on its own. This is the one answer that could move the whole feature back down the roadmap.
2. **Is the installable web app good enough for a coach standing on the mat?** If not, the distribution plan changes and this gets far more expensive.
3. **Should students eventually see it?** If yes, that changes how coaches write from day one, and the toggle belongs earlier rather than bolted on.

## Sources

- [Gymdesk — how to build a curriculum for your martial arts school](https://gymdesk.com/blog/how-to-build-a-curriculum-for-your-martial-arts-school)
- [Gymdesk — BJJ lesson planning and curriculum](https://gymdesk.com/blog/bjj-lesson-planning-curriculum)
- [Zen Planner — systemize your curriculum without losing flexibility](https://zenplanner.com/blogs/how-to-systemize-your-martial-arts-curriculum-without-losing-flexibility/)
- [Zen Planner — gym management software for martial arts schools](https://zenplanner.com/blogs/gym-management-software-for-martial-arts-schools-what-to-look-for/)
- [BJJLink — curriculum builder](https://bjjlink.com/features/curriculum-builder)
- [Martial Journal — structuring a successful martial arts curriculum](https://www.martialjournal.com/structuring-a-successful-martial-arts-curriculum/)
