# 108 — The curriculum week starts on Monday

**Status:** accepted · **Date:** 2026-08-29 · **Area:** `packages/domain`, `packages/db` (migration `0032`), `apps/nextjs`. One rule, one shift. **Refines:** [104](104-curriculum-blocks-as-a-timeline.md), [106](106-the-timeline-is-a-run-of-weeks.md).

## Context

The timeline draws a run of weeks and a block's height is its length. Both were
built on a week that started wherever the plan happened to start.

Two things came from that. The rail's row lines were drawn from an **anchor** of
`min(today, first block start)`, any weekday, while the `w35` labels beside them
came from `isoWeek()`, which is Monday-based. So the rows and their own labels
disagreed. And `nextStart` began an empty plan on **today**, so a gym that added
its first block on a Saturday had every block it would ever place running
Saturday to Friday.

The owner's report was one line: *"week starts from monday, not sunday"*.

## 1. The grid and the placements are two separate fixes

The rail was cosmetic and wrong on its own terms: a row boundary that is not a
week boundary is not a week. Snapping the anchor with `mondayOf()` fixed it and
changed no data.

The placements are the real rule. A gym reads its plan against a real calendar,
its classes repeat weekly, and the O2 week grid next door already starts on
Monday (`GRID_WEEK_STARTS_ON = 1`, ADR 96). A curriculum block that starts on a
Wednesday means every week of that block straddles two calendar weeks, which is
wrong on the screen and wrong in the head.

## 2. One function is the whole rule

Every placement runs a whole number of weeks and each start is the previous
end plus a day, so a chain that starts on a Monday **stays** on Mondays for
ever. The only place a weekday enters is `nextStart`, which is where a plan
begins or resumes:

```ts
export function nextStart(placements: Placement[], today: string): string {
  const monday = mondayOf(today);
  const last = placements.at(-1);
  if (!last) return monday;
  const after = addDays(last.endsOn, 1);
  return after > monday ? after : monday;
}
```

`mondayOf(today)`, not next Monday. The week you are in is the week you are
teaching, so a block added on Saturday starts on the Monday just gone and is
**running**, which is what the old rule did too. Taking the later of the two
candidates also means a new block can never open before the block it follows,
which matters while unaligned rows still exist.

Nothing else needed changing. `rippleFrom`, `insertPlacement`, `movePlacement`
and `removePlacement` all chain off an existing start, and the API's `place`
writes a placeholder date that `writePlan` immediately corrects.

## 3. The past moves, once

Migration `0032` shifts **every** row of an academy back by the same number of
days, the offset of its earliest block from that block's Monday. A uniform shift
is enough because the chain is already contiguous and whole-week, so aligning
the first row aligns all of them, and no row can cross another. Academies whose
first block is already a Monday are skipped by the `HAVING`.

This rewrites settled blocks, by up to six days. ADR 104 §2 says the past does
not move, and this breaks that once, deliberately: the feature is a day old, it
is in an unpriced pilot, and the alternative is a plan permanently split between
an unaligned head and an aligned tail. A one-off correction is cheaper than
carrying two week systems.

## Consequences

- `mondayOf(iso)` joins `isoWeek` in `packages/domain/src/curriculum.ts`. Pure,
  UTC day numbers, no `Date` arithmetic in local time.
- Migration `0032` is a **data** migration, no schema change; its snapshot is a
  copy of `0031`'s with a fresh id so the chain stays intact. **Applied to Neon**
  (2026-08-29, 33 rows in `drizzle.__drizzle_migrations`; the four
  `seed_org_alma` rows shifted back 4 days, then checked live for Mon..Sun,
  contiguity and spans still matching `weeks`).
- Verified without a browser: the date rules were exercised directly with
  `node --experimental-strip-types` (seven weekdays, month and year-end
  crossings, the lapsed-plan and never-go-backwards branches), and the migration
  was replayed on a throwaway PGlite over a deliberately unaligned academy and
  an aligned one, checking every row lands Mon..Sun and the chain stays
  contiguous. Typecheck and lint green on `domain`, `api` and `nextjs`.
