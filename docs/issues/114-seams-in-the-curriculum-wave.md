# 114 — Seams in the curriculum wave

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `packages/domain`, `packages/validators`, `packages/api`, `packages/ui`, `apps/nextjs`. No migration, no behaviour change. **Amends:** [104](104-curriculum-blocks-as-a-timeline.md)-[113](113-a-note-on-one-run.md) on shape only. **Relates to:** [95](95-what-belongs-in-domain.md), [96](96-one-definition-per-rule.md), [98](98-fewer-round-trips-and-one-invalidation-rule.md).

## Context

Waves v5.2 through v6.1 landed one product arc in nine slices. Each slice was
correct on its own, and each one added to the same three files. Read together
after the fact, the arc left seven places where the interface had grown as fast
as the code behind it. This note records the reshape. Nothing a user can see
changed, and no rule in `packages/domain` changed.

## 1. Three id schemas, not one

`CurriculumBlockIdSchema` was the input for three procedures that take three
different rows: `deleteBlock` a library block, `unplace` a slot, `removeTheme`
one placed row. Nothing in the signature said which. The payload had the same
problem one level down: `plan[].id` is a slot and `plan[].themes[].id` was a
placed row, both spelled `id`.

Now: `CurriculumBlockIdSchema` takes `blockId`, `CurriculumSlotIdSchema` takes
`slotId`, `CurriculumPlacementIdSchema` takes `placementId`, and `resize` /
`move` / `setRunNote` name their id the same way. `themes[].id` became
`themes[].placementId`. `plan[].id` stays `id` on purpose: it is the slot, and
`id` is the field every sequence rule in `packages/domain` addresses, so
renaming it would put a mapping layer between the client and the rules it
already shares with the server.

The rename found four places in the router tests that had been passing the right
id only because the author knew the shape. They now fail to compile if they are
wrong.

## 2. One "what day is it there"

The router had its own `Intl.DateTimeFormat("en-CA")`, the fourth copy of that
idea after `localDate`, `dayKey` and `materialize`. `academyDay(instant, zone)`
now lives in `packages/domain/src/local-date.ts` beside the others, and
`domain/src/curriculum.ts` imports `DAY_MS` instead of redeclaring it. ADR 96.

## 3. One read of the academy row per request

`curriculum.forClass` read `organization` twice: once for
`curriculum_for_students`, once for the time zone, by the same id in the same
transaction. `academy-tz.ts` is already the seam for "what this request needs off
the academy row", so it now returns both through `academyContext(ctx)` and
`academyTimeZone` is a thin call on top. ADR 98.

## 4. One statement per ripple

`writePlan` issued one `UPDATE` per moved slot, awaited in a loop, which a ripple
from the top of a twenty-slot plan turns into twenty round trips inside one
tenant transaction. The domain hands the finished plan over in full, so the write
is now a single `UPDATE ... FROM (VALUES ...)`. The guard logic and the diff are
unchanged, and the RLS policy applies to the raw statement exactly as it did to
the query builder.

## 5. One optimistic-cache helper

`cancelQueries` → `getQueryData` → `setQueryData` → roll back on error was
written by hand five times across four screens, and the copies had already
drifted in what they return. `apps/nextjs/src/lib/optimistic.ts` holds it once.
Forgetting `cancelQueries` is the subtle failure here: a refetch already on the
wire lands after the optimistic write and silently undoes it. Now it cannot be
forgotten.

## 6. One press-and-focus vocabulary

The v4.9-v5.1 motion pass introduced `active:scale-[0.96]` and the focus ring as
literals, then repeated them in four places. `@matops/ui/motion` exports `PRESS`,
`FOCUS_RING` and `FOCUS_RING_INSET`; `Button` composes them, and the three
hand-rolled surfaces import them.

## 7. The curriculum screen has seams inside it

`Curriculum()` was one 1165-line function holding twelve mutations, three form
states, the whole pointer machine and the whole tree. `PlacedCard` took eighteen
props because the parent owned every piece of state, which made it shallow: its
interface was as big as its body.

Split four ways:

- `useCurriculumBoard()` owns the query, the twelve mutations and the cache
  rewrite each implies. The sequencing four stay optimistic and fire-and-forget;
  everything a dialog waits on returns a promise and the dialog closes itself.
- `useTimelineDrag()` owns the drag and the preview plan it implies, and commits
  through three callbacks. It can be exercised with a plan and a `clientY`, with
  no tree.
- `curriculum-dialogs.tsx` holds the three forms behind one `FormDialog` wrapper
  that is open exactly while its form state exists.
- `curriculum-shared.ts` holds the types, the labels and the geometry both hooks
  and the view need, which is what keeps the imports acyclic.

`Curriculum()` is 467 lines of layout. `PlacedCard` takes four props.

## Consequences

`pnpm typecheck` 17/17 and `pnpm lint` clean on every touched package. The two
pre-existing red gates are untouched by this note. The router tests needed the
id renames of §1 and nothing else, which is the evidence that the reshape did not
move behaviour: they are written against procedure interfaces, and only the
interfaces that were lying had to change.
