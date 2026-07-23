# 48 · Mobile UX hardening — safe actions, copy, states, keyboard

*(Interaction-quality pass on the Expo student app, the native twin of the web
pass [47](47-web-ux-hardening.md). Builds on the mobile design system
[44](44-mobile-dark-first-design-system.md) and the ease-of-use pass
[45](45-mobile-ease-of-use.md); no domain, no migration, no router change —
presentation + interaction only.)*

## Context

After the v1.7/v1.8 mobile passes the app looked right, but an interaction
review found the same class of gaps the web app had before ADR 47:

- **Destructive taps fired with no confirmation** — cancel a booking (My classes
  + class detail), sign out (Settings + onboarding), submit an "I paid" claim.
  Only the soft-capacity "Book anyway?" was gated. There is no in-app modal on
  native; the platform `Alert` is the right guard and it was barely used.
- **Cancel used the wrong role** — `variant="outline"` for a destructive action,
  while the kit's `destructive` variant sat unused.
- **Mutation buttons had no busy state** — the kit `Button` couldn't show a
  spinner, so callers hacked the label ("…", "Saving…") and shared mutations left
  every row's button enabled mid-flight (double-tap, no per-row feedback).
- **Silent failures** — the inline schedule Book pill swallowed booking errors;
  the Settings push toggle flipped "on" even when the OS denied permission; the
  auth gate treated a failed `academy.current` load as "no gym" and dumped the
  member into onboarding; sign-in's magic-link send could hang "Sending…" forever
  on a thrown error; invalid invites and a slow magic-link verify were dead-ends.
- **Copy affordance existed only inline in Profile**, with a sub-44px target.
- **Keyboard covered the submit** on the form screens (sign-in, onboarding, join)
  — no `KeyboardAvoidingView`.
- **A11y + kit drift** — no `accessibilityState` on buttons, unlabeled `Switch`
  and segmented control, ad-hoc "Cancelled" text where `StatusPill` fits, a
  dev-only "copy the [auth] line" instruction shipping to production, and a
  fragile two-space time+title concatenation.

## Decision

Do the fix once in the kit (`components/ui.tsx`), then apply it everywhere —
matching the web pass, in native idioms.

- **`Button` gains `loading`** — shows an `ActivityIndicator` in the label colour,
  disables, and sets `accessibilityState={{ disabled, busy }}`. Every mutation
  button (save, join, book, cancel, sign out, claim, find gym, check in) now has a
  real, accessible busy state; the "…" hacks are gone.
- **`confirm({ title, message, confirmLabel, destructive, onConfirm })`** — a thin
  wrapper over `Alert.alert` with a destructive-styled confirm button, the native
  twin of the web `ConfirmDialog`. Every irreversible tap routes through it.
- **`CopyButton` + `CopyField`** — the lazy-guarded `expo-clipboard` copy lifted
  out of Profile into the kit, with a 44px target, an accessible name, and a
  "Copied ✓" state. Profile's bank details + reference use `CopyField`.
- **`InlineLoading`** — a spinner that doesn't paint a new full-screen surface, so
  a section/body loader stops covering the header (the full-screen `Loading` stays
  for whole-route gates).
- **`Screen avoidKeyboard`** — opt-in `KeyboardAvoidingView` (iOS `padding`), used
  by sign-in / onboarding / join so the submit lifts above the keyboard.
- **`TextField`** — an `accessibilityLabel`, plus `maxLength` / `textContentType` /
  `returnKeyType` / `onSubmitEditing` (the gym-ID field now caps at 6 digits and
  strips non-digits; "Find gym" enables only on a valid code).

Applied: cancel-booking and sign-out and "I paid" now confirm (cancel/sign-out use
the `destructive` variant); the Book pill toasts its error; the push toggle reverts
+ explains on permission denial / failure; the auth gate shows a retry on a failed
load instead of misrouting; sign-in wraps the send in try/catch/finally, gates the
dev copy to `__DEV__`, and adds a Resend; a bad invite offers "Enter a gym ID"; a
slow magic-link verify offers "Back to sign in" after 8s; ad-hoc "Cancelled" text
becomes `StatusPill`; the check-in success drops the `✓` emoji and the time+title
uses a real row; `Switch` + the appearance segmented control get roles/labels.

Scope was interaction hardening: no new domain, no migration, no router or token
change (the web can't regress).

### As built

- Kit (`apps/expo/src/components/ui.tsx`): `Button.loading` + `accessibilityState`,
  `confirm()`, `CopyButton`, `CopyField`, `InlineLoading`, `Screen.avoidKeyboard`,
  `TextField` a11y/props. Edited screens: `(tabs)/{profile,training,schedule}`,
  `class/[id]`, `checkin/[academyId]`, `settings`, `onboarding`, `sign-in`,
  `magic-link`, `join/[token]`, `index`, and `components/book-control`.
- Green: `pnpm -F @matops/expo typecheck · lint`; repo-wide typecheck 17/17,
  lint 15/15, tests 50; `expo export --platform ios` bundles the full graph with
  no resolution errors. **No simulator in the build env**, so the `Alert`
  confirms, the keyboard-avoidance on the centred auth screens, and the push
  permission-denied path want a **real-device pass** — consistent with the
  standing mobile-check note.

## Consequences

- New destructive taps use `confirm()`; new mutation buttons use `loading`; copy
  uses `CopyButton`/`CopyField`; multi-line/section loaders use `InlineLoading` —
  the ad-hoc versions are retired.
- The kit now owns busy-state + a11y for buttons, so future screens get it free.
- Follow-ups (not this ADR): consolidating the duplicated join/onboarding profile
  form into one kit component; a segmented-control kit primitive for the appearance
  picker; a device pass to confirm the keyboard-avoidance feel on the centred
  screens.
