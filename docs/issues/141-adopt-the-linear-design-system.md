# 141 · Adopt the Linear design system

**Status:** accepted · **Date:** 2026-09-26 · **Area:** `tooling/tailwind`, `packages/ui`, `apps/nextjs`, `apps/expo` · **Supersedes:** the look in [37](37-brand-identity.md) (the mark and the violet stay) · **Plan:** [linear-redesign-handoff.md](../linear-redesign-handoff.md)

## Context

The matops look (ADR 37) was a warm stone palette with Geist, a tight radius and
a violet accent. Screens grew their own sizes: 22 files use arbitrary text sizes
like `text-[13px]`, and the radius mix has no rule. We wanted one structure
that tells every screen what size, weight, edge and radius to use.

The `/linear-ds` page (commit `1272e2d`) holds that structure, measured from
linear.app on 2026-09-26. It is the spec. Its values live in
`apps/nextjs/src/app/linear-ds/linear-ds.module.css` and are not copied here.

The platform has no real users. So the whole app switches at once on the branch
`design/linear`, and no single screen is tried first behind a scoped class.

## Decision

### Linear's structure comes in

- **Surfaces in steps:** four background levels, two fills, and raised and
  floating surfaces, each theme with its own values.
- **Text in steps:** primary, secondary, tertiary and quaternary.
- **Edges:** 1px lines in three strengths, instead of shadows between blocks.
- **Type:** Inter with `cv01` and `ss03`, replacing Geist. 13px is the interface
  default. Weights 400, 510, 590 and 680, with letter spacing per size.
- **Radius by nesting:** 4, 6, 8 and 12px. An outer frame is rounder than what
  sits inside it, and action chips are pills.
- **Motion:** 150ms on one ease curve, and none under `prefers-reduced-motion`.

### Three choices the user made on 2026-09-26

1. **The accent stays matops violet.** `--brand` is `#6a4dff` light and
   `#8b72ff` dark, used where Linear uses its accent. The basketweave mark stays.
   Checked against the Linear surfaces:
   - Light: white text on a `#6a4dff` fill is 5.1:1. Violet **text** uses
     `--brand-strong` `#5a3cf0`, which is 5.5:1 or more on every light surface.
     Plain `#6a4dff` as text drops to 4.47:1 on the level 3 surface, so text
     never uses `--brand`.
   - Dark: `#8b72ff` as text is 4.9:1 or more on all four levels. The dark
     `--brand-foreground` `#12091f` on the fill is 5.5:1.
2. **The default theme is dark.** A person who has never picked a theme gets
   dark, not the system setting. Light, dark and auto all stay in the picker.
   The stored key `theme-mode` keeps its name, so anyone who already picked a
   theme keeps it. On web, this changes the fallback in
   `packages/ui/src/theme.tsx` and in its detector script. The Expo app gets
   the same default in the mobile step.
3. **The product keeps Linear's dark values, including their contrast
   failures.** The light theme passes WCAG AA (text 4.5:1, icons and control
   edges 3:1), as the reference page does. The dark theme does not pass on
   three points, which Linear itself also fails:
   - Quaternary text `#62666d` is 2.7 to 3.5:1. Placeholders use it.
   - The field edge `#23252a` on its level 2 fill is 1.2:1, for inputs,
     checkboxes, radios and switches.
   - Linear's `#5e6ad2` as text fails, but matops does not use it (choice 1).

   Dark is now the default, so most first visits see these failures. This is a
   known trade-off, not an oversight. If a pilot gym has trouble reading
   placeholders or finding a field, the fix is small: move placeholders to
   tertiary text and give field edges their own token at 3:1. Both are token
   changes with no screen edits.

### What does not change

- The token plumbing: one `tooling/tailwind/theme.css` that both clients import,
  plus the TypeScript twin `packages/ui/src/tokens.ts`.
- The props and variant names of every shared component, so screens compile
  unchanged while their look changes.
- `button-variants.ts` stays shared with NativeWind, with no web-only classes.
- The four callout hues keep meaning (info, warning, error, success). Violet
  still marks identity only.
- No migration and no procedure. No logic changes.

### Open until later steps

- **Icon set: Lucide** (`lucide-react`, decided with the user 2026-09-26).
  Its stroke can change, where `@radix-ui/react-icons` has a fixed one. It
  also has a React Native twin for the mobile step. See step 2 below.
- **A command menu (⌘K)** is a new feature, not part of this redesign. It is
  its own slice if we want it.

## As built

### Step 1: tokens

- `tooling/tailwind/theme.css` holds the Linear values in the existing roles
  and adds `surface-1/2/3`, `raised`, `floating`, `foreground-secondary`,
  `foreground-faint`, `border-strong`, `field-hover`, `hover`, `active`,
  `track` and `error-text`. `packages/ui/src/tokens.ts` mirrors every value.
- `--input` is the field edge. It is Linear's `#23252a` in dark (choice 3) and
  the AA-checked `#908c93` in light.
- **Type:** Inter via `next/font`, `cv01` and `ss03` on `body`, and a 13px body
  default. Tailwind's scale is remapped: `text-xs` 12, `text-sm` 13 (the
  interface size), a new `text-md` 14, `text-base` 15, `text-lg` 17,
  `text-xl` 20, `text-2xl` 24, `text-5xl` 48 and `text-6xl` 64, each with its
  line height and letter spacing. `font-medium` is 510, `font-semibold` 590
  and `font-bold` 680.
- **Fields stay at 16px on touch screens.** iOS Safari zooms into any field
  under 16px, and `text-base` is now 15px. One unlayered rule in
  `apps/nextjs/src/app/styles.css` sets fields to 16px under
  `pointer: coarse`. It is unlayered so it wins over the `text-*` utility on
  the field itself.
- **Radius:** `--radius` is 6px, and `rounded-sm/md/lg/xl` are 4, 6, 8 and 12.
- **Shadows:** the app used the stock Tailwind scale, not `shadow-lift` (the
  handoff was wrong about that). The scale now points at two tokens:
  `2xs` to `md` are the lift, `lg` to `2xl` are the float. `shadow-lift` and
  `shadow-float` also exist as utilities.
- **Motion:** the default transition length is 150ms.
- **Dark default:** the fallback in `getStoredThemeMode` and in the detector
  script is `dark`. The browser bar color and the PWA splash background are
  `#08090a`.
- The Expo app imports the same `theme.css`, so its colors and text scale
  change now. Its fonts change in the mobile step.

### Step 2: shared components

- **Icons.** `lucide-react` replaces `@radix-ui/react-icons` in `@matops/ui`.
  Radix icons are gone from the workspace, since the web app never imported
  them. One base rule in `apps/nextjs/src/app/styles.css` makes every icon
  16px and draws every stroke at 1.5px at any size
  (`vector-effect: non-scaling-stroke`). It sits in the base layer, so a
  `size-*` class still wins. The app's hand-drawn icons in `primitives.tsx`
  move to Lucide screen by screen in steps 3 and 4.
- **`cn` knows the new names.** `tailwind-merge` treated `text-md` and
  `text-2xs` as colors and `shadow-lift` as a shadow color, so
  `cn("text-md text-foreground")` would have dropped one class.
  `extendTailwindMerge` in `packages/ui/src/index.ts` registers them.
- **Three more tokens:** `--control` (checkbox, radio and switch edges, Linear's
  `#3e3e44` in dark and `#908c93` in light), `--backdrop` (behind a modal:
  black at 60% in dark, white at 65% in light) and `text-2xs` (11px, for key
  hints and small initials).
- **Button:** a pill, 32px tall (24 small, 40 large), 13px medium text. The
  icon button keeps a 4px radius. The primary button is the inverted fill with
  the lift shadow. Secondary and outline are a thin edge that strengthens on
  hover. Ghost text is tertiary until hover. The quiet destructive button is a
  red tint with `--error-text`. A disabled button is 50% opacity, and it still
  keeps the 44px touch floor below `sm`. Props and variant names are unchanged.
- **Fields:** one `FIELD` class in `input.tsx`, used by Input, Textarea, Select
  and the confirm dialog's typed-phrase input. 32px, 6px radius, a raised fill
  and `--input` edge, the field-hover edge on hover. Focus is a violet edge
  with a 3px `--brand-wash` ring, as on the reference page.
- **Overlays:** dialogs are the raised surface, 12px radius, the float shadow
  and no edge. Menus and tooltips are the floating surface. Menu items are
  32px on desktop and 44px on touch. Toasts are the floating surface with the
  float shadow and an 8px radius.
- **New parts:** `Tabs`, `Tooltip`, `Checkbox`, `RadioGroup`, `Switch`,
  `Avatar` and `Progress` wrap `radix-ui`. `Kbd`, `Badge` (tones neutral,
  brand, info, success, warning, error), `Skeleton`, `Callout` (neutral, info,
  success, warning, error) and `Table` are plain elements. The info callout
  uses the info blue, not the violet: violet marks identity, never a status.
- **Contrast, checked from the tokens:** every text and icon pair on the new
  parts passes AA in both themes. The only failures are the two you chose to
  keep in dark: the checkbox and radio edge (1.72:1) and placeholder text
  (3.17:1 on a raised field). The light success badge passes narrowly at
  4.56:1.

### Step 3a: sidebar

- Level 1 surface, 28px items, 13px medium text in the secondary color with
  tertiary icons. Hover is `--hover`, the current page is `--active` with
  primary text. **The current page no longer uses the violet** (ADR 37 put
  violet on active nav): the reference sidebar marks it with the active fill,
  and violet stays for the mark, links, focus and the pending tag.
- Each group folds on its own heading (`Collapsible`, open by default). The
  branch group is headed by the branch's name and the gym group reads
  `Gym management`.
- The 13 hand-drawn shell icons are Lucide, under their old export names.
  Count badges use `text-2xs` with tabular figures instead of mono 10px.
- The sign-out button uses the `busy` prop and keeps its label (ADR 140).

## Consequences

- Every new screen gets sizes, weights, edges and radii from tokens. The last
  step adds a lint rule that bans hex colors and arbitrary text sizes in app
  code, so the 22 files do not grow back.
- The Expo step reaches static gates only. There is no simulator here, so it is
  unverified on a device until someone runs `docs/mobile-device-test.md`.
- `/linear-ds` keeps its own token copy until the last step, then reads the real
  theme tokens and the older `(app)/design-system` page goes.
- Merging `design/linear` into `main` deploys production. It waits until the
  last step is done.
