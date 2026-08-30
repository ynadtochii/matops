# 102 — The coaches screen stops jumping, and a button in flight stops resizing

**Status:** accepted · **Date:** 2026-08-28 · **Area:** `apps/nextjs`, `packages/ui`. No migration, no procedure changed. **Refines:** [101](101-the-dashboard-uses-its-width.md), [80](80-loading-states.md), [62](62-coach-workload-and-coverage.md), [32](32-cross-platform-ui.md)

## Context

The same design pass as ADR 101, run over O10. This one was measured in a
browser against the seeded demo academy (5 coaches, 1 pending request), so the
numbers below are observed rather than reasoned.

## 1. Changing the window threw the page 1100px and back

Clicking "Last month" for the first time, measured on the live page:

| moment           | content height | cards on screen | range label    |
| ---------------- | -------------: | --------------: | -------------- |
| before the click |         2507px |          5 real | Aug 1 - Aug 31 |
| +80ms            |     **1396px** |     3 skeletons | **gone**       |
| +680ms           |         2308px |          5 real | Jul 1 - Jul 31 |

Every query keyed on the window went back to `isPending`, so the roster was
replaced by `SkeletonCoachCards n={3}` (a hardcoded 3, whatever the roster
size), the range eyebrow beside the tabs blanked out, and the Staff section
below leapt up 1100px and back down. With the scroll container held at a 700px
viewport and scrolled to 1109, the click clamped it mid-transition and left it
at 981.

The window tabs are the main control on this screen. Fix:
`placeholderData: keepPreviousData` on `stats.coaches`, `stats.coach`, and the
per-card detail. The figures stay on screen and are replaced in place; while
`isPlaceholderData` is true the block drops to 60% opacity, which is the static
cue that the numbers are the old window's. The skeleton is now only the first
load, where there is nothing to keep.

Nothing in the app used `placeholderData` before this. It is the right tool
anywhere a filter re-keys a query that is already showing data.

## 2. Expanding a coach snapped 700px open

Measured: the card went **157px to 856px instantly**, and the next coach card
jumped from y=471 to y=1170. No enter, no exit.

`packages/ui/src/collapsible.tsx` wraps Radix `Collapsible`, which is already in
the tree (`radix-ui` is a direct dependency of `@matops/ui`) and whose height
variable `tw-animate-css` already has keyframes for. Content now animates open
and closed, held still under `prefers-reduced-motion`. Radix unmounts closed
content, so a collapsed card still fires no query.

The list it reveals was also **uncapped**: `breakdown.recent` is every led class
in the window, measured at 18 rows on "This month" and roughly triple that on
"Last 90 days", with no slice and no scroll container. It now shows 8 and says
how many more, which is the cap the dashboard's drifting list already uses. This
mattered most for an instructor, whose own card is permanently open with no
toggle.

## 3. The toggle resized itself under the cursor

Measured **100px to 132px** as the label went "Breakdown" to "Hide breakdown".
The label is now constant and a chevron carries the state, rotating 180° on
`rotate` alone. Wrapping the button in `CollapsibleTrigger asChild` also gets
`aria-expanded` for free, which the text label had been standing in for.

The chevron is a hand-rolled SVG next to the existing `MoreIcon` in
`primitives.tsx`, at `1.5px` stroke to sit beside the button's medium-weight
label. `@radix-ui/react-icons` is a dependency of `@matops/ui`, not of the app,
and this was not worth adding one for.

## 4. Three different treatments for a button in flight

On one screen: "Rotate" became "Rotating…", "Create link" became "Creating…",
and Approve and the confirm button prepended a `Spinner` to an unchanged label.
All three resized the control that had just been pressed.

`Button` now takes **`busy`**: the label keeps its box via `display: contents`
plus `visibility: hidden`, and the spinner is absolutely positioned over it, so
the button cannot change width mid-action. `AlertDialogAction` renders a real
`Button` rather than borrowing `buttonClass()`, so `ConfirmDialog` gets the same
behaviour everywhere in the app.

`busy` is ignored under `asChild`, since Radix `Slot` takes exactly one child.
It is web-only: `button.native.tsx` does not have it, and the prop is optional,
so the shared recipe in `button-variants.ts` is untouched and the pair does not
drift in anything ADR 32 cares about.

## 5. `CopyButton` hard-swapped its icon

Both icons now sit in a one-cell grid and cross-fade on
`cubic-bezier(0.2, 0, 0, 1)`: scale `0.25` to `1`, opacity `0` to `1`, blur
`4px` to `0`. The two labels stack the same way, so the button sizes to the
wider of "Copy" and "Copied" and stops jumping; the inactive one carries
`aria-hidden` so a screen reader still hears one label. This reaches the coaches
screen through the instructor invite card and every other screen through the
academy code, the payment reference and a member's phone.

## 6. Violet was doing a data job

The weekday and per-week bars were `bg-brand/70`. Measured 12 of them in one
expanded card, correctly themed but still 12 violet bars. `design.md` §1.1 says
the violet is a spark, never decoration and never a status; the dashboard's
equivalent chart uses the discipline hues at 20% or a neutral. These are
`bg-muted-foreground/40` now: monochrome, which is what the bars are actually
saying.

## 7. Everything was 16px apart

Measured: the last coach card ended at 1116 and the Staff heading began at 1132.
One `flex flex-col gap-4` held the pending-requests block, the tab row, five
coach cards and the whole Staff section, so Staff read as a sixth coach card.
Three blocks at `gap-10` now, 16px kept inside the coach group, matching the
rhythm ADR 101 set on the dashboard.

Also: `SectionHeading` has taken a `count` prop since v1.1 that draws the violet
`CountBadge` used by the sidebar and the tabs. "Coach requests (1)" had been
plain-text parentheses. And ADR 101's `ENTER` / `RESOLVE` moved out of
`dashboard-screen.tsx` into `primitives.tsx`, so the two screens share one
motion vocabulary instead of one having none.

The staged entrance and the stale-dim are on **separate elements** on purpose.
Both wanted a duration, and `tw-animate-css` re-defines `delay-*` to set
`animation-delay` while Tailwind's own rule still sets `transition-delay`, so a
single element carrying both had its dim delayed and its duration decided by
whichever `duration-*` survived the class merge.

## 8. Two skeletons that were not the screen

`SkeletonBreakdown` drew two of the panel's three blocks and omitted "Classes
led", which is the tallest; measured, the panel's four lists are 3, 7, 5 and 18
rows and the missing one was the 18. It draws all three now.

`CoachesSkeleton`, the route fallback, drew two coach cards **with toggles** plus
the entire Staff section: heading, description, invite card, two staff rows. An
instructor sees one card with no toggle and no Staff block at all. Same fix as
ADR 101 §1: draw only what both roles share, which is the header, the tab row
and one card. That also retires the `pt-4` the skeleton had on its staff section
and the real screen did not.

## Not verified

The findings above were **measured live**. The fixes were **not**: partway
through the session the browser tooling stopped hydrating the app, leaving every
page on the "Opening your academy" loader with the real content sitting in
`<div hidden>` blocks and no console error.

**This was proven not to be the change.** Stashing the entire working tree and
rebuilding from `HEAD` reproduced it exactly, in both `next dev` and
`next start`. It is the environment.

What did pass: `pnpm typecheck` 17/17, `pnpm -F @matops/nextjs lint` and
`pnpm -F @matops/ui lint` clean, `next build` green with all 23 routes still
Partial Prerender, and a grep of the built CSS confirming
`transition-property: rotate`, `transition-property: opacity,scale,filter`,
`.contents{display:contents}`, `scale-25`, `blur-[4px]`,
`animate-collapsible-down` / `-up`, `bg-muted-foreground/40` and
`cubic-bezier(.2,0,0,1)` are all emitted, and that `tw-animate-css`'s
`animation-delay` rule lands after Tailwind's `transition-delay` one so the
stagger actually staggers.

Left to check on a working browser: the collapsible open and close at 10% speed,
the icon cross-fade, that a busy button really holds its width, and that
`bg-muted-foreground/40` reads on the black theme.

## Consequences

- `busy` on `Button` is the one in-flight treatment. A call site that swaps its
  own label to "…ing" is now the odd one out.
- `keepPreviousData` is the pattern for a re-keyed query that already has data.
  Members and Payments have tabbed lists that were not looked at here.
- `packages/ui/src/collapsible.tsx` exists now, so the next disclosure has one.
