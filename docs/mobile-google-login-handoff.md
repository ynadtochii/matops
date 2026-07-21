# Handoff — mobile Google login (browser→app session hand-off)

**Status:** **DEFERRED (2026-07-21).** **Baseline commit:** `ec4fe7b`.
**Related:** ADR [35](issues/35-social-login-google.md) ("As-built status"), ADR
[31](issues/31-deep-link-approach.md) (deep links). Prior sibling problem +
pattern: the mobile **magic-link** cookie fix (CHANGELOG "Dev tooling & mobile
auth fix").

## Decision (2026-07-21) — defer; mobile is magic-link only for now

We are **not** implementing the mobile Google fix now. The break is at the iOS
`ASWebAuthenticationSession` return (H2, ruled-in below), and the reliable fix is
the native idToken flow (option C), which needs a new iOS OAuth client + a native
module + a dev-client rebuild — out of scope for this pass. So:

- **Mobile = magic-link only.** The "Continue with Google" button was **removed**
  from `apps/expo/src/app/sign-in.tsx` so users don't hit a silently-failing
  sign-in. Restore it when option C lands (the `signInGoogle` handler + `OrDivider`
  in git history at `ec4fe7b`).
- **Web Google login is unchanged and still works.**
- The analysis below stays as the starting point for whoever picks this up (most
  likely alongside the Phase-5 native/launch-infra work).

## Goal

Tapping **Continue with Google** in the Expo app should sign the app in — same
end state as web Google login and mobile magic-link (session stored, auth gate
routes onward to onboarding/schedule).

## What works vs what doesn't

- ✅ **Server side is complete.** A real Google consent creates the user + a
  `google` `account` row + a `session`. Verified live: user
  `nadtochii.e@gmail.com`, `account.provider_id="google"`,
  `account_id="107022549645084285170"`.
- ✅ **Web Google login** works. **Account linking** works (`trustedProviders:
  ["google"]`; same-email magic-link reaches the same academy).
- ✅ **The redirect URI is registered** in Google Cloud:
  `http://localhost:3004/api/auth/callback/google` (exact; under *Authorized
  redirect URIs*, not JavaScript origins). This fixed the earlier
  `Error 400: redirect_uri_mismatch`.
- ❌ **The app stays on Sign in.** The session cookie is not landing in the app's
  SecureStore, so `authClient.useSession()` stays null. **Narrowed (this pass):**
  source analysis rules out the server side — the deep link *does* carry
  `?cookie=`. The break is the iOS browser→app return (H2 below).

## Key evidence (from a temporary diagnostic, since removed)

A config-level `hooks.after` logged, on the Google callback:

```
[DIAG callback] /callback/:id | location= matops:/// | hasSetCookie= true | trustedOrigins= ["matops://","http://localhost:3004"]
```

So: the callback redirects to **`matops:///`**, a **set-cookie is present**, and
**`matops://` is trusted**. All the conditions the Expo plugin needs to hand the
cookie back are met.

**But this diagnostic proves nothing about the append** — and the reason is now
confirmed from source, not guessed. It was a *config-level* `hooks.after`. In
better-auth's `getHooks()` the config after-hook is pushed **first**, then the
plugin after-hooks are appended in plugin-array order
(`better-auth/dist/shared/better-auth.DAKEO6KF.mjs`, `getHooks`). For
`/callback/google` the run order is therefore:

```
config-hook (old diagnostic) → oAuthProxy → expo → nextCookies
```

So the diagnostic read `location` **before** the expo hook ran. `matops:///`
with no `cookie=` is exactly the expected *pre-append* value. It neither supports
nor refutes either hypothesis.

## How the flow is supposed to work (from `@better-auth/expo` source)

`node_modules/.pnpm/@better-auth+expo@1.4.0-beta.9…/dist/client.mjs` +
`dist/index.mjs`:

1. **Client `init`** (`client.mjs`): rewrites `callbackURL: "/"` →
   `Linking.createURL("/", { scheme: "matops" })` = **`matops:///`**; adds headers
   `expo-origin: matops://…` and `x-skip-oauth-proxy: true`.
2. **Client `onSuccess`**: on the `sign-in/social` response it opens
   `Browser.openAuthSessionAsync(proxyURL, to)` where
   `proxyURL = ${baseURL}/expo-authorization-proxy?authorizationURL=<google url>`
   and `to = callbackURL` (`matops:///`). Then:
   ```js
   if (result.type !== "success") return;          // <-- silently bails
   const cookie = new URL(result.url).searchParams.get("cookie");
   if (!cookie) return;                              // <-- silently bails
   storage.setItem(cookieName, getSetCookie(cookie));
   ```
3. **Server Expo plugin `after` hook** on `/callback` (`index.mjs`): if the
   response `location` starts with a **trusted non-http origin** (`matops://`),
   is **not** a `/oauth-proxy-callback` URL, and there **is** a `set-cookie`, it
   appends `?cookie=<set-cookie>` to `location` so the app receives it. Otherwise
   it returns without touching the redirect.

For success, the browser must end on `matops:///?cookie=…`; `openAuthSessionAsync`
catches the `matops` scheme, returns `type:"success"`, and the client stores the
cookie.

## The two hypotheses (H1 is now ruled out by source analysis)

- **H1 — server side (RULED OUT).** The claim was: the Expo after-hook does
  **not** append `?cookie=` (because `nextCookies()` moves the `set-cookie`
  header, or an ordering problem with `oAuthProxy`). Reading the installed
  `better-auth@1.4.0-beta.9` source rules this out on four counts:
  1. **Run order is fixed and favourable.** `getHooks()` appends plugin
     after-hooks in plugin-array order; ours is `[oAuthProxy, organization,
     magicLink, expo, nextCookies]`, so **expo runs before nextCookies**.
  2. **`nextCookies` never removes `set-cookie`.** Its after-hook only *reads*
     the header and copies each cookie into Next's cookie store
     (`better-auth/dist/integrations/next-js.mjs`). The raw header stays on the
     response, so a later hook still sees it. (And it runs after expo anyway.)
  3. **`oAuthProxy`'s after-hook does not touch our redirect.** It only rewrites
     `location` when it contains `/oauth-proxy-callback?callbackURL`
     (`plugins/oauth-proxy/index.mjs`). Our `location` is `matops:///`, so it
     returns untouched.
  4. **The expo hook's append works on the empty-host scheme.** `new
     URL("matops:///")` + `searchParams.set("cookie", <set-cookie>)` +
     `.toString()` yields `matops:///?cookie=…` with the param present (verified
     directly). The hook writes it back with `ctx.setHeader("location", …)`,
     which `runAfterHooks` applies (overwrites `location`).

  So the server **does** send the browser to `matops:///?cookie=<set-cookie>`.
  (One empirical confirmation is still cheap — see the diagnostic below — but the
  source says H1 is dead.)
- **H2 — client side (the live suspect).** The hook appends the cookie, but
  `openAuthSessionAsync(proxyURL, "matops:///")` does not return
  `type:"success"`, so the client hits `if (result.type !== "success") return`
  and stores nothing. The prime cause is the **empty-host `matops:///`** redirect
  not being caught by iOS `ASWebAuthenticationSession` (its `callbackURLScheme`
  is derived from the `matops:///` return URL).

## → The ONE next step: confirm H2, then fix the client boundary

The remaining unknown is empirical only (does iOS return `success`?). Re-add a
diagnostic that runs as the **last plugin** (so it sees the FINAL redirect, after
the Expo hook), do one real Google tap, and read the log. Expected — given the
analysis above — is `hasCookieParam=true`, which **confirms H2**.

Add to `packages/auth/src/index.ts` — import `createAuthMiddleware` from
`better-auth/api`, and append this to the `plugins` array **after**
`...(options.extraPlugins ?? [])`:

```ts
{
  id: "diag-last",
  hooks: {
    after: [
      {
        matcher: (c: { path?: string }) => c.path?.includes("/callback") ?? false,
        handler: createAuthMiddleware(async (ctx) => {
          const h = ctx.context.responseHeaders;
          const loc = h?.get("location") ?? "";
          console.log("[DIAG-LAST]", ctx.path,
            "| finalLocation=", loc,
            "| hasCookieParam=", loc.includes("cookie="),
            "| hasSetCookie=", !!h?.get("set-cookie"));
        }),
      },
    ],
  },
} as BetterAuthPlugin,
```

**Read the result:**
- `hasCookieParam=true` (**the expected outcome**) → **H2 (client-side)
  confirmed**. The cookie is on the deep link but the iOS session isn't capturing
  it. Go to the native flow (option C) — it's the reliable fix. (A stop-gap worth
  one try first: get the return URL off empty-host `matops:///`, option B.)
- `hasCookieParam=false` (with `hasSetCookie=true`) → this would **contradict the
  source analysis** (H1 was ruled out — see the four points above). If you ever
  see this, something in the deployed better-auth version differs from the source
  read here; re-check the plugin-array order and whether a newer `nextCookies`
  strips the header. Do not assume H1 without this contradicting evidence.

**Remember to remove the diagnostic afterward** (it was reverted in `ec4fe7b`).

## Repro (from this session)

1. Ensure `.env` has `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and the redirect
   URI above is registered in Google Cloud.
2. Start an **instrumented** web server you can read the logs of:
   `pnpm dev:next` (background), wait for `Ready`.
3. Start Metro: `cd apps/expo && pnpm exec expo start` (background, port 8081).
4. Launch the app into Metro (app id `com.matops.app`, already installed on the
   sim): `xcrun simctl openurl booted "matops://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.
5. **Tap Continue with Google in the simulator and complete consent** (this step
   is interactive — a human picks/approves the Google account; it can't be
   scripted). Screenshot the sim with `xcrun simctl io booted screenshot <path>`.
6. Read the server log for `[DIAG-LAST]`.

Useful during debugging:
- Inspect the redirect_uri the server sends:
  `curl -s -X POST http://localhost:3004/api/auth/sign-in/social -H 'Content-Type: application/json' -d '{"provider":"google","callbackURL":"/"}'` → parse the `url`'s `redirect_uri`.
- Check server-side result: query `user` / `account` (provider_id) / `session`
  via a throwaway `tsx` script under `packages/db` run with `pnpm with-env`.

## Fix options (H1 ruled out — the choice is now B vs C vs D)

- **(A) Server-side ordering fix** — ~~for H1~~. **Not applicable.** Source
  analysis shows the server already appends `?cookie=` correctly (see the H1
  section). Nothing to fix here.
- **(B) Callback-host fix** — the cheap H2 attempt. Get the return URL off
  empty-host `matops:///` onto a form `ASWebAuthenticationSession` catches
  reliably. Note the constraint: the expo client rewrites `callbackURL` via
  `Linking.createURL(path, { scheme })`, which yields `matops://` + empty host
  for any leading-`/` path — so you cannot get a non-empty **host** just by
  changing `callbackURL`. This likely needs a change in how `@better-auth/expo`
  builds the return URL (or an upstream/patched version), which makes it less of
  a quick win than it first looks. Try once; if it fights back, go to (C).
- **(C) Native Google Sign-In (idToken) — RECOMMENDED.**
  `@react-native-google-signin` + `signIn.social({ idToken })`. Sidesteps the
  browser/cookie dance entirely; the session comes back on the normal fetch
  response (which the Expo client already stores in `onSuccess`, before the
  browser branch). This is the one path that does **not** depend on the fragile
  iOS `ASWebAuthenticationSession` return that H2 is stuck on. **Cost:** an iOS
  OAuth client for bundle `com.matops.app` (the earlier "can't create iOS client"
  step just needed the Bundle ID filled in) + the native module + a dev-client
  rebuild. Needs a human for the Google Cloud client + a device/sim run to verify.
- **(D) Defer** — keep magic-link on mobile, Google on web only; revisit with the
  Phase-5 universal-links task. Valid if mobile Google isn't launch-critical.

## Files

- `packages/auth/src/index.ts` — plugins `[oAuthProxy, organization, magicLink,
  expo, ...extraPlugins]`; `trustedOrigins: ["matops://"]`;
  `account.accountLinking.trustedProviders: ["google"]`; `socialProviders.google`.
- `apps/nextjs/src/auth/server.ts` — `extraPlugins: [nextCookies()]`;
  dev `baseUrl = http://localhost:3004`.
- `apps/expo/src/utils/auth.ts` — `expoClient({ scheme: "matops", storagePrefix:
  "matops", storage: SecureStore })`.
- `apps/expo/src/app/sign-in.tsx` — `signInGoogle` → `authClient.signIn.social({
  provider: "google", callbackURL })`.
- `apps/expo/src/utils/base-url.ts` — mobile `baseURL` = LAN host `:3004`.
