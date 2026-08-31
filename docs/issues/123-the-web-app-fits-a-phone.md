# 123 — The web app fits a phone

**Status:** accepted · **Date:** 2026-08-31 · **Area:** `packages/ui` (`button.tsx`, `input.tsx`, `select.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `dropdown-menu.tsx`), `apps/nextjs` (`_components/app-shell.tsx`, `_components/primitives.tsx`, and the screens that hold a control). **No migration.** **Relates to:** [32](32-cross-platform-ui.md), [45](45-mobile-ease-of-use.md), [73](73-student-web-parity.md), [122](122-the-link-is-two-taps-away.md).

## Context

The owner web already had a mobile shape: a bottom tab bar, a mobile header, a
list view of the schedule where the desktop draws a grid. Every screen was
reachable on a phone. Almost nothing on them was comfortable to hit.

**Nothing enforced a touch target.** `webSize` in `button.tsx` carried a 44px
floor for `size="sm"` and nothing else, and the entry it did have never ran:
`buttonClass` gated it on `size && webSize[size]`, and `size` is `undefined`
whenever a caller takes the default. So the floor applied only when someone
typed `size="sm"`, and the most common button in the app, `size="default"` at
36px, had no floor at all. `Input` and `Select` were 36px. `ICON_BTN` on the
curriculum screen was 28px. The mobile header's own controls, which are the
only way to reach the feed, the share dialog and sign-out, were 32px.

**`Select` zoomed iOS Safari on focus.** `Input` and `Textarea` both carry
`text-base md:text-sm`, which is the rule that keeps a phone from zooming into
a focused field. `Select` was `text-sm` at every width, so tapping a form's
select jumped the page while its inputs did not.

**Seven tabs shared a phone's width.** An owner's nav is Dashboard, Schedule,
Members, Coaches, Referrals, Payments and Settings. At 390px that is 53px each,
and at 320px it is 45px, which truncates every label to four characters.

**Three skeleton bars were wider than a phone.** `w-96` is 384px inside a
column of 327px, so the page scrolled sideways while it loaded and settled back
when it did not.

## Decision

### 1. The floor lives in the kit, not in the screens

Every button size gets `min-h-11` up to `sm:`, and the `size ?? "default"` fix
makes the entry apply to a caller that names no size. `Input` and `Select` are
`h-11 sm:h-9`. `Select` takes `text-base md:text-sm`, matching `Input`.
`DropdownMenuItem` takes `min-h-11 sm:min-h-0`.

Fixing this in the recipe rather than at the call sites is the point: there are
roughly two hundred controls across the owner screens and they are all drawn
through these six files. `min-h` rather than `h` so a caller that sets its own
height still clears the floor, and `sm:` rather than a pointer query so the
behaviour follows the layout the rest of the app already switches on.

### 2. An inline icon keeps its size and grows its tap area

A copy button sitting inside a line of text cannot become 44px square without
pushing the line apart. `TAP` in `primitives.tsx` is `after:absolute
after:-inset-2.5`, which extends the hit box without touching layout, and
`ICON_BTN` carries the same. The drawn square stays at 24px; the thumb gets
44px.

### 3. Past five tabs, the tail becomes one menu

`MAX_TABS = 5`. Beyond it the bar shows the first four and a **More** tab that
opens a menu holding the rest, and the badges of the hidden items are summed
onto the More tab, so an owner still sees that a payment claim is waiting. A
student has four tabs and never meets it.

### 4. The mobile header drops what the Profile screen already has

Theme and sign-out both live on `/profile`, which the avatar in that same
header opens. Keeping duplicates cost the header the room its remaining
controls needed to be hittable, so the duplicates go: seven controls at 32px
become four at 44px, and nothing became unreachable.

## Out

The desktop week grid stays hidden on a phone, the curriculum timeline keeps
its existing drag (it already sets `touch-none` on every handle, so it works on
touch), and no screen was restructured. This wave moves sizes, wraps rows that
could not fit and scrolls tab strips that overflowed. It does not redesign
anything.

Copy was not swept. Several user-visible strings use an em dash against the
house style; that is a separate pass.

## Verified

Driven with Playwright against a signed-in owner session at 390px and 320px,
across `/`, `/schedule`, `/members`, `/coaches`, `/referrals`, `/payments`,
`/settings`, `/notifications`, `/profile`, `/attendance`, `/training` and the
public `/sign-in`, `/privacy`, `/book/<code>`, `/start`: **no route scrolls
sideways, no control is under 40px, and no text field is under 16px.** The
one-off class dialog, the share dialog, the More menu and the referral dialog
were opened and measured: each fits the viewport, scrolls its own overflow and
puts nothing outside its panel. `pnpm typecheck` 17/17, `@matops/nextjs` and
`@matops/ui` lint clean, `next build` green.

**Not verified:** the suites were not run. The hydration warnings on `/`,
`/schedule`, `/coaches` and `/notifications` are **pre-existing** (reproduced on
a clean tree with these changes stashed, and the affected route varies per run,
which fits the clock) and are not addressed here.
