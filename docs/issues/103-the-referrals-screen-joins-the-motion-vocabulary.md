# 103 — The referrals screen joins the motion vocabulary, and its most-pressed control answers a press

**Status:** accepted · **Date:** 2026-08-28 · **Area:** `apps/nextjs`. No migration, no procedure changed, no new dependency. **Refines:** [102](102-the-coaches-screen-stops-jumping.md), [101](101-the-dashboard-uses-its-width.md), [80](80-loading-states.md), [52](52-internal-referrals.md), [56](56-referral-corrections.md)

## Context

The third screen in the ADR 101 / 102 design pass, run over O9. ADR 102 ended
with two consequences: `busy` is the one in-flight treatment for a button, and
`packages/ui/src/collapsible.tsx` exists so the next disclosure has one. O9 had
one call site for each, both written before those existed.

Nothing here changes what the screen does. Every write, query and rule is
untouched.

## 1. Two controls resized themselves under the cursor

The dialog's save button read "Record referral" and became "Saving…" the moment
it was pressed. The label a person had just read was replaced by a different
one, in a control that changed width at the same time. This is the pattern
ADR 102 §4 replaced everywhere else. It now passes `busy={pending}` and keeps
one constant label.

The dialog's history toggle read "View history" and became "Hide history",
which is the same resize ADR 102 §3 fixed on the coaches screen. The label is
now "History" and a chevron rotates on `rotate` alone.

## 2. The history list appeared in one frame, inside a box that then grew

`showHistory && <ReferralHistory/>` mounted the whole timeline at once, and the
dialog it sits in grew by however tall that timeline was. It is a `Collapsible`
now, so it slides. Radix unmounts closed content, so a collapsed panel still
fires no query, which is what the old `&&` gave. That is parity, not a gain.

The gain is that `CollapsibleTrigger asChild` carries `aria-expanded`, so the
hand-written `aria-expanded` on the old button is gone, and the state is no
longer told only by a word that moves.

## 3. The screen had no motion at all

Every other screen in this pass stages its entrance. This one drew all of its
content in a single frame. It is three chunks now, 100ms apart, using the
`ENTER` from `primitives.tsx`: the summary and the search row, the credited
board, the people nobody has been credited for. `RESOLVE` is not used, because
there is one query and one skeleton, and the body's own `ENTER` already covers
the moment it is replaced.

## 4. Everything was 16px apart, and the skeleton did not agree with the screen

The three top-level blocks sat in one `gap-8`, which is the problem ADR 102 §7
found on the coaches screen. They are `gap-10` now, with the summary and its
search row grouped at `gap-6` because they are one thought.

`SkeletonReferralsBody` was still `gap-8` with the summary and the search row as
loose siblings, so the placeholder and the real screen used different rhythms
and the swap moved things. It mirrors the new grouping.

## 5. The most-pressed control on the screen answered nothing

A student chip inside a referrer's card is how an owner changes who brought a
student in, and it is the only route to that dialog for anyone already
credited. It had `transition-colors` and nothing else.

It takes `active:scale-[0.96]` now. A chip is at most 208px wide, so 4% is about
8px of travel, which is feedback. The uncredited rows deliberately **do not**
scale: they are full-width, which is the case ADR 101 §6 calls a lurch. They get
the focus ring they were missing instead, and so does the chip.

## 6. A tooltip was doing an accessible name's job

The chip carried `title="Change who brought <name> in"`. A `title` never appears
on touch, and a screen reader announced only the student's name, so the one
thing that says what pressing it does was invisible to both. It is an
`aria-label`.

## 7. Two controls were under the touch target

The chips were 30px tall and the "Show removed students" label was 20px. Both
take `min-h-11 sm:min-h-0`, which is the floor `Button`'s `sm` size has used
since ADR 59. Desktop keeps the dense height in both cases.

## Not verified

**Nothing was looked at in a browser.** The browser tooling in this session had
no tab to attach to and failed on every attempt, which is the third session in
a row (see ADR 102 "Not verified" and ADR 100).

What did pass: `pnpm -F @matops/nextjs typecheck` and `lint` clean, `next build`
green, and a grep of the built CSS confirming
`transition-property:background-color,border-color,scale`,
`.active\:scale-\[0\.96\]:active{scale:.96}`,
`min-height:calc(var(--spacing)*11)` with its `sm` reset,
`animate-collapsible-down`, `transition-property:rotate` and
`animation-delay:.2s` are all emitted, with `motion-reduce:active:scale-100`
correctly inside the `prefers-reduced-motion` media query.

Left to check on a working browser: the history collapsible at 10% speed, the
chip press, the three-step entrance, and that a 44px chip row does not eat the
card on a phone.

## Consequences

- Every call site of the two ADR 102 patterns is now converted. A screen that
  swaps a button's label to "…ing", or reveals a block with `&&`, is the odd one
  out.
- A small control may scale on press; a full-width row still may not. That is
  now stated twice, here and in ADR 101 §6.
