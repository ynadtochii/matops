# ADR 44 — Mobile dark-first design pass: Geist + token-derived kit

**Status:** accepted · **Date:** 2026-07-22 · **Supersedes:** none (extends ADR
[37](37-brand-identity.md) brand, ADR [38](38-app-navigation-shells.md) mobile UX, ADR
[43](43-web-design-system-primitives.md) web primitives)

## Context

The Expo student app was styled per ADR 38 ("explicit RN styles + brand"): a
local `components/ui.tsx` kit whose light/dark palette was **hand-copied** from
the tokens, keyed off the OS via `useColorScheme()`. Meanwhile the web got the
ADR 43 design-system pass (shared composition vocabulary + a branded sign-in),
and `docs/design.md` §7 still listed three open mobile gaps: **Geist via
`expo-font`**, a **RN motif equivalent**, and **retiring the local kit onto the
shared tokens**. Three things had drifted or were missing on mobile:

1. **Not dark-first.** The canonical matops dark surface is pure black; the app
   merely followed the phone's OS setting.
2. **No Geist / Geist Mono.** The system font shipped, so the signature "Geist
   Mono is the mat clock" (design.md §3 — times, counts, prices read like a
   scoreboard) was absent, and headings weren't Geist.
3. **Ad-hoc styling.** A hand-copied token subset (dark `destructive` had
   already drifted), rounded 8–12px corners vs. the web's tight 3px, `muted`
   fills instead of the web's filled-vs-outline cards, and no mobile twin of the
   `Eyebrow` / `Stat` / `SectionHeading` / `CountBadge` vocabulary.

## Decision

A presentation-only pass on the Expo app — **no domain, no API, no migration, no
router change**. Dark-first, Geist, and the shared design language on every
screen (S1–S9).

- **Dark-first theme, tri-state.** New `components/theme.tsx` — a `ThemeProvider`
  that defaults to **dark** and offers Light / Dark / System (mirrors the web
  `ThemeToggle`), persisted in `expo-secure-store`. The scheme is applied through
  React Native's `Appearance.setColorScheme`, which both the palette and
  NativeWind v5 (it reads RN's appearance) honour, so the few className-styled
  colours (the shared logo's `bg-brand`) always match. A new **Appearance**
  control on Profile (S7) switches it.
- **One token source.** The palette now comes from `@matops/ui/tokens`
  (`tokens.light` / `tokens.dark`) — the same literals as `theme.css`. The
  hand-copied subset and its dark-`destructive` drift are gone. `useTheme()`
  returns the resolved token object.
- **Geist typography.** `@expo-google-fonts/geist` + `-geist-mono` loaded in the
  root layout via `useFonts` (splash held until ready). `components/fonts.ts`
  maps a numeric weight to its exact family (RN can't synthesize weights). A
  single `Txt` primitive applies Geist everywhere; `Mono` / `Eyebrow` / `Stat`
  put **Geist Mono + tabular figures** on every data value (class times, capacity
  `18/24`, prices, streaks, reference codes, dates).
- **Aligned kit.** `components/ui.tsx` rebuilt to the web language: **tight 3px
  radius**, flat `filled` vs. `outline` **`Card`** on a hairline border,
  **dashed-stripe `Callout`** (the `Banner` alias keeps old call sites),
  `StatusPill` (dot + mono label) for dues/booking state, `CountBadge`, mono
  UPPERCASE field labels, and a focus-ring on inputs. The signature moment:
  **sign-in** gains a whisper-quiet `Blueprint` grid + an oversized bled-off
  `Mark` — the mobile twin of the web hero (and the RN motif design.md §2 wanted).

## Consequences

- **Native dependency added** (`expo-font` + two Geist packages) → needs a
  **dev-client rebuild** to render on device; verifiable here only by static
  gates + a Metro bundle, not a simulator (none in the build env).
- **Font weights:** the packages are imported by their documented named exports,
  so Metro bundles all Geist weights (~1.6 MB of assets), not just the four used.
  Kept for clean, typed imports; trimming to per-weight `.ttf` paths is a later
  optimization if app size matters.
- **The local kit still exists**, but is now **token-derived and aligned** rather
  than hand-copied. Fully collapsing it onto the shared `@matops/ui` RN
  primitives (`button.native`, `logo.native`) remains a smaller follow-up — the
  screens import from `~/components/ui`, which is the seam to migrate behind.
- No token/`theme.css` change, so the **web can't regress**; both clients still
  read one source of truth.

## Verification

`pnpm -F @matops/expo typecheck · lint · format` all green; `expo export
--platform ios` bundles the full graph (fonts + provider + all screens) with no
resolution errors. Device/visual check pending a dev-client rebuild.
