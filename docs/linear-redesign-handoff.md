# Handoff: adopt the Linear design system and redesign matops

Written 2026-09-26. For a fresh agent continuing the redesign on branch
`design/linear`.

## Where things stand

- Branch **`design/linear`** was cut from **`main`** (not `dev`), on the user's
  instruction. All redesign work happens on this one branch, step by step, one
  commit per step.
- First commit `1272e2d` holds the reference work: the `/linear-ds` page, the
  older `/design-system` page, `docs/design-system/reference-site-research.md`,
  and doc lines in `CHANGELOG.md`, `docs/design.md`, `docs/roadmap.md`.
- The product itself is not changed yet. Step 1 below is the first product edit.
- The platform has **zero real users**. That is why the plan switches the whole
  app at once on the branch instead of piloting one screen behind a scoped class.
- **Merging this branch into `main` is the production deploy** (Vercel builds
  `main`, and `vercel-build` runs migrations). This redesign needs no migration.
  Do not merge until step 6 is done. After the merge, bring `dev` up to date
  with `main`.

## The reference: `/linear-ds`

Run `pnpm dev:next`, open `http://localhost:3004/linear-ds`. Public, no-index,
internal only. It is the spec for every value and component below. Do not
restate its values in new docs; read them from the source:

- `apps/nextjs/src/app/linear-ds/linear-ds.module.css`
  - `.root` block: the **dark** tokens, measured from linear.app's computed
    styles on 2026-09-26. Faithful to Linear, including its contrast problems.
  - `.root[data-theme="light"]` block: the **light** tokens. Measured from
    linear.app's own `data-theme="light"`, then darkened where needed so light
    passes WCAG AA (text 4.5:1, icons and control edges 3:1).
  - The `:where(.root[data-theme="light"])` rules near the end: light-only
    control edges.
  - Everything else: component specs (sizes, radii, states, motion).
- `primitives.tsx`, `linear-ds-screen.tsx`, `more-components.tsx`: component
  anatomy and behavior (keyboard, empty, loading and error states).
- The page has its own Light / Dark toggle, stored under `linear-ds-theme` in
  localStorage. It is independent of the app theme on purpose.

Known dark contrast problems (Linear's own, kept on the reference page):

- Quaternary text `#62666d` is 2.7 to 3.5:1. Linear uses it for placeholders.
- Input edge `#23252a` on its level 2 fill is 1.2:1.
- Brand `#5e6ad2` as text is 3.3 to 4.2:1. As a fill with white text it is 4.7:1.

## Decisions (settled 2026-09-26, recorded in ADR 141)

The user answered: 1 as proposed, 2 flipped to **dark by default**, 3 flipped to
**keep Linear's dark values** (no field-edge token, placeholders stay
quaternary). The list below is the original proposal, kept for history.

The user did not answer these. The plan uses the recommended default. Confirm or
flip each one with the user **before step 1**, then record them in the ADR.

1. **Accent color: keep matops violet** (`--brand` `#6a4dff` light, `#8b72ff`
   dark) in Linear's accent role. It is the matops identity (ADR 37) and close to
   Linear's `#7170ff`. Check it for AA the same way the light theme was checked.
2. **Default theme: unchanged** (follows the system, via `ThemeProvider` in
   `packages/ui/src/theme.tsx`, key `theme-mode`). The product keeps light, dark
   and auto.
3. **Fix the dark contrast problems in the product** (the reference page stays
   faithful): placeholders use tertiary text, not quaternary; input, checkbox,
   radio and switch edges get a field-edge token of about `#5c5f66` on level 2
   (compute the exact value to reach 3:1 against the surface it sits on).

## Rules this work runs under

From `/Users/kuna/.claude/CLAUDE.md` and `/Users/kuna/projects/matops/CLAUDE.md`,
both auto loaded. Read them. The ones that bite on this work:

- **Never run tests.** Hand the user `pnpm test`. `pnpm typecheck` and
  `pnpm lint` are fine to run.
- **Zero comments on edits** unless there is a genuine non-obvious why.
- **Plain language everywhere**, no em or en dash as punctuation, including
  commit messages and docs.
- **Commit only when the user asks.** No AI co-author trailer. The user has asked
  for one commit per step on this branch.
- **Definition of Done**: this replaces ADR 37's look, so it needs a new ADR
  under `docs/issues/` (next number **141**), `docs/architecture.md` if a
  technical decision moves, `docs/design.md` rewritten, `docs/roadmap.md` cells,
  one `CHANGELOG.md` line per step.
- Browser checks: screenshots fail in this Chrome setup. Measure with
  `javascript_tool`. Transitions do not finish in a background tab, so inject
  `*{transition:none!important}` before reading computed colors.

## Codebase facts the plan relies on

- Tokens: `tooling/tailwind/theme.css`. Light in `:root` (line ~19), dark in
  `@variant dark` (~121), mapped to utilities in `@theme inline` (~198).
  `--radius` is `0.2rem` and `--radius-sm/md/lg/xl` derive from it.
  `--font-sans` points at Geist (~254).
- Fonts: Geist and Geist Mono load in `apps/nextjs/src/app/layout.tsx`. Mobile
  fonts in `apps/expo/src/components/fonts.ts`.
- Mobile token twin: `packages/ui/src/tokens.ts` (hex values for React Native
  APIs). Keep it in sync with `theme.css`.
- Shared components: `packages/ui/src/`. Web imports by count: button 52,
  toast 36, input 27, label 22, dialog 17, select 14, alert-dialog 14, field 13,
  spinner 10, motion 10, copy-button 9, logo 8, textarea 7, dropdown-menu 6,
  theme 3, collapsible 3, separator 1.
- `button-variants.ts` is shared with NativeWind. No web-only classes (`hover:`,
  `focus-visible:`, `aria-*`) in the shared recipe.
- `radix-ui` (the single package) and `@radix-ui/react-icons` are installed.
- Screens: 29 web pages, 129 web `.tsx` files, most screen code in
  `apps/nextjs/src/app/_components/`. The shell is `app-shell.tsx` and
  `shell-frame.tsx`. Expo has 30 `.tsx` files under `apps/expo/src`.
- Only one raw palette color in app code (`text-neutral-500`). Radius mix today:
  41 `rounded-lg`, 39 `rounded-md`, 33 `rounded-full`, 12 `rounded-sm`.
- 22 files use arbitrary text sizes like `text-[13px]`:
  `reception/reception-gate.tsx`, `reception/reception-screen.tsx`, and in
  `_components/`: class-roster, student-screen, member-detail,
  notifications-screen, shell-frame, people-screen, coaches-screen, members,
  schedule, primitives, curriculum, referrals-screen, coach-select, leads,
  week-grid, mat-loader, overview-screen, dashboard-screen, staff; plus the old
  `(app)/design-system/design-system-screen.tsx`.
- Correction found in step 1: app code used the stock Tailwind shadow scale,
  not `shadow-lift`. ADR 141 "As built" records the mapping.

## The plan

Each step ends with `pnpm typecheck`, `pnpm lint`, a browser pass in both themes
at 375px, iPad and desktop, one `CHANGELOG.md` line, and one commit.

### Step 0. ADR and decisions
- [x] Confirm the three decisions above with the user.
- [x] Write ADR 141: adopt Linear's structure (surface and text steps, hairline
      edges, Inter at 510, 13px interface text, radius by nesting, 150ms
      motion), keep the matops brand, light passes AA, dark fixes as decided.
      Supersedes the look in ADR 37. Add it to `docs/map.md`.

### Step 1. Tokens
- [x] Put the Linear values into the existing roles in `theme.css`, both themes:
      `--background`, `--card`, `--popover`, `--muted`, `--foreground`,
      `--muted-foreground`, `--border`, `--input`, `--ring`, `--primary`
      (inverted button), `--secondary`, `--accent`.
- [x] Add the missing roles in both themes and in `@theme inline`: surface 2 and
      3, secondary text, faint text, strong border, field edge, raised, floating,
      hover fill, active fill, track, error text.
- [x] Type: Inter with `font-feature-settings: "cv01", "ss03"` in the root
      layout, replacing Geist. Text scale with 13px as the interface default,
      weights 400/510/590/680, tracking per size (see the Type section of
      `/linear-ds`).
- [x] Shape: `--radius` about 6px so the derived scale lands on 4/6/8/12.
- [x] Shadows: `shadow-lift` and `shadow-float` get the Linear values per theme.
- [x] Mirror every changed value in `packages/ui/src/tokens.ts`.
- Expect density breakage across screens. Fix it in steps 3 and 4, not here.

### Step 2. Shared components (`packages/ui`)
- [x] Restyle in order of use: Button, Toast, Input, Label, Dialog, Select,
      AlertDialog, Field, Spinner, Textarea, DropdownMenu, CopyButton,
      Collapsible, Separator. Keep props and variant names so screens compile
      unchanged.
- [x] Add, on `radix-ui`: Tabs, Tooltip, Checkbox, RadioGroup, Switch, Kbd,
      Badge, Avatar, Progress, Skeleton, Callout, Table. Specs from `/linear-ds`.
- [x] Pick one icon set and one rule (16px, 1.5px stroke). `react-icons` from
      Radix has a fixed stroke and does not meet it; decide and note it in the ADR.

### Step 3. App shell
- [x] Sidebar in the Linear pattern: level 1 surface, 28px items, a fold per
      branch, "Gym management" beside the current branch.
- [x] Header, branch picker, mobile shell, the overdue strip.
- A command menu (⌘K) is a new feature. Not part of this redesign; propose it
  as its own slice.

### Step 4. Screens, one commit each
Order:
1. [x] Members and People (list, person page, leads)
2. [x] Schedule, including the curriculum timeline
3. [x] Dashboard and Overview
4. [x] Attendance and Reception
5. [x] Payments and Memberships
6. [x] Coaches, Referrals, Notifications
7. [x] Both Settings screens, Profile, class detail
8. [x] Student web: schedule, training, dues
9. [x] Public pages: sign-in, start, join, `/book/<code>`, check-in, privacy

Checklist for every screen:
- Only theme tokens. No arbitrary sizes (see the 22 files above).
- Radius follows nesting: outer frame larger, inner items tighter, actions pill.
- Empty, loading and error states present. A submit button is disabled only
  while its request is in flight (ADR 120).
- Keyboard works, focus visible, reduced motion respected.
- Both themes pass AA on the rendered page (measure, do not assume).

### Step 5. Mobile (Expo)
- [x] NativeWind theme and `tokens.ts` match step 1. Fonts in `fonts.ts`.
- [x] Restyle the four tabs, the pushed screens, and `apps/expo/src/components`.
- Limit: no simulator here. This step reaches static green only until someone
  runs `docs/mobile-device-test.md` on a device. Say so in the ADR and roadmap.

### Step 6. Clean up, guard, merge
- [ ] Replace `(app)/design-system` with the system page. Point `/linear-ds` (or
      its successor) at the real theme tokens and delete its private token copy.
- [x] Add a lint rule that bans hex colors and arbitrary text sizes in app code.
- [ ] Rewrite `docs/design.md`. Update `docs/roadmap.md`, `docs/map.md`,
      `CHANGELOG.md`.
- [ ] User runs `pnpm test` (no logic should change; this confirms it).
- [ ] With the user's go ahead: merge `design/linear` into `main`, which
      deploys production. Then update `dev` from `main`.

## Next action

Step 3: the app shell. Steps 1 and 2 are committed; ADR 141 "As built" has the
token names and the new `@matops/ui` parts. Icons are Lucide (`lucide-react`
lives in `@matops/ui`; add it to `apps/nextjs` when the shell first imports an
icon). Browser note: signed-in app screens stall on their loader in this Chrome
setup, with or without the redesign (checked with a stash A/B on 2026-09-26),
and `resize_window` did not change `innerWidth`. `/privacy` renders and passes
AA in both themes.
