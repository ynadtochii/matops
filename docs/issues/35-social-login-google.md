# 35 · Social login — Google

*(Phase 4 polish / slice 1.8, fulfils the "social login" half of spec S1)*

## Context

S1 always specified sign-in as **"social login or email + magic link"**, and roadmap
1.3 lists "social or email+magic-link". Only the magic-link half was built. This
note records adding the first social provider — **Google** — on both clients.

## Decision

- **One server switch.** `socialProviders.google` on the Better Auth config in
  `packages/auth/src/index.ts`, fed by two new optional env vars
  (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, in `packages/auth/env.ts`). Both
  clients hit the same router, so this one change enables web + mobile at once.
- **Conditional registration.** If either credential is missing, the provider is
  **not registered** (the config field is `undefined`). Dev, CI, and the tests
  keep working with no Google creds, and the web button no-ops (`signInSocial`
  returns no `url`) instead of throwing.
- **No new migration.** Social accounts reuse Better Auth's existing `account`
  table (`providerId = "google"`, `idToken`, …). The schema already has it.
- **No change to tenancy / the join gate.** A social sign-in creates a user with
  **no academy membership**, exactly like magic-link. So it lands on the same
  auth gate and the pending/approve join flow (ADR [29](29-pending-role-model.md)).
  `phone` is an optional additional field, so a Google user with no phone is fine.
- **One identity per email.** `account.accountLinking.trustedProviders = ["google"]`
  links a Google sign-in to an existing user with the same email instead of
  forking a second account. So an owner who created their gym via magic-link
  reaches the **same** academy when they later sign in with Google (and vice
  versa) — the home page routes by membership (`academy.listMine`), so a forked
  account would wrongly show "Start a gym". Safe: magic-link and Google both give
  a *verified* email, and email is our identity key.

## How each client signs in

- **Web** (`apps/nextjs/src/app/_components/sign-in.tsx`) — a server action calls
  `auth.api.signInSocial({ body: { provider: "google", callbackURL } })` and
  `redirect()`s to the returned Google consent URL. Google returns to
  `/api/auth/callback/google`. Keeps the existing server-action form pattern (no
  new client bundle). `oAuthProxy` (already configured) makes this work on Vercel
  preview URLs.
- **Mobile** (`apps/expo/src/app/sign-in.tsx`) — `authClient.signIn.social({
  provider: "google", callbackURL })`. `@better-auth/expo` opens the OAuth flow in
  a system browser (`expo-web-browser`, already a dependency) and returns the
  session to the app via the trusted `matops://` scheme (already in
  `trustedOrigins`). Same landing as the magic-link return.
- Both preserve an in-flight invite via `callbackURL` (`redirect` param on mobile).

## Alternatives considered

- **Native Google Sheet** on mobile via `@react-native-google-signin/google-signin`
  + `signIn.social({ idToken })` — nicer UX, no browser bounce, but needs extra
  iOS/Android OAuth client IDs and works only in the dev-client build (not Expo
  Go). Deferred; the browser-redirect flow ships first and needs one web client.
- **Web client component** calling `authClient.signIn.social` — rejected to avoid
  a new client bundle; the server-action redirect matches the magic-link form.

## Setup (ops)

Create a **Web application** OAuth client in Google Cloud Console. The
**Authorized redirect URI** must be **exactly** `http://localhost:3004/api/auth/callback/google`
(dev) — the full path, `http`, port `3004`; a missing/typo'd URI is the
`Error 400: redirect_uri_mismatch` you get on the Google consent screen. Add the
prod URI when deployed. This goes under **Authorized redirect URIs**, *not*
"Authorised JavaScript origins" (which take a bare origin, no path). Set
`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env` and the Vercel project.
Until then, only the magic-link path is offered.

## As-built status (2026-07-21)

- **Web Google login — works.** Server-side verified: the callback creates the
  user + a `google` `account` row + a session, and the redirect completes.
- **Account linking — works.** Signing in with magic-link on the same email as a
  Google account reaches the same user/academy (verified via a sign-out →
  sign-in round-trip). One identity per email holds.
- **Mobile Google login — server side works, session return open.** With the
  redirect URI registered, the mobile flow completes on the **server**: the
  `@better-auth/expo` browser flow → `/api/auth/callback/google` creates the user
  + `google` account + session and redirects to **`matops:///`** with the session
  cookie present (confirmed with a temporary diagnostic hook). But the **cookie
  is not landing in the app's storage**, so the app stays on Sign in. This is the
  same class of problem as the earlier mobile magic-link cookie hand-off. The
  remaining unknown is whether `@better-auth/expo`'s `after` hook actually appends
  `?cookie=` to the `matops://` deep link (a server-side plugin-ordering question,
  possibly with `nextCookies`) or the iOS auth session fails to capture the return
  (client-side). Not yet resolved.
  - **Options on the table:** (a) finish the browser-flow fix once the diagnostic
    confirms server- vs client-side; (b) switch mobile to the **native idToken
    flow** (`@react-native-google-signin`, needs the iOS OAuth client for bundle
    `com.matops.app` + a rebuild) — sidesteps the cookie dance; (c) defer mobile
    Google to the Phase-5 universal-links task, keeping magic-link on mobile.

## Deferred

- Native Google Sign-In sheet on mobile (above).
- Apple sign-in (App Store often requires it once another social provider ships —
  revisit in the Phase 5 launch-infra task alongside universal links, ADR 31).
