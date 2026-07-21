# 36 · Mobile UI kit — explicit React Native styles

*(mobile polish; refines the cross-platform UI base, ADR [32-cross-platform-ui](32-cross-platform-ui.md))*

## Context

The Expo student app styles its UI with **NativeWind** (Tailwind classes on RN
components), sharing the token layer with the web. On the iOS simulator the
login and profile screens rendered **broken**: buttons were cramped bars with
dark, unreadable labels, and there was no spacing between elements.

Diagnosis (live on the simulator): **NativeWind v5 (preview,
`5.0.0-preview.2` + `react-native-css`) does not reliably translate a subset of
utilities on native** — spacing (`gap-*`), flex alignment (`items-*`/
`justify-*`), and foreground text colors (`text-primary-foreground`). Background
colors, borders, font sizes/weights, and the screen padding *did* apply, which is
why the breakage was partial and easy to miss (no simulator in the earlier build
env — device checks were handed off).

## Decision

**Style the shared mobile UI kit with explicit React Native styles**, not
NativeWind classes. `apps/expo/src/components/ui.tsx` now renders `Button`,
`TextField`, `Screen`, `Heading`, `Muted`, `Banner`, `EmptyState`, `ErrorState`
with inline `style` props, plus new `Stack` (reliable `gap`), `OrDivider`, and a
`useTheme()` helper. Colors come from a small palette that **mirrors the shared
tokens** (`tooling/tailwind/theme.css`) and switches on `useColorScheme()`, so
light/dark still match the web.

- **Scope:** the *primitives* are hardened, so every screen that uses them gets
  correct buttons, inputs, and text. The login (`sign-in.tsx`) and logout
  (`profile.tsx`) screens were rewritten onto the kit + `Stack` and **verified on
  the iPhone 17 simulator**. Other screens keep a `className` passthrough on
  `Screen` (so they compile unchanged); their section-level `gap-*` spacing may
  still be cramped until ported to `Stack` — a mechanical follow-up.
- **Web is untouched.** Web keeps `@matops/ui` (shadcn) + NativeWind; only the
  Expo kit changed.

## Why not fix NativeWind itself

Chasing which v5-preview utilities compile (and why) means slow Metro
rebuild + screenshot cycles against a moving pre-release. Explicit styles are
boring, correct, and independent of that churn. If NativeWind v5 stabilises, the
kit can move back — the token values already match, so it is a swap, not a
redesign.

## Related fix (same pass)

`pnpm dev:ios` failed to launch the app into Metro: `apps/expo/scripts/run-ios.sh`
opened the dev client with **`exp+expo://`** (Expo Go's scheme), which nothing
registers → `LSApplicationWorkspaceErrorDomain error 115`. Fixed to the app's own
scheme, `matops://expo-development-client/?url=<metro>` (URL-encoded). Verified:
the app launches into the bundle.

## Follow-ups

- Port the remaining Expo screens (onboarding, schedule, check-in, class detail,
  join) off `Screen className="gap-*"` onto `Stack` for consistent spacing.
- Re-evaluate NativeWind v5 when it leaves preview.
