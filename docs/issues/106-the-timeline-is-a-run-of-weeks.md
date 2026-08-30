# 106 — The timeline is a run of weeks, and every edit is a drag

**Status:** accepted · **Date:** 2026-08-28 · **Area:** `apps/nextjs` (one screen), `apps/nextjs/src/lib/format.ts`. No migration, no procedure changed, no new dependency. **Refines:** [105](105-a-block-library-and-a-drop-target-timeline.md), [104](104-curriculum-blocks-as-a-timeline.md). **Reference:** the published "Curriculum Blocks" prototype.

## Context

ADR 105 gave the curriculum a library and a drop target, but the drop target
was only as tall as the plan. An academy with no blocks saw a dashed box, and
one with three blocks saw six weeks of page and nothing else. There was nowhere
to aim.

The owner asked for the shape the prototype has: **a blank timeline**, a run of
weeks that exists whether or not anything is on it, onto which blocks are
dragged, stretched, shrunk, reordered and taken off.

## 1. The canvas comes first, the blocks sit on it

The track is now a **week grid** that always draws. It runs from the plan's
anchor (the first block's start, or today when the plan is empty) for
`max(planned weeks + 6, 16)` weeks, with a hairline at every week boundary and
the week number and month on the rail beside it. A gym with nothing planned
opens on sixteen empty weeks and can see where a block would go.

The blank tail is what makes "drop at the end" a real target rather than a
one-pixel edge under the last card.

## 2. Pointer events, not the HTML5 drag API

ADR 105 used native `dragstart` / `drop`. That was the cheapest thing that
worked, and it had two costs this change could not carry:

- **It does nothing on touch.** HTML5 drag events never fire from a finger.
- **It cannot resize.** `dragover` gives you a drop target, not a live delta,
  so stretching a block by its edge was not expressible.

So the screen moved to **pointer events** with `setPointerCapture`, which the
prototype also uses: one `pointerdown` per grab, one `pointermove` and
`pointerup` on the section, and `touch-action: none` on the three grab targets.
Same event path for mouse, trackpad, pen and finger, and the delta needed for a
resize comes for free.

## 3. Three grabs, one preview

Everything a drag does is expressed by a domain function that already existed
for the buttons (ADR 104 §3 predicted exactly this):

| Grab | While dragging | On release |
| --- | --- | --- |
| A block's grip in the library | `insertPlacement` at the hovered index, drawn as a translucent ghost | `curriculum.place` |
| A placed block's grip | `movePlacement` from its index to the hovered one | `curriculum.move` |
| A placed block's bottom edge | `rippleFrom` at `round(startWeeks + dy / 68px)` | `curriculum.resize` |

The result of that call goes into one piece of local state, `preview`, and the
timeline renders `preview ?? plan`. So the whole page ripples live under the
cursor, every card animating on `translate` and `height`, and **nothing touches
the query cache until the pointer comes up**. Releasing fires the mutation,
which does its own optimistic update, so there is no flash between the preview
ending and the real write landing.

This is why no drag library was needed for a second time. The hard part of a
drag-and-drop library is deciding what the list looks like mid-drag, and this
feature has had a pure function for that since ADR 104.

## 4. What a drag cannot do, the buttons still do

The stepper, the up and down arrows and **Add to plan** all remain, and the
resize handle is a `role="slider"` that takes arrow keys. Pointer events work on
touch, so the buttons are no longer the only touch path, but they are still the
only **keyboard** path and they are the ones that name what they do out loud.

The floors are unchanged and still enforced twice, in the browser and on the
server: a drop is clamped to `firstDraftIndex`, a settled block has no grip and
no handle, and the running block's handle cannot go below its current length.

## 5. What the prototype does that this does not

- **The dragged card does not float under the cursor.** It jumps into its
  previewed slot instead. One fewer thing to position, and the ripple is the
  part worth watching.
- **No soft dates.** A block eight weeks out still prints a real date rather
  than "early October". Unchanged from ADR 104, and still waiting on the
  question of how far ahead a real gym plans.
- **No taught line** under a settled block. That is C.2, still unbuilt.

## 6. A row is worth reading

A block on the plan drew its theme and its dates and then several inches of
empty card, because the height is the duration and a two-week block is 126px
tall. Two things fill it:

- **The notes show on the row.** The description the block carries is the
  lesson plan in v1 (`curriculum-plan.md` §8), and the timeline is where a coach
  looks. It fills the card and clips, so a long note takes the room a long block
  has, and a one-week block leaves it out rather than showing a sliced line.
- **Every card has an edit button.** A pencil, on the library card beside the
  delete and on the plan row beside the stepper, both opening the same dialog on
  the same block. It was briefly the title that was clickable, which is a hidden
  affordance on a screen already carrying a grip, a resize edge and four
  buttons; the titles are plain text again. A **settled** row keeps this one
  control and no other, because a past block's name can be corrected even though
  its dates cannot. The dialog still says renaming changes every appearance, and
  its length chips still set the block's usual length rather than this
  placement's, which is the stepper's job on the row itself.

## 7. One control set, and "Still on this" retires

The running row carried a large primary button, **"Still on this, +1 week"**,
which ADR 104 §4 argued was the control the feature lived on. On a real screen,
beside the RUNNING badge and the edit pencil, it made the running row a third
kind of card: the drafts below it had a `− 2w +` stepper doing the same
arithmetic.

The running row now uses that same stepper, with **`−` disabled**, which is the
rule ADR 104 §2 already enforces on the server: the block covering today can be
extended and never shortened. So `+` is still one press, one press still fixes
the rest of the year, and the screen has one control set instead of two.

The reordering arrows and the ✕ stay draft-only: a running block cannot move or
come off the plan.

## Consequences

- `monthShortFmt` joins `~/lib/format.ts`; the rail needed a bare month, and `PencilIcon` joins `primitives.tsx` beside the two hand-rolled SVGs already there (the app has no icon package, ADR 90).
- The card layout is the prototype's: grip, body, controls in a row, with the
  resize bar across the bottom. That fits a one-week block, which the previous
  stacked layout did at 98px a week and this does at 68.
- **Not verified in a browser**, the fifth session with no tab to attach to.
  Typecheck, lint and `next build` are green, and the built CSS was grepped for
  `cursor:ns-resize`, `touch-action:none`, `cursor:grab`, `cursor:grabbing`,
  `transition-property:translate,height` and the handle's hover width. The drag
  itself has been reasoned about, not watched. Still to walk: a resize drag
  crossing several weeks, a reorder over a settled block, a drop past the end of
  the plan, and the whole thing under a finger.
