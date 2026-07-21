# matops design language

The look-and-feel rulebook for both apps (web + mobile). Tokens live in
`tooling/tailwind/theme.css`; **this doc says how to use them**. Read it before
building any new screen or component.

Reference: the **Better Auth** website (better-auth.com). We adopt its *design
language*, not its assets. The notes below come from analyzing four screens of
that site (hero, README/features grid, docs, pricing).

---

## 0. Ethos — one sentence

**A technical blueprint for the mat: monochrome, disciplined, data-first.**

Everything reads like a precise engineering drawing. The gym runs on a schedule,
a roster, a clock — so the UI looks like an instrument, not a poster.

---

## 1. The four signature motifs

These are what make the reference recognizable. Use them sparingly and on
purpose. They are our "one bold thing" — everything else stays quiet.

### 1.1 Blueprint marks
Thin hairline rules divide everything. At the corners of ghost buttons and at
the intersections of a grid, a small **`+` crosshair** (registration mark) sits,
like a technical drawing or a scoring mark on the mat. Ghost buttons can carry a
faint **diagonal-hatch** fill. Cards can carry a faint **dot-grid** texture
inside.
- **matops meaning:** the mat diagram / the scoring grid. The `+` is a mat corner.
- **Where:** section frames, the secondary button, empty states, card interiors.
- **Restraint:** hairlines are `--border`. Crosshairs and hatch are decoration —
  at most one per view. Never on a busy screen.

### 1.2 Grain / noise on dark
Dark panels and the hero mark carry a subtle film grain.
- **matops meaning:** the texture of a tatami mat / chalk.
- **Where:** the hero, large empty dark panels, the auth screen. Very low opacity.
- **Restraint:** never behind text-dense content — it hurts readability.

### 1.3 Eyebrow + hairline-rule header
Section titles are a small **UPPERCASE label** with wide letter-spacing, then a
thin line running across the remaining width (e.g. `README ────────`,
`TRUSTED BY ───`).
- **Where:** every major section divider.

### 1.4 Mono for data
`Geist Mono` is reserved for machine/data values: times, counts, prices, tags,
sequence numbers, code, status labels.
- **matops meaning:** the **mat clock / scoreboard**. Class times, capacity
  (`18/24`), round timers, belt/stripe counts, roster totals — all mono.
- **Rule:** if it is a number a person reads off a clock or a board, it is mono.

---

## 2. Color — how it is actually used

The base is **monochrome warm-stone** (see `theme.css`). The reference proves the
discipline: **color only ever appears to carry meaning, never to decorate.**

| Use | Token / value | Notes |
|---|---|---|
| Everything structural | grayscale ramp | bg, text, borders, surfaces, charts |
| Danger / destructive | `--destructive` (red) | cancel a class, delete, hard errors |
| Status (functional) | tiny leading `●` dot + mono label | see below |

**Status pattern (from the reference `● blocked / ● challenged / ● allowed`):**
a small colored dot followed by a **mono** label. This is the *only* place other
hues appear, and only as a 8–10px dot — the text stays neutral.
- matops states this maps to later: booking `● open / ● full / ● closed`,
  attendance `● present / ● late / ● absent`, class `● live now / ● cancelled`.
- Keep the palette tiny: green = go, amber = caution, red = stop/danger. Define
  these as `--status-*` tokens when Phase 3 (booking/attendance) needs them —
  **not before.** Until then, "live now" and "active" are a **filled ink chip**,
  not a color.

Rule of thumb: if you are reaching for a color and it is not danger or a status
dot, stop — use weight, size, or a hairline instead.

---

## 3. Type

One family: **Geist** (sans) + **Geist Mono**. Already loaded on web; mobile
falls back to system until `expo-font` loads it.

### 3.1 Headings — the reference's signature
Big, **light weight (400–500)**, **tight tracking**, sentence case,
left-aligned, generous line-height. Not bold, not centered, not uppercase.
- Utility recipe: `font-medium tracking-tight` (or `font-normal` for the largest
  display sizes). Never `font-bold` on a large heading.

### 3.2 Body
`--muted-foreground` gray for running text, with **bold + `--foreground` white**
inline emphasis on the few words that matter ("inside your app"). Emphasis is
weight + brightness, never color.

### 3.3 Mono
See §1.4. Also: code, terminal snippets, tags/chips, table data, sequence
numbers, tiny UPPERCASE labels on data (`DECLARATIVE CONFIG`).

### 3.4 Scale (starting point)
| Role | Size | Weight | Tracking | Family |
|---|---|---|---|---|
| Display | 48–72px | 400 | tight (-0.02em) | sans |
| H1 | 32–40px | 500 | tight | sans |
| H2 | 24px | 500 | tight | sans |
| H3 | 18–20px | 500 | normal | sans |
| Body | 15–16px | 400 | normal | sans |
| Small / label | 13px | 500 | normal | sans |
| Eyebrow | 12px | 500 | wide (+0.1em), UPPERCASE | sans or mono |
| Data / mono | 13–15px | 400 | normal | **mono** |

---

## 4. Shape & elevation

- **Corners:** sharp. Base `--radius` is `0.375rem`; buttons land at ~4px. Never
  large pill radii except the announcement pill (§5.6) and status dots.
- **Elevation:** **borders, not shadows.** The reference lifts the highlighted
  pricing card with a brighter **outline**, not a drop shadow. Reserve the
  near-flat `--shadow-*` scale for popovers/menus only.
- **Dividers:** 1px hairlines in `--border`. Grids are drawn with hairlines; put
  a `+` crosshair at intersections when the grid is a real matrix (a schedule, a
  feature grid), not a plain list.

---

## 5. Component patterns (observed → matops rule)

### 5.1 Buttons
- **Primary:** solid fill — ink on light, chalk-white on dark — with the opposite
  text color. Sharp corners. One primary per view.
- **Secondary / ghost:** transparent, thin `--border`, foreground text. Optional
  hatch fill + `+` crosshair corners for a "blueprint" accent (use once).
- **External / nav link:** append a `↗` arrow.

### 5.2 Chips / tags
Outlined, sharp, **mono**, muted text (`owner`, `admin`, `no-gi`, `white-belt`).
Thin border, small. Selected = filled ink chip.

### 5.3 Cards
Thin `--border`, `--card` fill, optional faint inner dot-grid. Bold white title,
gray description. Sharp corners.

### 5.4 Section header
Eyebrow (UPPERCASE, letter-spaced) + hairline rule across the row. See §1.3.

### 5.5 Numbered sequence
Mono numerals (`01`, `02`, …) **only when order carries meaning** — an onboarding
flow, the belt path, class check-in steps. Never as decoration on an unordered
list.

### 5.6 Announcement / status pill
Rounded-full, dark translucent fill, small leading icon, right `→`/`↗`. For
one-line notices only.

### 5.7 Nav
Top nav items are **UPPERCASE, letter-spaced, small**. Active item gets a thin
underline indicator. External items get `↗`. Wordmark is set solid and tight.

### 5.8 Data table
Hairline row separators, grouped by category with a small leading icon, **mono**
values, gray sub-detail lines under a value when needed. No zebra striping.

### 5.9 Inputs
Outlined, sharp, `--input` border, leading icon allowed (mail, lock). Focus =
bold `--ring` (ink on light / chalk on dark), high contrast, always visible.

---

## 6. Motion

Minimal. The reference is nearly static; the grain and a few hover states carry
it. Prefer a quiet page-load fade and small hover shifts over animation.
Always respect `prefers-reduced-motion`.

---

## 7. What we do NOT copy

- The 3D noise logo mark — that is Better Auth's brand. We build our own mark.
- Heavy hatch/grain density — we use these at a whisper.
- Their exact copy voice — ours is a gym's, not a dev tool's.

We take the *language* (monochrome discipline, blueprint marks, mono-for-data,
light tight headings, borders-not-shadows) — not the pixels.

---

## 8. Status vs. tokens

| Piece | State |
|---|---|
| Color ramp, radius, fonts, shadows | **done** — `tooling/tailwind/theme.css` |
| Heading treatment, mono usage, motifs | **this doc** — apply when building |
| `--status-*` tokens (green/amber) | **deferred** to Phase 3 (booking/attendance) |
| Mobile Geist via `expo-font` | **todo** |
| Blueprint helpers (crosshair, hatch, dot-grid, eyebrow) | **todo** — small CSS/RN utilities in `packages/ui` |
