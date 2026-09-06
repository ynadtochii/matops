# 131 — One motion vocabulary for the owner screens

**Status:** accepted · **Date:** 2026-09-06 · **Area:**
`tooling/tailwind` (`theme.css`), `packages/ui` (`dialog.tsx`,
`alert-dialog.tsx`, `dropdown-menu.tsx`), `apps/nextjs`
(`primitives.tsx`, new `tabs.tsx`, and one pass over every owner screen).
**Relates to:** [80](80-loading-states.md) (the loader and the skeletons this
motion hands off to), [37](37-brand-and-shells.md) (the brand rules the
transitions obey).

## Why

The owner screens grew their motion one wave at a time. Waves 4.9 to 5.1 built
a real vocabulary: `ENTER` for a page section arriving, `RESOLVE` for a query
settling, `PRESS` for a control taking a press, one `busy` treatment for a
button in flight. Wave 5.4 to 5.7 built the curriculum's drag. Nothing tied
them together, and three things were left undone.

**No curve was ever chosen.** Every `transition-*` in both apps fell back to
Tailwind's default `cubic-bezier(0.4, 0, 0.2, 1)` and every `animate-in` to the
plain CSS `ease`. Both start slow. They delay the frame the reader is actually
watching, so a 200ms transition reads as a 300ms one.

**Half the screens had no motion at all.** Schedule, Templates, Settings,
Organization settings, Staff, Attendance and Notifications drew their content
in one hard cut, next to a Dashboard and an Overview that staged theirs.

**Two things moved the wrong way.** The attendance rule animated `width`, which
relays out the roster on every student marked. The tab underline blinked out of
one tab and into another, so nothing carried the eye across.

## What

**One set of curves, in the theme both apps read.** `--ease-out`
(`cubic-bezier(0.23, 1, 0.32, 1)`) for anything entering or leaving,
`--ease-in-out` (`cubic-bezier(0.77, 0, 0.175, 1)`) for something moving on
screen, `--ease-drawer` for a sheet. `--default-transition-timing-function` is
the ease-out, so a bare `transition-colors` gets it with no class. **There is
deliberately no ease-in token.** It is the one curve a user interface must not
use.

**The vocabulary carries the curve.** `ENTER` and `RESOLVE` now name
`ease-out`; the dialog, the confirm dialog and the dropdown name it too, with
their durations written down (200ms for a modal, 150ms for a menu) instead of
inherited. A new `stagger(index)` deals list rows out 40ms apart and **caps at
six**, so a hundred-row roster is not still arriving a second later.

**The tab rail travels.** `Tabs` moved to its own client module
(`apps/nextjs/src/app/_components/tabs.tsx`, because `primitives.tsx` is
imported by server components and now could not hold a hook) and draws one 1px
bar scaled on the x axis, so the move is transform-only. Every tab panel is
keyed by its tab and carries `RESOLVE`, so switching is a crossfade rather than
a cut.

**The Schedule week keeps the week it has.** `class.week` takes
`keepPreviousData` and the grid dims to 60% while the next week loads, the
treatment the Coaches screen already used. An arrow press no longer throws the
whole grid away for a skeleton.

**The attendance rule runs on the GPU.** Two full-width bars scaled and
translated, rather than two widths, so marking a student paints instead of
relaying out.

## Rules this pass held to

- Nothing animates on the sidebar or the tab bar. Navigation is a hundred-times
  a day action, and Raycast is right about it.
- Every transform transition names `motion-reduce:transition-none`. Reduced
  motion keeps the opacity and drops the movement, rather than holding
  everything still.
- No UI animation runs past 300ms, and only the page-level `ENTER` reaches it.
- No new dependency. Every animation here is a CSS transition or a
  `tw-animate-css` keyframe.

## Out

Route transitions between owner pages (the View Transitions API, once the shell
is not remounting), a shared-element move from a list row to its detail page,
and any spring. The one place a spring would earn its keep is the curriculum
drag, which already has its own tuned pointer motion.
