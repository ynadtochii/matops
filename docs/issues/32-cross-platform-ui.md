# 32 — Cross-platform UI: shadcn on web, RN twins on mobile

Type: build-decision (design system)
Status: resolved
Relates: `docs/design.md` (design language), `tooling/tailwind/theme.css` (tokens)

## Question

The web app uses **shadcn/ui** — DOM elements (`<button>`, `<input>`) + Radix,
which cannot render in React Native. The mobile app (Expo + NativeWind) needs
`View` / `Text` / `Pressable` / `TextInput`. Both must share one look derived
from the Better Auth design system. How do we build components once and keep the
two clients visually identical without a universal framework (Tamagui/gluestack
would replace shadcn, which the stack locks in)?

Today the mobile app has a **separate** hand-rolled kit
(`apps/expo/src/components/ui.tsx`) that shares the tokens but has a different
API and is already **drifting** (its hardcoded `headerColors.dark` went stale
when dark `--background` moved to `#000000`).

## Answer

**Share the style recipe, split the primitive, mirror the API.** A component is
three separable parts; only the primitive is platform-bound.

### Layers

1. **Tokens** — `tooling/tailwind/theme.css`. Both platforms resolve the same
   Tailwind color/radius utilities (NativeWind reads the same `@theme`). Source
   of truth for anything expressed as a className.
2. **Literal-color tokens** — `packages/ui/src/tokens.ts`. The same hex as
   `theme.css`, exported as TS, for the few RN APIs that need a color value, not
   a class (`Stack` header, `placeholderTextColor`, `StatusBar`). Kills the
   stale-hex drift.
3. **Shared recipe** — `packages/ui/src/<c>-variants.ts`. A `cva` holding only
   **cross-platform** classes (color, size, radius, spacing, layout). No web-only
   pseudo-selectors (`hover:`, `focus-visible:`, `[&_svg]`, `has-[…]`, `aria-*`).
   Split into a **container** recipe and a **text** recipe, because RN does not
   cascade text color from a container to a child `<Text>`. Same `variant` names
   on both platforms → identical look and identical vocabulary.
4. **Platform primitives** — two files per component, one import path:
   - `<c>.tsx` (web) → `<button>` / Radix, container + text recipes on the
     element, plus web adornments (hover, focus-visible ring, svg sizing).
   - `<c>.native.tsx` (mobile) → `<Pressable>` + `<Text>`, container recipe on
     the pressable, text recipe on the label, plus native adornments (`active:`
     pressed, disabled opacity, a `min-h-11` 44px touch-target floor).

### Resolution — one import, right file per bundler

`package.json` uses conditional `exports`:

```jsonc
"./button": {
  "react-native": "./src/button.native.tsx",
  "default": "./src/button.tsx"
}
```

- **Metro** (Expo) matches the `react-native` condition → native file.
- **Next / webpack** has no such condition → `default` → web file.
- **TypeScript**: the Expo `tsconfig.json` sets
  `"customConditions": ["react-native"]` so type resolution matches Metro; the
  web app falls through to `default`. Verified: `pnpm -F @matops/expo typecheck`
  sees the native props (`onPress`, string children); `pnpm -F @matops/nextjs
  typecheck` sees the web props.

### RN specifics handled (that the old local kit missed)

- **Text color must ride `<Text>`** — hence the container/text recipe split.
- **`className` types** — NativeWind v5 augments RN via `react-native-css/types`
  (not `nativewind/types`). `button.native.tsx` references it; `@matops/ui`
  carries `react-native` + `react-native-css` as **dev deps** and an **optional**
  `react-native` peer, so the web app never pulls RN and the package can
  typecheck both twins on its own.
- **Touch targets** — native default gets a 44px floor while web stays compact.

### Overlays and icons

- **Flat components** (Button, Badge, Input, Label, Card, Callout, Alert):
  hand-rolled twins with the shared recipe. No extra deps.
- **Overlays** (DropdownMenu, Dialog, Select, Tabs, Toast): web = Radix (shadcn);
  mobile = **react-native-reusables / `@rn-primitives`** (accessible RN ports of
  Radix that use the same token classNames). Do **not** hand-roll a11y for
  overlays. Caveat: this repo runs `nativewind@5.0.0-preview.2`; RN-Reusables is
  validated mainly on NativeWind v4, so verify each overlay when we add it. Toast:
  web `sonner`, mobile `sonner-native`.
- **Icons**: web `lucide-react`, native `lucide-react-native` (same names) behind
  a future `@matops/ui/icons` using the same conditional-export trick.

## Reference implementation (this change)

- `packages/ui/src/button-variants.ts` — shared container + text recipes.
- `packages/ui/src/button.tsx` — web, refactored onto the shared recipe.
- `packages/ui/src/button.native.tsx` — RN twin.
- `packages/ui/src/tokens.ts` — literal-color source.
- `packages/ui/package.json` — conditional `./button` export, `./tokens`,
  `./button-variants`, RN dev/peer deps.
- `apps/expo/tsconfig.json` — `customConditions: ["react-native"]`.
- `apps/expo/package.json` — depends on `@matops/ui`.
- `apps/expo/src/app/sign-in.tsx` — now imports `Button` from `@matops/ui/button`
  (proof the same component drives a real mobile screen).

## Migration (follow-on)

1. Build the remaining flat components as twins on this pattern.
2. Move RN-only layout (`Screen`, `Loading`) into `@matops/ui` (e.g.
   `./layout` native entry) and delete `apps/expo/src/components/ui.tsx`; point
   its `headerColors` / `placeholderTextColor` at `@matops/ui/tokens`.
3. Add overlays via RN-Reusables when a screen needs one.
4. Add `@matops/ui/icons`.

## Consequences

- **+** One design source; variants can't drift because both twins eat the same
  recipe. Look verified identical by construction (shared classes + shared tokens).
- **+** `@matops/ui` stays the single UI package; web bundle never gets RN.
- **−** Two files per component and a small amount of per-platform adornment
  duplication. Accepted: it is the irreducible platform delta (DOM vs RN).
- **−** Event props differ by nature (`onClick` vs `onPress`); call sites are
  per-platform screens anyway, so only the visual language is shared, not events.
