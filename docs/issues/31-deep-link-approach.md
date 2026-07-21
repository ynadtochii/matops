# 31 — Deep-link approach for the invite flow (custom scheme now, universal links later)

Type: build-decision (mobile pass)
Status: resolved
Refines: [26](26-seamless-registration-deeplink.md), [18](18-multi-academy-ux.md); architecture §6, §11

## Question

Spec S2 opens the mobile join flow from an **invite link** — "deep link
`matops://join/<code>` **or** an https universal link". Universal/App links (a tap
on an `https://…/join/<code>` URL opening the app directly) are the nicer UX, but
they need **Apple App Site Association (AASA)** + **Android assetlinks.json**
served from a **verified domain**, plus real **Apple Developer / Google Play /
EAS** accounts and store submission. None of that exists yet, and the build
environment has no simulator or device. What deep-link mechanism does the mobile
pass ship, and what is deferred?

## Answer

**Ship custom-scheme deep links now; defer universal/App links to a Phase 5
launch-infra task.**

- The Expo app registers the scheme **`matops`** (`app.config.ts`), so
  `matops://join/<code>` opens the app and expo-router's file route
  `app/join/[token].tsx` resolves the token. No hosting, no store accounts, no
  domain needed.
- An **in-app "paste invite link" path** (onboarding screen) is the
  everywhere-works fallback: a pure `extractInviteToken` accepts a `matops://`
  link, an `https://…/join/<code>` link, or a bare code. This works even where a
  custom scheme does not fire (e.g. a client that owns its own scheme).
- The **magic-link return** reuses the same scheme: `@better-auth/expo` rewrites
  the relative `callbackURL` into `matops://…`, so a signed-out invite carries its
  token through sign-in via a `?redirect` param and lands back on the join screen.
- **Universal/App links stay deferred.** When the user has an Apple Developer +
  Google Play + EAS account and a hosted domain, a Phase 5 task adds the AASA +
  assetlinks files, the `associatedDomains` / `intentFilters` config, and EAS
  submit. The custom scheme keeps working alongside them.

## Why this split

- **No external accounts on the critical path.** Universal links are blocked on
  credentials and a domain we do not have; the custom scheme unblocks the entire
  student join loop today.
- **Testable without a device farm.** The paste path is verifiable by code review
  + the static gates; the custom-scheme link needs only a dev build. Universal
  links would need a provisioned domain + signed store build to test at all.
- **Additive, not throwaway.** Adding universal links later is pure configuration
  on top of the same routes — the custom scheme and the paste path remain the
  fallback the spec already calls for (S2: "falls back to the drop-in web form").

## Consequences / carried forward

- **Custom-scheme links need a dev build** (`expo run:ios`/`run:android` or an EAS
  dev build), **not Expo Go** (Expo Go owns its own scheme). Lead device testing
  with the in-app paste path, which works everywhere.
- The server `trustedOrigins` must list the app scheme (`["matops://"]`) or the
  magic-link session cookie is not returned to the app (architecture §6).
- **Phase 5 launch-infra** owns: AASA + Android assetlinks on a verified domain,
  `associatedDomains`/`intentFilters`, EAS project id + store submission. Until
  then a tapped `https://…/join/<code>` opens the web drop-in form, not the app.
- The "app not installed → store → remembered link" leg of S2 is a universal-link
  concern, so it is deferred with them.

**Refines** [26](26-seamless-registration-deeplink.md): the deep link is a custom
scheme (`matops://join/<code>`) + in-app paste for v1; universal/App links are a
Phase 5 launch-infra task.
