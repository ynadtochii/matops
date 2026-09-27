# 143 · A monochrome interface with lit edges

**Status:** accepted · **Date:** 2026-09-27 · **Area:** `apps/nextjs/src/app/theme.css`, `packages/ui`, `apps/expo` · **Amends:** [141](141-adopt-the-linear-design-system.md) (the violet on controls, the dark values)

## Context

ADR 141 kept the violet for focus, checked controls and the field halo. The
owner wants the interface in black, white and grey only. The reference is
lazy.so, measured in Chrome on 2026-09-27:

- A cool grey scale: page `#131416`, deep sections `#0a0a0a`, inner surfaces
  `#1a1b1f` and `#26272c`, edges `#323338`. Body text `#8a8c93`, strong text
  pure white.
- Depth from light, not hue. A raised panel has a 0.5px border drawn as a
  gradient (bright at the top left, dark at the bottom right), a faint white
  glow above and two black drops below. A button has a 1px white-to-clear
  gradient edge around a dark body.
- Most cards have no border. Only raised and selected things get an edge.
- Progress bars fill with a grey-to-white gradient on a `#26272c` track.

## Decision

This is Phase 1 of 4: tokens only. Primitives, app screens, light mode and the
`/linear-ds` page follow in later changes.

- **Violet leaves every control.** `--ring` is `--foreground` in light
  (14.3:1 on white) and `#b5b6ba` in dark (9.1:1 on a card). The checkbox and
  native checkboxes fill with `--primary`. The field halo is the new neutral
  `--ring-halo`. `--brand-wash` is gone. `--brand`, `--brand-strong` and
  `--brand-foreground` stay for the mark, the wordmark and the mat loader only.
- **Dark takes the lazy.so scale.** Background `#0a0a0b`, card `#131416`,
  raised `#1a1b1f`, floating `#1f2024`, fills and track `#26272c`, border
  `#26272c`, strong border and field edge `#323338`. Text steps are `#ffffff`,
  `#b5b6ba`, `#8a8c93` and `#6c6e74`. Faint text is lighter than the measured
  `#62646a` so placeholders keep 3.4:1 on a raised field.
- **New tokens:** `--edge-lit` (controls) and `--edge-rim` (raised panels) are
  border gradients; `--shadow-key` is the 1px lip under a key cap;
  `--meter-fill` is the progress fill; `--ring-halo` is the focus halo.
  `--shadow-lift` and `--shadow-float` gain a white inset top line in dark.
- **New utilities** (`styles.css`): `edge-lit-<color>` and `edge-rim-<color>`
  draw the gradient border around a solid fill of that color, and `bg-meter`
  paints the progress fill.

## Consequences

- Every screen changes in dark at once through the tokens. No screen code
  changed apart from the violet swaps.
- Dark still fails 3:1 on field and control edges (`--input` 1.37:1 on a
  raised field, `--control` 1.9:1 on a card), the same known failure as ADR 141.
- An `edge-*` utility sets the whole `background`, so it cannot be combined
  with a `bg-*` utility on the same element.
- The Expo app follows through `packages/ui/src/tokens.ts`; its settings switch
  track is `--primary`.

## Phase 2: primitives (2026-09-27)

- **Button:** 5px corners (`rounded-control`, a new radius token) in place of
  pills. `secondary` is `edge-lit-surface-2` with a lift shadow and steps to
  `surface-3` on hover. `outline` uses the strong edge.
- **Badge:** 4px corners. Neutral sits on `--surface-2` with the strong edge.
- **Dialog, AlertDialog:** `edge-rim-raised`. **DropdownMenu:**
  `edge-rim-floating`.
- **New `@matops/ui/card`:** `cardClass({ level, interactive })` with `flat`,
  `raised` and `selected`. A new `--card-edge` token is a line in light and
  transparent in dark, so flat cards have no visible edge in dark.
- **New `@matops/ui/meter`:** a 4px bar with one value or several segments,
  the gradient fill or a status tone, `role="meter"` with aria values, capped at
  `max` (soft capacity can overflow). `glow` adds a soft white light at the tip of the
  fill, whatever the tone, in dark mode only (from lazy.so's slider bar, which
  uses violet). The default `neutral` tone is the white bar. The roster's
  marking rule is a `Meter` with `glow`.
- **New `@matops/ui/kbd`:** a key cap with the `shadow-key` lip.
- Fields need no class change: in dark `--raised` and `--input` already give
  the `#1a1b1f` fill and `#323338` edge.
