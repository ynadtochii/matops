# matops design language

The look-and-feel rulebook for both apps (web and mobile). Tokens live in
`apps/nextjs/src/app/theme.css`, with a TypeScript twin in
`packages/ui/src/tokens.ts`. **This doc says how to use them.** Read it before
you build a new screen or component. Exact values are in `theme.css` and are
not repeated here.

**Where it comes from:** the structure is Linear's, measured from linear.app on
2026-09-26 and adopted in ADR [141](issues/141-adopt-the-linear-design-system.md).
The violet and the basketweave mark are matops's own and stay from ADR
[37](issues/37-brand-identity.md). The older Better Auth look (warm stone,
Geist, a 0.2rem radius) is gone.

**The reference page** is `/linear-ds`. Since ADR 141 step 6a it has no token
copy of its own: every variable in `linear-ds.module.css` is an alias of a
product token, and it follows the app theme through `useTheme()`. So it shows
the product as it is, in both themes. The older signed-in `/design-system` page
is deleted.

---

## 0. Ethos

**Linear's structure, matops's violet: quiet steps of surface and text, 1px
edges, one accent that marks identity only.**

The structure is: surfaces and text in steps, 1px edges instead of shadows
between blocks, Inter at a 13px interface size, radius by nesting, and 150ms
motion. The one identity color is the matops violet, carried by the mark (§6).
Meaning (info, warning, error, success) has its own four hues, and the two jobs
never swap.

**Dark is the default theme.** A person who has never picked a theme gets dark,
not the system setting. Light, dark and system all stay in the picker, and the
stored key `theme-mode` keeps its name.

---

## 1. Foundations

### 1.1 Color

**Surfaces, from back to front.**

| Token                        | Use                                              |
| ---------------------------- | ------------------------------------------------ |
| `--background`               | level 0, the page                                |
| `--surface-1`                | level 1: the sidebar, the sign-in side panel     |
| `--surface-2`, `--surface-3` | levels 2 and 3: nested blocks, a code box        |
| `--card`                     | a list or card: within 2% of the page in dark    |
| `--raised`                   | fields and dialogs                               |
| `--floating`, `--popover`    | menus, tooltips, toasts                          |
| `--backdrop`                 | behind a modal (dark 60% black, light 65% white) |

**Text in four steps.** `--foreground` (primary), `--foreground-secondary`,
`--muted-foreground` (tertiary) and `--foreground-faint` (quaternary, for
placeholders). Emphasis is a step up in text and weight, never a color.

**Fills.** `--hover` for a row or item under the pointer, `--active` for the
current or selected item, `--secondary` and `--accent` as quiet fills, `--muted`
for small shapes and skeletons, `--track` behind a progress bar or a switch.
`--primary` is the inverted fill of the main button.

**Edges.** `--border` is the 1px line between blocks and rows. `--border-strong`
is the stronger line (a hover edge, a divider that must read). `--input` is the
field edge and `--field-hover` its hover. `--control` is the edge of a
checkbox, radio or switch.

**The violet (`--brand`).** The one non-neutral hue that is not a meaning. It
appears only where taking it away would cost identity or accessibility.

| Token                | Use                                                      |
| -------------------- | -------------------------------------------------------- |
| `--brand`            | the mark fill, the focus ring (`--ring`), a checked fill |
| `--brand-strong`     | the "Ops" in the wordmark                                |
| `--brand-foreground` | seams and ticks on a violet fill                         |
| `--brand-wash`       | the 3px halo around a focused field                      |

Violet **may** mark only: the mark and wordmark, the mat loader, keyboard
focus (the ring, and the edge of a focused field), and the checked state of a
checkbox, radio or switch. That is the whole list. Violet **never** marks: a
link (a link is primary text with a muted underline that turns solid on
hover), a count, the pending tag or strip (neutral), a status, the current
page or selected item (`--active` with primary text), a chart bar or progress
bar (neutral or primary), a spinner (muted), drag feedback (primary), or the
viewer. Text selection uses the browser default.

**`--destructive` is a fill, never ink.** In dark it is a maroon chosen so
light text reads on it, so it belongs on the solid red button only. Red text
uses `--error-text`; a red edge or tint uses `--error` at low opacity.

**Callout hues: meaning only.** Per theme, since light needs darker values to
pass as text. Each has a `-foreground` for its fill.

| Token       | Meaning               | Examples                                |
| ----------- | --------------------- | --------------------------------------- |
| `--info`    | a neutral notice      | "Booked", "Next class"                  |
| `--warning` | caution, worth a look | "Needs review", "Booking unavailable"   |
| `--error`   | a failure or a block  | a form error, "Absent", the danger zone |
| `--success` | a confirmation        | "Present", "Paid"                       |

**Trend, not judgement.** On a comparison figure (`Stat`), up is `--success`
and down is `--warning`, never `--error`, because a quiet week is worth a look,
not a failure. The arrow is always drawn too, so hue never carries direction
alone. The number itself stays neutral.

**Discipline hues: a category, not a status (ADR 53).** `--gi` (cool, gi and
judo) and `--nogi` (warm, no-gi and MMA). They sort classes before the reader
reads a word, and they split on the blue-yellow axis, which survives red-green
color blindness. Open mat carries neither. Three weights, one per density: a
block tint with a left rail on the week grid, a bar fill behind the busiest
classes list, a dot on the day rail. Utilities: `border-l-gi`, `bg-nogi/[0.08]`.

Rule: if a color is not one of the tokens above, do not use it. Reach for a
text step, a weight or an edge instead. The lint guard (§4) blocks hex classes.

**Contrast, honestly.**

- **Light passes WCAG AA:** text 4.5:1, icons and control edges 3:1. Light
  `--error-text` was darkened to `#a52121` after the system page audit: the old
  `#c52f2f` passed on white but failed on its own red tint once that tint sat on
  a level 1 to 3 surface (3.94 to 4.37:1). The new value is 4.61:1 or more at
  the 20% hover tint on every light surface.
- **Dark keeps Linear's own values by choice** (ADR 141 choice 3), and fails on
  three known points: faint text (placeholders, about 3.2:1 on a raised field),
  the field edge `--input` on its fill (about 1.2:1), and the control edge
  `--control` (1.72:1). Linear fails the same way.
- **If a pilot gym has trouble** reading placeholders or finding a field, the
  fix is two token changes and no screen edits: move placeholders to tertiary
  text, and give field and control edges a value at 3:1.

### 1.2 Typography

**Inter** for the interface, with `cv01` and `ss03` on `body`. **Geist Mono**
stays for data and codes (§3). 13px (`text-sm`) is the interface default.

Tailwind's scale is remapped. Each step carries its own line height and letter
spacing, so never add `tracking-*` by hand to fix a size.

| Class                   | Size      | Use                                                            |
| ----------------------- | --------- | -------------------------------------------------------------- |
| `text-2xs`              | 11px      | key hints (`Kbd`), count pills, small initials, tab bar labels |
| `text-xs`               | 12px      | metadata, `Eyebrow`, small buttons, tooltips                   |
| `text-sm`               | 13px      | the interface: body, rows, buttons, labels                     |
| `text-md`               | 14px      | section headings (`SectionHeading`)                            |
| `text-base`             | 15px      | large buttons                                                  |
| `text-lg`               | 17px      | the wordmark                                                   |
| `text-xl`               | 20px      | a `Stat` numeral                                               |
| `text-2xl`              | 24px      | page titles (`PageHeader`), queue counts                       |
| `text-5xl` / `text-6xl` | 48 / 64px | display only (the system page)                                 |

**Weights:** `font-medium` is 510, `font-semibold` 590, `font-bold` 680. Titles
and headings are semibold, labels and buttons medium. Headings are sentence
case and left-aligned.

**Fields are 16px on touch screens.** iOS Safari zooms into any field under
16px, and `text-base` is now 15px. One rule in `apps/nextjs/src/app/styles.css`
sets `input`, `select` and `textarea` to 16px under `pointer: coarse`. It sits
outside every CSS layer on purpose, so it wins over the `text-*` utility on the
field itself.

**Mobile uses a larger scale.** 13px is too small on a phone, so the Expo app
runs 15px body, 13px secondary, 17px list titles and 24px headings. React
Native cannot load weights 510 or 590, so mobile maps to the static Inter 400,
500, 600 and 700 files (`@expo-google-fonts/inter`).

### 1.3 Radius

`--radius` is 6px. The scale lands on four steps:

| Class        | Value | Use                                     |
| ------------ | ----- | --------------------------------------- |
| `rounded-sm` | 4px   | the icon button, small inner shapes     |
| `rounded-md` | 6px   | fields, tooltips, a code box            |
| `rounded-lg` | 8px   | cards, lists (`LIST`), callouts, toasts |
| `rounded-xl` | 12px  | dialogs, a kiosk frame                  |

**Radius by nesting:** an outer frame is rounder than what sits inside it. A
field (6px) inside a card (8px) inside a dialog (12px). **Buttons and action
chips are pills** (`rounded-full`). On mobile the same rule runs 12, 8, 6 and
pills.

### 1.4 Shadow and surface separation

Two shadows, both tokens:

- **Lift** (`--shadow-lift`): the small shadow under a control, such as the
  primary button.
- **Float** (`--shadow-float`): menus, dialogs, tooltips and toasts, things
  that sit above the page.

The stock Tailwind scale points at them: `shadow-2xs` to `shadow-md` are the
lift, `shadow-lg` to `shadow-2xl` are the float. `shadow-lift` and
`shadow-float` also exist as utilities. So an old `shadow-sm` never draws a
third kind of shadow.

**Between blocks, use an edge, not a shadow.** A card or list sits on the page
with a 1px `--border`. The edge draws the shape, not the fill: in dark,
`--card` (`#0e0f10`) sits within 2% of the page (`#08090a`), as Linear's panels
do (`#0c0d0e` to `#101112`, sampled 2026-09-26). Only what nests inside a card
steps up in brightness: a field or dialog (`--raised`), a code box
(`--surface-2`), a hover fill. Do not paint a card with `--raised` or
`--surface-2` to make it stand out. Rows inside a list are split by the same
line. A dialog is the one surface that drops its edge and uses the
float shadow instead.

### 1.5 Button weight

Seven variants, props and names unchanged since before ADR 141:

| Variant               | Look                         | Where                                            |
| --------------------- | ---------------------------- | ------------------------------------------------ |
| `primary`             | inverted fill, lift shadow   | once per screen: a form submit, a dialog confirm |
| `secondary`           | quiet fill, thin edge        | the affirmative row action                       |
| `outline`             | thin edge, no fill           | the neutral row action                           |
| `ghost`               | tertiary text until hover    | toolbar and icon actions                         |
| `link`                | primary text, underlined     | an inline link that is a button                  |
| `destructive`         | solid red fill               | the confirm inside a destructive dialog          |
| `destructive-outline` | red tint with `--error-text` | the trigger that opens that dialog               |

Sizes: `default` 32px, `sm` 24px, `lg` 40px, `icon` 32px square with a 4px
radius. Every size keeps a **44px touch floor below `sm`**, so do not add one by
hand. Where a Radix part owns the element, use `buttonClass()` from
`@matops/ui/button`.

**Spend the primary fill once per screen.** Repeated down a list, it turns the
page into a column of bright blocks. The loud button lives in the dialog a row
opens.

**The pairing rule is mechanical:** a trigger that opens a
`variant="destructive"` confirm is `destructive-outline`; every other trigger
is `secondary` (affirmative) or `outline` (neutral). Suspend is not the point
of no return, since Restore sits next to it, so its confirm is `primary` and
its trigger is `outline`.

**In flight, not renamed.** A button mid-request takes the `busy` prop and
keeps its label (ADR 140). Do not swap "Save" for "Saving…".

**Disabled only while in flight** (ADR 120). A button is never disabled for
validation: let the submit run, and show the error on the field. A disabled
button is 50% opacity.

---

## 2. Motifs

Hairline background textures, drawn with `--border`. On web they are utilities
in `apps/nextjs/src/app/styles.css`; on mobile the `Blueprint` primitive in
`apps/expo/src/components/ui.tsx` tiles the same grid with Views (ADR
[44](issues/44-mobile-dark-first-design-system.md)).

| Utility          | Pattern       | Size |
| ---------------- | ------------- | ---- |
| `.bg-grid`       | hairline grid | 32px |
| `.bg-grid-small` | hairline grid | 8px  |
| `.bg-dot`        | dot field     | 16px |

Use at most one per view, behind non-text areas (the sign-in panel, an
instrument panel).

**The instrument panel.** One shape carries a set of top-of-screen readings: a
bordered strip on `bg-grid-small`, split into cells by 1px lines, each cell on
`bg-background/90`. It is `Panel` / `panelCell` / `PanelNotice` in
`apps/nextjs/src/app/_components/primitives.tsx` (ADR
[101](issues/101-the-dashboard-uses-its-width.md)). A channel with nothing to
show is absent and the grid shows through. When the queue is empty, the strip
keeps its frame and one channel carries the line of copy.

---

## 3. Mono is for data you copy or read off a clock

Before ADR 141, Geist Mono carried every time, count and label ("the mat
clock"). That is no longer true. **Times and counts now use Inter with
`tabular-nums`**, so digits line up without a second typeface. Mono uppercase
labels are gone; labels are plain sans (`Eyebrow`, `SECTION_LABEL`).

`font-mono` (Geist Mono) stays for values a person copies or types back:

- the six-digit academy code and the join-code field,
- the bank transfer reference,
- an API key, a URL to paste, a typed confirm phrase,
- a phone number in a list where digits must be read one by one,
- code and error digests.

If you are about to use mono for a time or a number in a sentence, use
`tabular-nums` instead. Numbered sequences (`01`, `02`) appear only when order
carries meaning.

---

## 4. Components

**The web client uses Radix with its own `cva` recipe in `button.tsx`.** The Expo app uses explicit React Native styles in `apps/expo/src/components/ui.tsx`, sharing the same design tokens (ADR 36).

**Shared parts in `packages/ui/src`:**

| Part                          | Use                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Button`                      | §1.5                                                                                                                      |
| `Input`, `Textarea`, `Select` | one `FIELD` class: 32px, 6px radius, raised fill, `--input` edge. Focus is a violet edge with a 3px `--brand-wash` halo. |
| `Checkbox`                    | a choice that waits for Save                                                                                              |
| `Badge`                       | a status or tag. Tones: neutral, info, success, warning, error. No violet tone                                            |
| `Callout`                     | a notice in the flow. Tones: neutral, info, success, warning, error. Info is blue, never violet.                          |
| `Separator`                   | a divider between sections                                                                                                |
| `Dialog`, `AlertDialog`       | raised surface, 12px radius, float shadow, no edge, over `--backdrop`                                                    |
| `DropdownMenu`, `toast`       | floating surface; menu items 32px on desktop, 44px on touch                                                              |
| `Logo`, `Mark`                | §6                                                                                                                        |

**App primitives in `apps/nextjs/src/app/_components/primitives.tsx`:**

- **`LIST`**: a list is one bordered container with divided rows, not a stack
  of cards. Every member, plan, claim, feed and settings list uses it.
- **`SettingsRow`**: label and description on the left, the control on the
  right from `sm`, stacked on phones. A settings page is a `LIST` of these
  under a real `h2`.
- **`SectionHeading`** (an `h2` with an optional `CountBadge` and an action),
  **`Section`** (a ruled label), **`Stat`** (a numeral over a label, with the
  trend rule in §1.1) and **`Eyebrow`** (the 12px tertiary label).
- **Page header** (`page-header.tsx`): a `text-2xl` semibold title, a tertiary
  `text-sm` description, and actions on the right.
- **App tabs** (`_components/tabs.tsx`): 13px medium, tertiary until selected,
  a 2px primary underline (not violet), 44px on touch and 36px above `sm`.

**States (`states.tsx`, `skeletons.tsx`).**

- **Empty:** `EmptyState`, a dashed frame that says what is missing and what to
  do next. Never a dead end.
- **Error:** `ErrorState`, an error-tinted box that names what failed, with a
  retry. **A failed read never looks like nothing to do** (ADR 140). If a query
  failed, show `ErrorState`, not "Nobody is checked in yet." or a create
  button. On a public page, only `NOT_FOUND` or `BAD_REQUEST` may read as "not
  valid"; any other failure is `ErrorState`.
- **Loading:** a placeholder has the shape of what follows it (ADR
  [80](issues/80-loading-states.md)). A list that loads into `LIST` uses
  `SkeletonRows inList`, so the skeleton is the same divided container and the
  page does not jump. When nothing is known yet (the cold open, the academy
  gate) draw the mat loader (§6). A wait under 180ms draws nothing. A spinner is
  kept for an action in flight, which is the `busy` button.

**Icons: Lucide** (`lucide-react`), replacing `@radix-ui/react-icons`. One base
rule in `styles.css` makes every `.lucide` icon 16px with a 1.5px stroke at any
size (`vector-effect: non-scaling-stroke`). It sits in the base layer, so a
`size-*` class still wins. Mobile keeps its own `icons.tsx`:
`lucide-react-native` needs `react-native-svg`, a native module that forces a
dev-client rebuild nobody can check here.

**Focus.** One recipe, `FOCUS_RING` in `@matops/ui/motion`: a 2px `--ring` at a
2px offset. `--ring` is the violet. Use `FOCUS_RING_INSET` where the control is
flush to an edge. Never a partial-opacity ring.

**The lint guard.** `designTokensConfig` in `tooling/eslint/react.ts` runs on
`apps/nextjs`, `packages/ui` and `apps/expo`. It makes an arbitrary text size
(`text-[13px]`) or an arbitrary hex color (`bg-[#fff]`) in any string or
template literal an error, and the message names the token to use. It checks
**class strings only**: a hex in a canvas drawing or in a `tokens` object is not
a class and stays allowed. It does not catch a wrong token (violet on a status,
say); that is still review work.

### Motion

One vocabulary, no library (ADR 131).

- **Default length is 150ms** (`--default-transition-duration`): a press, a
  hover, a menu, a tooltip, a dialog. A tab underline and a query settling
  (`RESOLVE`) take 200ms, a page section entering (`ENTER`) 300ms. Nothing runs
  longer.
- **Curves** live in `theme.css`: `ease-out` for anything entering or leaving
  (and the default for any `transition-*`), `ease-in-out` for something moving
  on screen, `ease-drawer` for a sheet. There is no ease-in token: it delays the
  frame the reader is watching.
- **The vocabulary** is in `primitives.tsx`: `ENTER`, `RESOLVE`, `stagger(i)`
  (rows 40ms apart, capped at six), `TAP`, plus `PRESS` and `FOCUS_RING` in
  `@matops/ui/motion`.
- **What does not animate:** the sidebar, the mobile tab bar, and anything hit
  dozens of times a day. Navigation is instant.
- **Only `transform` and `opacity`**, except the collapsible, which has no
  transform equivalent.
- **Reduced motion:** every animation names `motion-reduce:animate-none` or
  `motion-reduce:transition-none`, so transforms stop under
  `prefers-reduced-motion`.

---

## 5. Voice

- **Clear over clever:** name things what they are (class, invite, member list).
- **Terse, but warm:** short sentences, no marketing. A coach, not a billboard.
- **Show the thing:** a real schedule or member list proves more than a paragraph.
- **Quiet, not loud:** steps of text and surface, 1px edges, one accent. Precise,
  never decorative.
- **An action keeps its name** from the button to the toast. A button in flight
  keeps its label (§1.5).

---

## 6. Logo

**Mark = the basketweave mat bond.** A rounded tile (`rx` 7 on a 32 viewBox)
filled `--brand`, with basketweave seams (the woven plank pairs real mats are
laid in) in `--brand-foreground` at 85%, each seam running edge to edge. Seam
path: `M16 0V32 M0 16H32 M8.5 0V16 M16 8.5H32 M0 23.5H16 M23.5 16V32`.

Built once, shared: **`@matops/ui/logo`**, `Mark` (tile) and `Logo` (mark plus
wordmark); web is inline SVG, mobile is positioned Views in `apps/expo/src/components/ui.tsx` (no
`react-native-svg`). The wordmark is "MatOps" in Inter semibold at `text-lg`,
with "Ops" in `--brand-strong`. ADR 141 did not change the mark or the violet.

**The mark in motion is the loader.** The six seams draw on with
`stroke-dashoffset`, 90ms apart, the two long centre seams first, then the four
planks. Web: `apps/nextjs/src/app/_components/mat-loader.tsx` (keyframes in
`styles.css`). Mobile: `apps/expo/src/components/mat-loader.tsx`. ADR
[80](issues/80-loading-states.md).

**Every raster icon comes from one script.** `scripts/gen-icons.sh` renders the
mark to the favicon, the PWA icons, the Apple touch icon and the Expo app icon.
It paints the dark brand tokens, since a saved icon sits on the wallpaper and
cannot follow the app theme. Icons the OS masks bleed to a square edge; the rest
keep the `rx` 7 tile. Re-run it after any change to the mark.

Web favicon: `apps/nextjs/src/app/icon.svg`. Use the mark at **24px minimum**;
use the full `Logo` when the brand must read at a distance. Rationale in ADR 37.

---

## 7. Status

| Piece                                                                                                                                   | State                                               |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Tokens (surfaces, text steps, edges, violet, callouts, radius, shadow, type)                                                            | **done**: `theme.css` + `tokens.ts`, ADR 141 step 1 |
| Shared parts (button, fields, overlays, checkbox, badge, callout, separator, overlays)                                                  | **done**: `packages/ui`, step 2                     |
| Shell (sidebar, header, branch picker, mobile tab bar, banners)                                                                         | **done**: steps 3a, 3b                              |
| The nine screen groups (steps 4.1-4.9)                                                                                                  | **done**                                            |
| Mobile (Inter, larger scale, lists, pills)                                                                                              | **done, static gates only**: step 5                 |
| Lint guard against arbitrary sizes and hex classes                                                                                      | **done**: step 6b                                   |
| `/linear-ds` reads the product tokens; old showcase removed                                                                             | **done**: step 6a                                   |

**What is verified:**

- Static gates (typecheck and lint).
- Contrast at the token level: every text and icon pair on the shared parts,
  checked in both themes. Only the three dark failures in §1.1 remain, by
  choice.
- `/linear-ds` audited in the browser in both themes. That audit found and
  fixed the light `--error-text` failure.

**What is not verified:**

- The signed-in screens have not been seen in this browser setup. Their look is
  checked by code and tokens, not by eye.
- The mobile app has never run on a simulator or a device.
  `docs/mobile-device-test.md` is still outstanding, and the splash background
  in `app.json` is still `#000000` until a native build.

**Known gaps, each its own slice:** six buttons still disabled for validation
(ADR 141 step 4.1), the month board's states have no color of their own (step
4.5), and the class page's empty "Who's booked" section (step 4.7).
