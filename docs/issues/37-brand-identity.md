# 37 · Brand identity — matops owns its look

*(v1.1 usability map, ticket [01](../../.scratch/usable-v1/issues/01-brand-design-system.md); supersedes the "match Better Auth closely" stance in [design.md](../design.md) §0. Refines [cross-platform UI](32-cross-platform-ui.md) + [mobile explicit styles](36-mobile-ui-explicit-styles.md).)*

## Context

The design system (`docs/design.md`, `tooling/tailwind/theme.css`) was a near-copy
of the **Better Auth** brand: warm-stone monochrome, ink primary, Geist, tight
radius — and **no signature colour and no mark of its own**. Good bones, borrowed
skin. The v1.1 "make it usable" effort needs matops to read as its own product,
so ticket 01 set out to give it an identity without throwing away the (genuinely
good) disciplined baseline.

Constraint: the four **functional callout** hues already spend blue / orange /
red / green on *meaning* (info / warning / error / success). A brand hue must sit
in the gap so it is never mistaken for a status.

## Decision

Keep the ethos and the token *plumbing* (the single `theme.css` both clients
import + the `@matops/ui/tokens` TS twin). Add matops's own identity on top:

- **Signature hue = violet.** `--brand #6A4DFF` (light) / `#8B72FF` (dark), plus
  `--brand-strong` (links / text-on-light), `--brand-foreground` (text + seams on
  a fill), `--brand-wash` (tint surface). Chosen for the functional-colour gap and
  the **purple belt** (a real grappling milestone). One flat tone, no gradients.
- **Restrained application.** Ink stays the primary button; violet is the *spark*
  only — mark, active nav, links, focus, the pending banner/tag. **Violet marks
  identity; the four callouts mark meaning — they never swap jobs.**
- **Mark = the basketweave mat bond.** A rounded tile filled `--brand` with the
  seams of a **basketweave** bond (the woven plank pairs real mats are laid in),
  in `--brand-foreground`. Chosen over a plain grid (owner-supplied reference of
  real mat-laying patterns) and over the tiles / outline / brick-pinwheel
  alternates because the filled basketweave stays legible at the 24px favicon.
- **Neutrals unchanged** — warm stone kept (a deliberate warm-stage / cool-spark
  contrast).

### As built

- Tokens: `tooling/tailwind/theme.css` (`:root`, `@variant dark`, `@theme inline`)
  + `packages/ui/src/tokens.ts`. Utilities: `bg-brand`, `text-brand-strong`,
  `bg-brand-wash`, `fill-brand`.
- Mark: shared `@matops/ui/logo` — `Mark` + `Logo`; web = inline SVG
  (`logo.tsx`), mobile = positioned Views (`logo.native.tsx`, **no
  `react-native-svg`**). The wordmark's text colour + row layout use explicit RN
  styles + tokens, since NativeWind v5 doesn't translate foreground colours /
  `gap` / alignment on native (ADR 36); the tile/seams ride `bg-*` (backgrounds
  do translate). Web favicon: `apps/nextjs/src/app/icon.svg`; tab title branded.
- Docs: `docs/design.md` §0/§1.1/§6/§7 rewritten. Full visual reference saved
  standalone at `docs/design-system/matops-design-system.html`.

## Consequences

- Every screen can now use `bg-brand` / `text-brand-strong` etc.; the app-shell
  (web IA) and mobile-structure tickets build on real tokens + the shared `Logo`.
- Better Auth is now **heritage, not source of truth** — future design questions
  are answered by matops's own system, not "do what that page does".
- Follow-ups (not this ADR): the mobile kit's theme hook should drive the
  wordmark colour instead of OS scheme; the legacy T3 `public/favicon.ico` still
  serves `/favicon.ico` (the SVG `app/icon.svg` covers modern browsers).
