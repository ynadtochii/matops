# matops design language

The look-and-feel rulebook for both apps (web + mobile). Tokens live in
`tooling/tailwind/theme.css`; **this doc says how to use them**. Read it before
building any new screen or component.

**Heritage:** the token _plumbing_ and the disciplined, monochrome baseline came
from the **Better Auth** brand system — <https://better-auth.com/brand> — which
was the scaffold. **matops now owns its own identity** (ADR 37): a signature
**violet** and the **basketweave** mark are ours, layered on the kept neutral
foundation. Better Auth is heritage here, not the source of truth.

---

## 0. Ethos — one sentence

**Sharp, not loud: monochrome, disciplined, data-first — an instrument, not a poster.**

The gym runs on a schedule, a member list, a clock. Two matops flavors sit on the
greyscale baseline: **Geist Mono is the mat clock** — every time, count, and
score reads like a scoreboard (§3) — and **one signature violet** is the only
identity colour (§1.1), carried by the **basketweave mark** (§6). Everything
else stays monochrome; the violet is a spark, never decoration and never a status.

---

## 1. Foundations

### 1.1 Color

Exact Better Auth values. Light = their `:root` (warm stone); **dark = the brand
page (canonical, pure black)**. Full set in `theme.css`; key tokens:

| Token                  | Light     | Dark      |
| ---------------------- | --------- | --------- |
| `--background`         | `#FFFFFF` | `#000000` |
| `--foreground`         | `#0C0A09` | `#FAFAF9` |
| `--card` / `--popover` | `#FAFAF9` | `#0F0D0C` |
| `--primary`            | `#1C1917` | `#FAFAF9` |
| `--primary-foreground` | `#FAFAF9` | `#1C1917` |
| `--secondary`          | `#F5F5F4` | `#292524` |
| `--muted` / `--accent` | `#F5F5F4` | `#1A1917` |
| `--muted-foreground`   | `#79716B` | `#A6A09B` |
| `--border` / `--input` | `#E7E5E4` | `#292524` |
| `--ring`               | `#A6A09B` | `#79716B` |
| `--destructive`        | `#E40014` | `#82181A` |

**`--destructive` is a fill, never ink.** The dark value is a maroon chosen so
white text reads on top of it, so the token belongs on exactly one thing: the
solid red button. Every other red on the page (a form error, a CANCELLED label,
an invalid input's border, a failed-state box, the quiet `destructive-outline`
button) uses `--error` below, which is legible on both themes.

**Callout accents** — the _only_ non-neutral hues, and only for meaning
(callouts, alerts, status dots). Same in both themes:

| Token       | Hex       | Use                         |
| ----------- | --------- | --------------------------- |
| `--info`    | `#2B7FFF` | neutral notice ("Heads up") |
| `--warning` | `#FF6900` | caution ("Careful")         |
| `--error`   | `#FB2C36` | failure ("Broken")          |
| `--success` | `#00C950` | confirmation ("Nice")       |

**Trend, not judgement.** A metric moving up takes `--success`, down takes
`--warning` — never `--error`, because a quiet week is worth a look, not a
failure. The arrow (`↑` / `↓`) is always drawn as well, so direction is never
carried by hue alone. Only ever on a comparison figure, never on the value it
sits beside: the number itself stays neutral, because the product does not know
what a good one looks like. This is why the attendance rate carries no colour.

Rule: if a color is not `--destructive`, `--brand` (below), one of these four,
or one of the two discipline hues (below), don't use it. Reach for weight, size, or a hairline instead. matops status maps
onto these when Phase 3 lands: booking `● open/full/closed`, attendance
`● present/late/absent`, class `● live/cancelled` — a small dot + a **mono**
label, text stays neutral.

**Brand hue — violet (the one identity colour).** The single non-neutral hue that
is _not_ a status. Restrained: the mark, active nav, links, focus, the pending
banner/tag — never a solid primary button (that stays ink), never a status.

| Token                | Light     | Dark      | Use                               |
| -------------------- | --------- | --------- | --------------------------------- |
| `--brand`            | `#6A4DFF` | `#8B72FF` | mark fill, active nav, focus      |
| `--brand-strong`     | `#5A3CF0` | `#A390FF` | links / text-on-light             |
| `--brand-foreground` | `#FFFFFF` | `#12091F` | text + seams on a brand fill      |
| `--brand-wash`       | `#F1EEFF` | `#17122E` | tint surface: pending, active nav |

Rule: violet marks **identity**, the four callouts mark **meaning** — they never
swap jobs. Utilities: `bg-brand`, `text-brand-strong`, `bg-brand-wash`, `fill-brand`.

**Discipline hues — the category encoder (ADR 53).** Two hues that sort a list
of classes into gi and no-gi before the reader reads a word. A **category, not
a status**: they only ever mark what kind of training a class is.

| Token    | Light     | Dark      | Use                                      |
| -------- | --------- | --------- | ---------------------------------------- |
| `--gi`   | `#0F766E` | `#2DD4BF` | gi and judo: left rail + 8% block tint   |
| `--nogi` | `#B45309` | `#F5A524` | no-gi and MMA: left rail + 8% block tint |

Rule: cool = gi, warm = no-gi. They sit clear of the brand violet and of the
four callouts, and they separate on the blue-yellow axis, which survives
red-green color blindness. Open mat carries neither (a dashed neutral block),
because it is both. Utilities: `border-l-gi`, `bg-nogi/[0.08]`.

The encoder has three weights, one per density. A **block tint + left rail** on
the O2 week grid, where a class is a large shape. A **bar fill** at 20% behind
the O1 busiest-classes list, where the bar's length is the data and the hue says
what kind. A **dot** on the O1 day rail, where a tinted row would drown a page
that is mostly text. Same meaning at every weight; pick by how much surface the
element has, never for variety.

### 1.2 Typography

**Geist** for UI, **Geist Mono** for code & metadata. Their exact specs:

| Role       | Recipe                                           | Family     |
| ---------- | ------------------------------------------------ | ---------- |
| H1         | `text-4xl tracking-tight`                        | Geist      |
| H2         | `text-xl tracking-tight`                         | Geist      |
| Body       | `text-sm`                                        | Geist      |
| Mono label | `text-[11px] font-mono uppercase tracking-wider` | Geist Mono |
| Mono code  | `font-mono text-sm`                              | Geist Mono |

Headings are **tight-tracked**, sentence case, left-aligned — never bold-and-big.
Body emphasis is weight + brightness (`font-medium text-foreground`), never color.

### 1.3 Radius

Base `--radius: 0.2rem` — deliberately tight. **Code blocks and inline callouts
break to `0`** (`rounded-none`) for a sharper, editorial feel. Scale:

| Step                 | Value                       |
| -------------------- | --------------------------- |
| sharp (code/callout) | `0`                         |
| `sm`                 | `calc(var(--radius) - 2px)` |
| `md`                 | `calc(var(--radius) - 1px)` |
| `lg` (default)       | `var(--radius)`             |
| `xl`                 | `calc(var(--radius) + 4px)` |

### 1.4 Shadow and surface separation

Used **sparingly — only to lift interactive affordances** (menus, popovers).
**Cards and code stay flat** and rely on `--border`. The near-flat `--shadow-*`
scale exists for the few things that float.

A card is separated from the page by its **hairline**, not by a lightness jump.
On the pure-black theme `--card` sits a whisper above `--background`, and the
edge carries the shape. Never paint a whole surface in `--secondary` or
`--border` (`#292524`): at card size that value reads as a floating gray slab.
It is a button fill and a line. `--muted` is the quiet fill for **small** shapes
inside a card (chips, pills, avatars, skeletons) and for hover.

### 1.5 Button weight

The solid `primary` fill is near-white on the black theme, the highest-contrast
thing the palette can make. Spend it **once per screen**, on a form submit or a
dialog confirm. A row action inside a list is not that action: repeated down a
list, a near-white fill turns the page into a column of light blocks and the
content stops leading. Row actions use `secondary` for the affirmative one and
`outline` for the neutral one. The loud treatment lives on the confirm button
inside the dialog the row opens.

The same rule holds for danger. A red fill repeated down a list makes every row
look like a mistake waiting to happen. The row trigger is `destructive-outline`
(a hairline and a red label), and the solid `destructive` fill lives on the
confirm button inside the dialog it opens, where it is the point of no return.

`destructive-outline` paints with `--error`, not `--destructive`, per the token
rule in §1.1: `--destructive` is a fill, and as a hairline or a label on the
page background it would be unreadable.

The pairing is mechanical, so there is nothing to decide per screen: **a trigger
that opens a `variant="destructive"` confirm is `destructive-outline`; every
other trigger is `secondary` (affirmative) or `outline` (neutral).** If that
leaves a row with two red buttons, the question to ask is whether both actions
really are the point of no return. Suspend is not, because Restore sits next to
it, so its confirm is `primary` and its trigger is `outline`.

A disabled button drops to `--muted` with `--muted-foreground` text. Do not dim
a light fill with opacity: on a dark page a white button at 50% is a mid-grey
button, which reads as enabled rather than inert.

---

## 2. Motifs

Blueprint background textures. On web they are utilities in
`apps/nextjs/src/app/styles.css`; on mobile the `Blueprint` primitive
(`apps/expo/src/components/ui.tsx`) tiles the same hairline grid with Views
(ADR [44](issues/44-mobile-dark-first-design-system.md)), used behind the
sign-in hero.

| Utility          | Pattern       | Size |
| ---------------- | ------------- | ---- |
| `.bg-grid`       | hairline grid | 32px |
| `.bg-grid-small` | hairline grid | 8px  |
| `.bg-dot`        | dot field     | 16px |

All draw with `--border`. matops meaning: the mat diagram / scoring grid. Use at
a whisper, behind non-text areas (hero, empty states, card interiors) — at most
one per view.

**The instrument panel.** One shape carries every set of top-of-screen readings:
a bordered strip on `bg-grid-small`, split into cells by hairlines, each cell
floated just above the texture with `bg-background/90`. The O9 referral metrics
and the O1 "needs you" queue are the same object; a third panel should be too.
It replaces a row of separate cards on purpose — several tinted cards read as
several things to decide between, one panel reads as one instrument. When the O1
queue is empty the strip keeps the texture and the dashed edge, so the cleared
state occupies the same slot rather than leaving a hole.

---

## 3. The one matops flavor — mono is the mat clock

`Geist Mono` is reserved for machine/data values: times, counts, prices, tags,
sequence numbers, code, status labels. In matops that means **class times,
capacity (`18/24`), round timers, belt/stripe counts, member counts — all mono.**
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

- **Buttons** — seven variants: `primary` (solid ink), `secondary`, `outline`,
  `ghost`, `link`, `destructive` (solid red), `destructive-outline` (quiet red).
  Four sizes: `sm`, `default`, `lg`, `icon`. Sharp corners; one solid primary
  per view. `sm` carries a 44px floor on phones (`min-h-11 sm:min-h-8`) so a row
  action is still tappable, so do not re-add that by hand at the call site. Where
  a Radix primitive owns its own element, use `buttonClass()` from
  `@matops/ui/button` instead of hand-copying the recipe.
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

- **Clear over clever** — name things what they are (class, invite, member list — not
  `MembershipProvider`).
- **Terse, but warm** — short sentences, no marketing fluff. A thoughtful coach,
  not a billboard.
- **Show the thing** — a real schedule or member list proves more than a paragraph.
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

| Piece                                                                                            | State                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Color tokens (light+dark), **brand (violet)**, callout accents, radius, shadow, fonts            | **done** — `theme.css`                                                                             |
| Motif utilities (`.bg-grid` / `-small` / `.bg-dot`)                                              | **done** — web `styles.css`; mobile `Blueprint` (ADR 44)                                           |
| Heading treatment, mono-as-clock, voice                                                          | **this doc** — apply when building                                                                 |
| Cross-platform component pattern + reference Button                                              | **done** — ADR [32](issues/32-cross-platform-ui.md)                                                |
| `@matops/ui/tokens` (literal colors for RN)                                                      | **done**                                                                                           |
| Remaining components (input…alerts) to Better Auth taxonomy                                      | **todo** — `packages/ui`, follow the Button pattern                                                |
| Overlays on mobile via react-native-reusables                                                    | **todo** — verify nativewind-5 compat                                                              |
| Mobile **dark-first** theme (tri-state, persisted)                                               | **done** — `components/theme.tsx`, ADR 44                                                          |
| Mobile Geist via `expo-font` (Geist + Geist Mono)                                                | **done** — `components/fonts.ts`, ADR 44                                                           |
| Mobile kit derived from `@matops/ui/tokens` + web vocabulary (`Eyebrow`/`Stat`/`Card`/`Callout`) | **done** — ADR 44                                                                                  |
| Retire `apps/expo/src/components/ui.tsx` local kit                                               | **partial** — token-derived + aligned (ADR 44); full merge onto `@matops/ui` RN primitives pending |
| matops `● status` states (booking/attendance)                                                    | **Phase 3**, onto callout accents                                                                  |
| matops basketweave mark + wordmark                                                               | **done** — `@matops/ui/logo`, `app/icon.svg`                                                       |
