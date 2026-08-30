<!-- matops — UI/UX draft for the curriculum block timeline. Built as ADR 104; that note is the decision of record. Companion to curriculum-plan.md. -->

# Curriculum blocks as a timeline — UX draft

**Status:** **built**, 2026-08-28, as ADR [104](issues/104-curriculum-blocks-as-a-timeline.md), minus the drag and minus the soft dates in §3. The ADR is the decision of record; this doc is the reasoning behind it and is left as written. Companion to [`curriculum-plan.md`](curriculum-plan.md), which is the product case. That doc decided **what** a block is. This one proposes **how you edit a sequence of them**, and it changes the plan doc's §4 model.

Written 2026-08-28, from the owner's vision: *"I don't want this to be too rigid and follow the plan no matter what, if it was planned for a year. A coach creates logical blocks and sets each one for a week, two, or a month. Like a schedule calendar, but one cell is two weeks. Any instructor can shrink or expand a block, and the blocks after it move forward or backward. Like a timeline in a video editing app."*

## 1. The vision names the real problem, and the plan doc missed it

`curriculum-plan.md` §4 models a block as an independent date range: `starts_on`, `ends_on`, a theme. Eight blocks are eight rows that know nothing about each other.

That model is fine to store and painful to live with. Say a gym plans twelve blocks through to Christmas, then spends three weeks on closed guard instead of two. To fix the plan, someone re-dates eleven rows by hand. Nobody does that. They give up, the dates rot, and by week six the curriculum screen is lying about what the gym teaches.

**That is how this feature dies, and it is the failure mode the plan doc's §12 does not list.** Not "the owner never writes it". Not "the coaches feel policed". It is: reality moved, the plan did not, and now the plan is furniture.

The vision fixes it with one idea: **blocks are a sequence, not a set of dates.** Change one, everything after it follows. That turns "we ran long" from eleven edits into one, which is the difference between a plan that gets corrected every Sunday and a plan that gets abandoned.

The ripple is not a nice interaction. It is the feature.

## 2. Three changes to the vision

**Drag and drop is the expensive half, and the least of the value.** Pointer capture, touch, autoscroll, drop targets, and a keyboard path that has to exist anyway. It is used maybe twice a month, by one person, on a laptop. The coach on the mat never touches it. Ship the operations first as buttons (`− 2 weeks +`, move up, move down), because they are pure array arithmetic and they are also the accessible path. Add the drag on top of the same operations once the model has stopped moving. Nothing about the data model changes when it arrives.

**"A month" is not a unit. The week is.** A month is four weeks or five, and the ambiguity infects every date the screen prints. Offer chips: 1, 2, 3, 4, 6, 8 weeks, with 4 labelled "a month". The stored value stays a whole number of weeks.

**The past does not move.** A video timeline ripples in both directions because nothing in it has happened yet. A curriculum has already run. If expanding an October block re-dates September, the screen contradicts the register, and the coverage report in C.6 loses its ground truth. So the ripple pushes **forward only, from the current block onward**. Everything before this week is settled and reads as a record, not a draft.

That line between settled and draft is the answer to *"I don't want this to be too rigid"*. The past is fact. The future is a sketch. The screen should look like that.

## 3. The screen: Schedule → Curriculum

The plan doc's §7 already puts it on a tab beside Templates. Keep that.

### Height is time

The timeline runs **down**, not across, and a block's **height is its duration**. A two-week block is exactly twice the height of a one-week block. Grab its bottom edge, pull down, it becomes three weeks and everything below slides down.

Vertical, for three reasons. Text: a theme is a phrase and phrases want horizontal room, which a film strip does not have. Length: a year is 26 blocks, and horizontal means sideways scrolling, which `better-layout` rules out for the page body. Grammar: **the O2 week grid already draws time as height, with a now-line across it** (`apps/nextjs/src/app/_components/week-grid.tsx`, rule in `packages/domain/src/grid.ts`). A coach who reads the schedule can read this without being taught.

### What is on screen

```
 WEEK   MONTH                                            ← left rail, the calendar half
  ·                ┌──────────────────────────────┐
 w33    AUG        │  Closed guard                 │     settled: flat, muted, no handles
  ·                │  Aug 11 - Aug 24 · 2 weeks    │
 w35               └──────────────────────────────┘
  ·                ┌──────────────────────────────┐
 w35              ═╪══ now, Tue Aug 28 ════════════╪══   the brand now-line
  ·                │  Guard retention   ● running  │     current: raised, one handle
 w37    SEP        │  Aug 25 - Sep 7 · 2 weeks     │
                   │  [ Still on this, +1 week ]   │     ← the most-pressed control here
  ·                └──────────────────────────────┘
 w37               ┌──────────────────────────────┐
  ·                │  ⠿ Passing, knee slice        │     draft: full controls
 w39               │  Sep 8 - Sep 21  − 2 weeks +  │
                   └──────────────────────────────┘
 w41    OCT        ┌──────────────────────────────┐
                   │  ⠿ Back attacks               │
                   │  early October · 2 weeks      │     soft date, past the horizon
                   └──────────────────────────────┘
```

**The left rail is the calendar half of the vision.** Week numbers and month labels, so a block's place in the year is read off the rail rather than off a date string on every card.

**The now-line is the same marker the dashboard and the week grid already draw**, so it costs a component and no new idea.

**Three block states, and they look different:**

| State | Reads as | Controls |
| --- | --- | --- |
| **Settled** (ended before this week) | A record. Flat, muted, no shadow. | None. Open it to read the notes and, once C.2 lands, what was actually taught. |
| **Running** (covers today) | The live one. Raised, brand hairline, a dot. | Extend only. You cannot shorten a week that already happened. |
| **Draft** (starts after this week) | A sketch. Full card, drag handle. | Resize, reorder, delete. |

### Resize

Drag the bottom edge, or press `−` / `+`. Same operation, and the buttons are the keyboard path, so they are not a fallback, they are the definition.

While the edge moves: everything below moves live, and a label follows the cursor with the new end date. On release, one line of feedback: **"Passing moved to Sep 15. 6 blocks after it moved. The plan now ends Dec 21."**

### The two rules that make a ripple safe

**Undo, always.** One drag moves twenty rows. If it cannot be taken back in one press, the timeline becomes frightening, and a frightening editing surface goes unused. Every ripple raises a toast with **Undo**, which restores the previous dates in one mutation. The app already has `toast` from `@matops/ui/toast`.

**Say what moved.** The consequence of a ripple is mostly off-screen: you drag in September and the thing that changed is in December. So name it in that toast, in a sentence, with the new end date. Without it, the owner learns much later that the plan now runs into the Christmas closure.

### Reorder

Grab the handle, drop between two blocks. A gap opens where it will land, and the dates on the moved block and everything between recompute. Buttons first, drag later, as in §2.

### Soft dates past the horizon

A draft block more than eight weeks out prints **"early October"**, not "Oct 6 - Oct 19". The hard date is a promise the gym has not made. A soft date cannot be wrong, so it lowers the cost of the plan being provisional, which is the whole point. The rail still shows the week numbers for anyone who wants to count.

## 4. The one control that matters

On the running block: **"Still on this, +1 week"**.

This is the Sunday-night action. The coach looks at the class, decides the room has not got it yet, presses one button, and the whole rest of the plan is correct again. It is the single most-used control in the feature and it should be the largest thing on the running block. Everything else on this screen exists so that this one button is honest.

If the ripple works and this button exists, the plan survives contact with a real gym. If it does not, the plan is a document, and documents rot.

## 5. Planned against taught, in one column

Once C.2 ships (the taught line on a class), a settled block can show what actually got taught inside it, under its theme. Planned above, real below, same card.

That is the honest version of *"do not follow the plan no matter what"*: the screen stops pretending the plan is the record. It also gives C.6's coverage report a place to live that is not a separate reporting page nobody opens.

## 6. What this changes in `curriculum-plan.md`

**§4, the model.** Two options were weighed.

- **(A) Store `position` and `weeks`, derive every date from one anchor.** Purest. Gaps and overlaps become impossible, and the plan doc's "two blocks overlap, take the most recent" edge case disappears. But every read does arithmetic, and freezing the past needs a second concept.
- **(B) Keep `starts_on` / `ends_on` as the plan doc has them, and make the ripple an operation, not a model.** Reads stay trivial, `blockForDate` is unchanged, and the whole idea is one pure function over a sorted list.

**Take (B).** Add `weeks int` (the duration a human set, so a resize does not have to infer intent from two dates), and put the rule in `packages/domain` next to `grid.ts`:

```ts
rippleFrom(blocks: Block[], index: number, weeks: number): Block[]
```

Sorted by `starts_on`. Change one block's length, recompute every later block's dates end to end, leave everything before `index` untouched. Pure, framework-free, and its tests are the delivery.md §5 first step: extend the current block, shorten it, reorder, never touch a settled block, never leave a gap.

The API takes one mutation, `curriculum.resize` / `curriculum.reorder`, and writes the recomputed tail in **one transaction** so a half-applied ripple cannot exist.

**C.1 grows a little.** It was "list, add, edit, delete a block". It becomes that plus the resize, the reorder and the ripple, which is one domain function, one mutation and one screen. Still one migration, still one table.

**C.3 mostly disappears.** "Repeat blocks forward" was the slice where looping was going to arrive. On a sequence it is *"duplicate these six blocks and append them"*, which is one button over the same ripple function.

**§12 gains a failure mode.** "The plan cannot keep up with the gym, so it is abandoned as furniture." The ripple is the mitigation, and the counter-metric is **edits to future blocks per gym per month**. A plan nobody has corrected in six weeks is a dead plan, whatever the taught-line rate says.

## 7. The laziest first slice

Everything above, minus the dragging:

1. `rippleFrom` in `packages/domain`, with tests. First, per delivery.md §5.
2. The migration the plan doc already specifies, plus `weeks int`.
3. The timeline as a **read** surface with height as duration, the rail, the now-line, three block states.
4. Resize and reorder as **buttons**. `− 2 weeks +`, move up, move down, and "Still on this, +1 week" on the running block.
5. The ripple toast, with Undo and the sentence naming what moved.

Drag is a later pass over the same operations, and it is the pass that needs a browser to verify anyway.

## 8. Open questions

1. **Does a block ever need to not be contiguous?** A gym that closes for two weeks in August. Cheapest answer: no block object for it, and the sequence simply has a gap because the dates say so. Worth confirming a real gym does not want to see the closure on the timeline.
2. **Two coaches editing at once.** v1: the mutation carries the sequence's `updated_at`, and the second writer is told someone changed it rather than silently winning. Any staff writes is already the plan doc's §5 rule.
3. **Does the running block ever shorten?** Proposed: no. It covers today, so part of it has happened. If a gym wants to move on early, the operation is "start the next block on Monday", which is a different, clearer button.
4. **How far ahead do gyms actually plan?** If the honest answer is six weeks, the horizon and the soft-date rule matter more than the reorder. Worth asking the pilot gyms before building either.
