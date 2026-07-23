# matops design language

The look-and-feel rulebook for both apps (web + mobile). Tokens live in
`tooling/tailwind/theme.css`; **this doc says how to use them**. Read it before
building any new screen or component.

**Heritage:** the token *plumbing* and the disciplined, monochrome baseline came
from the **Better Auth** brand system — <https://better-auth.com/brand> — which
was the scaffold. **matops now owns its own identity** (ADR 37): a signature
**violet** and the **basketweave** mark are ours, layered on the kept neutral
foundation. Better Auth is heritage here, not the source of truth.

---

## 0. Ethos — one sentence

**Sharp, not loud: monochrome, disciplined, data-first — an instrument, not a poster.**

The gym runs on a schedule, a roster, a clock. Two matops flavors sit on the
greyscale baseline: **Geist Mono is the mat clock** — every time, count, and
score reads like a scoreboard (§3) — and **one signature violet** is the only
identity colour (§1.1), carried by the **basketweave mark** (§6). Everything
else stays monochrome; the violet is a spark, never decoration and never a status.

---

## 1. Foundations

### 1.1 Color

Exact Better Auth values. Light = their `:root` (warm stone); **dark = the brand
page (canonical, pure black)**. Full set in `theme.css`; key tokens:

| Token | Light | Dark |
|---|---|---|
| `--background` | `#FFFFFF` | `#000000` |
| `--foreground` | `#0C0A09` | `#FAFAF9` |
| `--card` / `--popover` | `#FFFFFF` | `#0A0A0A` |
| `--primary` | `#1C1917` | `#FAFAF9` |
| `--primary-foreground` | `#FAFAF9` | `#1C1917` |
| `--secondary` / `--muted` / `--accent` | `#F5F5F4` | `#292524` |
| `--muted-foreground` | `#79716B` | `#A6A09B` |
| `--border` / `--input` | `#E7E5E4` | `#292524` |
| `--ring` | `#A6A09B` | `#79716B` |
| `--destructive` | `#E40014` | `#82181A` |

**Callout accents** — the *only* non-neutral hues, and only for meaning
(callouts, alerts, status dots). Same in both themes:

| Token | Hex | Use |
|---|---|---|
| `--info` | `#2B7FFF` | neutral notice ("Heads up") |
| `--warning` | `#FF6900` | caution ("Careful") |
| `--error` | `#FB2C36` | failure ("Broken") |
| `--success` | `#00C950` | confirmation ("Nice") |

Rule: if a color is not `--destructive`, `--brand` (below), or one of these four,
don't use it. Reach for weight, size, or a hairline instead. matops status maps
onto these when Phase 3 lands: booking `● open/full/closed`, attendance
`● present/late/absent`, class `● live/cancelled` — a small dot + a **mono**
label, text stays neutral.

**Brand hue — violet (the one identity colour).** The single non-neutral hue that
is *not* a status. Restrained: the mark, active nav, links, focus, the pending
banner/tag — never a solid primary button (that stays ink), never a status.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand` | `#6A4DFF` | `#8B72FF` | mark fill, active nav, focus |
| `--brand-strong` | `#5A3CF0` | `#A390FF` | links / text-on-light |
| `--brand-foreground` | `#FFFFFF` | `#12091F` | text + seams on a brand fill |
| `--brand-wash` | `#F1EEFF` | `#17122E` | tint surface: pending, active nav |

Rule: violet marks **identity**, the four callouts mark **meaning** — they never
swap jobs. Utilities: `bg-brand`, `text-brand-strong`, `bg-brand-wash`, `fill-brand`.

### 1.2 Typography

**Geist** for UI, **Geist Mono** for code & metadata. Their exact specs:

| Role | Recipe | Family |
|---|---|---|
| H1 | `text-4xl tracking-tight` | Geist |
| H2 | `text-xl tracking-tight` | Geist |
| Body | `text-sm` | Geist |
| Mono label | `text-[11px] font-mono uppercase tracking-wider` | Geist Mono |
| Mono code | `font-mono text-sm` | Geist Mono |

Headings are **tight-tracked**, sentence case, left-aligned — never bold-and-big.
Body emphasis is weight + brightness (`font-medium text-foreground`), never color.

### 1.3 Radius

Base `--radius: 0.2rem` — deliberately tight. **Code blocks and inline callouts
break to `0`** (`rounded-none`) for a sharper, editorial feel. Scale:

| Step | Value |
|---|---|
| sharp (code/callout) | `0` |
| `sm` | `calc(var(--radius) - 2px)` |
| `md` | `calc(var(--radius) - 1px)` |
| `lg` (default) | `var(--radius)` |
| `xl` | `calc(var(--radius) + 4px)` |

### 1.4 Shadow

Used **sparingly — only to lift interactive affordances** (menus, popovers).
**Cards and code stay flat** and rely on `--border`. The near-flat `--shadow-*`
scale exists for the few things that float.

---

## 2. Motifs

Blueprint background textures. On web they are utilities in
`apps/nextjs/src/app/styles.css`; on mobile the `Blueprint` primitive
(`apps/expo/src/components/ui.tsx`) tiles the same hairline grid with Views
(ADR [44](issues/44-mobile-dark-first-design-system.md)), used behind the
sign-in hero.

| Utility | Pattern | Size |
|---|---|---|
| `.bg-grid` | hairline grid | 32px |
| `.bg-grid-small` | hairline grid | 8px |
| `.bg-dot` | dot field | 16px |

All draw with `--border`. matops meaning: the mat diagram / scoring grid. Use at
a whisper, behind non-text areas (hero, empty states, card interiors) — at most
one per view.

---

## 3. The one matops flavor — mono is the mat clock

`Geist Mono` is reserved for machine/data values: times, counts, prices, tags,
sequence numbers, code, status labels. In matops that means **class times,
capacity (`18/24`), round timers, belt/stripe counts, roster totals — all mono.**
If it is a number a person reads off a clock or a board, it is mono.

Numbered sequences (`01`, `02`, …) use mono numerals **only when order carries
meaning** — an onboarding flow, the belt path, check-in steps. Never as decoration.

---

## 4. Components (Better Auth taxonomy — build to match)

**How components are built for both clients:** share the style recipe, split the
primitive. shadcn (Radix/DOM) drives web; RN twins drive mobile; both eat one
`cva` recipe of cross-platform classes so variants can't drift. Full mechanics
(conditional `exports`, the container/text split, overlays via
react-native-reusables) in **ADR [32](issues/32-cross-platform-ui.md)**. Button
is the reference pair (`packages/ui/src/button.tsx` + `button.native.tsx` +
`button-variants.ts`). Literal colors for RN come from `@matops/ui/tokens`.


- **Buttons** — six variants: `default` (solid), `secondary`, `outline`,
  `ghost`, `link`, `destructive`. Four sizes: `sm`, `default`, `lg`, `icon`.
  Sharp corners; one solid primary per view.
- **Inputs** — sharp, minimal. **UPPERCASE mono field labels** (`EMAIL`,
  `PASSWORD`). Focus = visible `--ring`.
- **Card** — flat `--border`, **no shadow**. Meta separated by a **dashed** rule
  (`border-dashed`), not solid.
- **Callouts** — a **dashed left stripe** colored by accent type: info / warning /
  error / success (Heads up / Careful / Broken / Nice). Body copy stays neutral.
- **Tabs** — for switching content (e.g. code languages); active tab gets a thin
  underline/outline.
- **Badges** — `default`, `secondary`, `destructive`, `outline`. Small, sharp.
- **Alerts** — title + one-line description (e.g. "Auth secret updated").

---

## 5. Voice (Better Auth's four rules, for our copy)

- **Clear over clever** — name things what they are (class, invite, roster — not
  `MembershipProvider`).
- **Terse, but warm** — short sentences, no marketing fluff. A thoughtful coach,
  not a billboard.
- **Show the thing** — a real schedule or roster proves more than a paragraph.
- **Sharp, not loud** — minimal radii, dashed dividers, mono for data. Precise,
  never decorative.

---

## 6. Logo

**Mark = the basketweave mat bond.** A rounded tile (`rx` 6.5 on a 32 viewBox)
filled `--brand`, seams of a **basketweave** bond — the woven plank pairs real
mats are laid in — in `--brand-foreground` at 85%. Seam path:
`M16 1.6V30.4 M1.6 16H30.4 M8.5 1.6V16 M16 8.5H30.4 M1.6 23.5H16 M23.5 16V30.4`.

Built once, shared: **`@matops/ui/logo`** — `Mark` (tile) + `Logo` (mark +
wordmark); web = inline SVG, mobile = positioned Views (no `react-native-svg`).
Web favicon: `apps/nextjs/src/app/icon.svg`. Use the mark at **24px minimum**;
prefer the full `Logo` when the brand must read at a distance. Wordmark: `matops`,
lowercase Geist ~640 weight, `-0.02em` tracking, "ops" in `--brand-strong`. Full
reference: `docs/design-system/matops-design-system.html`. Rationale in ADR 37.

---

## 7. Status

| Piece | State |
|---|---|
| Color tokens (light+dark), **brand (violet)**, callout accents, radius, shadow, fonts | **done** — `theme.css` |
| Motif utilities (`.bg-grid` / `-small` / `.bg-dot`) | **done** — web `styles.css`; mobile `Blueprint` (ADR 44) |
| Heading treatment, mono-as-clock, voice | **this doc** — apply when building |
| Cross-platform component pattern + reference Button | **done** — ADR [32](issues/32-cross-platform-ui.md) |
| `@matops/ui/tokens` (literal colors for RN) | **done** |
| Remaining components (input…alerts) to Better Auth taxonomy | **todo** — `packages/ui`, follow the Button pattern |
| Overlays on mobile via react-native-reusables | **todo** — verify nativewind-5 compat |
| Mobile **dark-first** theme (tri-state, persisted) | **done** — `components/theme.tsx`, ADR 44 |
| Mobile Geist via `expo-font` (Geist + Geist Mono) | **done** — `components/fonts.ts`, ADR 44 |
| Mobile kit derived from `@matops/ui/tokens` + web vocabulary (`Eyebrow`/`Stat`/`Card`/`Callout`) | **done** — ADR 44 |
| Retire `apps/expo/src/components/ui.tsx` local kit | **partial** — token-derived + aligned (ADR 44); full merge onto `@matops/ui` RN primitives pending |
| matops `● status` states (booking/attendance) | **Phase 3**, onto callout accents |
| matops basketweave mark + wordmark | **done** — `@matops/ui/logo`, `app/icon.svg` |
