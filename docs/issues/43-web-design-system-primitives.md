# 43 · Web design-system pass — shared primitives + one signature moment

*(Design tightening of the owner/instructor web app. Builds on the brand
[37](37-brand-identity.md) and the app shells [38](38-app-navigation-shells.md);
no domain, no migration, no router change — presentation only.)*

## Context

The web app was disciplined but read as a clean shadcn/T3 default rather than
matops. Under the tidiness sat real system drift: three different "card"
treatments copy-pasted per screen (`bg-muted` rows vs. bordered cards vs.
dashed), the section-heading + count-badge pattern duplicated in roster and
payments, `Stat` defined twice, raw unstyled `<select>` elements on five
screens (no focus ring, didn't match `Input`), a blanket `hover:opacity-90` on
every button (dimmed the label with the fill), and heading weights that drifted
(`font-bold` on public pages vs. `font-semibold tracking-tight` in the shell).
The violet brand spark barely showed, and the one hero moment — sign-in — was a
bare centered form with no brand.

The radius was **checked and left alone**: `rounded-lg` is wired to
`--radius-lg: var(--radius)` = 3.2px, so the whole app is already consistently
tight — the intended Better Auth heritage look, not a bug.

## Decision

Make the design system real at the component level, keep the calm aesthetic, and
spend boldness in exactly one place.

- **One `Select` primitive** (`@matops/ui/select`, web-only) styled to match
  `Input` — same height, border, focus ring, radius, plus a custom chevron
  (inline-style data-URI in stone-500 that reads on both light and dark, so no
  theme switch). Single element, so it drops in anywhere a bare `<select>` was.
- **Shared layout vocabulary** (`apps/nextjs/.../_components/primitives.tsx`,
  web composition helpers next to `states.tsx`): `cardClass({variant, interactive})`
  formalises the two surfaces — `filled` (quiet muted row for static list items)
  vs. `outline` (bordered card for things that navigate/act); `SectionHeading`
  (h2 + optional attention `count` + right-aligned `action`); `CountBadge` (the
  count carries the **brand** spark, matching the nav badges — it always means
  "N things want you", never a data status, per ADR 37); `Stat` (the de-duped
  metric block); `Eyebrow` (the mono-uppercase metadata label).
- **Real button hover** — per-variant hover states (`webHover` map in
  `button.tsx`) replacing `hover:opacity-90`; a surface/colour response instead
  of dimming the label. Native is unaffected (no hover in the shared recipe).
- **Signature moment = sign-in.** A blueprint brand panel: the existing `bg-grid`
  texture with an oversized basketweave `Mark` bled off the corner, the "Run the
  mat, not the paperwork" thesis, and the product's own vocabulary
  (Schedule/Roster/Attendance/Dues) as a mono rail — form on the other side,
  stacked to a compact branded header on small screens.
- **Brand presence on the public pages** — a `Logo` on the join + venue check-in
  wrappers so every entry point reads as matops.

Scope was **disciplined tightening**, not a redesign: no new domains, no token
changes (radius/colours untouched, so the Expo app can't regress), no change to
what any screen does.

### As built

- New: `packages/ui/src/select.tsx` (+ `./select` export),
  `apps/nextjs/src/app/_components/primitives.tsx`. Edited: `button.tsx`
  (per-variant hover); every owner/instructor screen + settings sub-components
  now consume the primitives; `sign-in/page.tsx` rebuilt as the split hero;
  `checkin` + `join` wrappers gained the `Logo`; public form headings aligned to
  `font-semibold tracking-tight`.
- Green: `pnpm typecheck` (17/17) · `pnpm lint` (15/15) · `next build`. Live
  render checked on the running dev server (dashboard, schedule, roster,
  payments, settings) — no console errors; `Select` renders as styled
  comboboxes. **Screenshot verification was unavailable** (browser CDP capture
  failed in this env); sign-in couldn't be viewed signed-in (it redirects).

## Consequences

- New screens use `cardClass` / `SectionHeading` / `Select` / `Stat` / `Eyebrow`
  instead of re-inventing them — the three card treatments collapse to two named
  variants, and section headings all come from one component.
- Better Auth stays heritage; matops's own primitives are now the answer to "how
  should this look".
- Follow-ups (not this ADR): a mobile twin for the same vocabulary if the Expo
  screens want it; a visual regression pass once screenshotting works in the env.
