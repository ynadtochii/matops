# 11 — Cross-platform design system (web + mobile)

Type: grilling
Status: resolved
Blocked by: —

## Question

The FE stack fixes **shadcn/ui + Tailwind** for the owner web app — but shadcn/ui is **web-only** (React DOM + Radix), so it cannot render in the Expo/React Native student app. How do we get a *consistent, flawless* look and feel across both clients without maintaining two unrelated design languages?

Decide the mobile-side system and the shared-token story:
- **Mobile UI approach** — top contenders: **NativeWind** (Tailwind syntax in RN) + **react-native-reusables** (shadcn-style copy-paste components for RN — closest visual parity with web shadcn); vs **Tamagui** (truly universal web+native, heavier/steeper); vs **gluestack-ui v2** (universal, NativeWind-based). 
- **Shared design tokens** — colors, spacing, radii, typography defined once (a Tailwind/`packages/config` preset) and consumed by both web Tailwind and NativeWind, so the two apps stay visually in sync.
- **What is genuinely shareable vs platform-specific** — tokens and maybe headless logic are shared; the rendered components are not (DOM vs RN primitives). Set the expectation.

Relates to the monorepo shared-package layout ([07](07-monorepo-structure.md)) and the UX bar in the product spec ([09](09-mvp-product-spec.md)).

Output: the chosen mobile design system + the shared-token mechanism, with a one-line rationale for consistency and velocity.

## Answer

**Web: shadcn/ui + Tailwind. Mobile: NativeWind + react-native-reusables. Shared tokens, not components.**

- **Mobile UI:** **NativeWind** (Tailwind syntax in RN) + **react-native-reusables** (shadcn-style copy-paste RN components) → closest visual parity with the web shadcn/ui, same mental model, best solo-dev velocity. (Tamagui/gluestack considered; heavier / different idiom — rejected for v1.)
- **Shared design tokens:** one source of truth (colors, spacing, radii, typography) as a **shared Tailwind preset** in `tooling/tailwind`, consumed by both web Tailwind and mobile NativeWind → the two clients stay visually in sync from one file.
- **Shareable vs not:** tokens + headless logic are shared; **rendered components are not** (React DOM vs RN primitives). Expectation set: parity comes from shared tokens + mirrored component APIs, not shared component code.
- **Flawless-UX bar** ([09](09-mvp-product-spec.md)) rides on this consistency.
