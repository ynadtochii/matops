# 72 · Sentry for error tracking (web)

_(Roadmap **5.2**, the "observability + errors" half. No spec ID, no migration, no user-visible behavior beyond a styled crash page. Rate limiting, the other half of 5.2, is untouched.)_

## Context

Until now the only way to learn that the web app broke was for someone to tell us. Vercel keeps function logs, but nobody reads logs on a schedule, a client-side crash never reaches them at all, and a log line has no stack trace mapped back to the source. The pilot puts a handful of real academies on the app with no support channel and no way for an owner to report a crash except by giving up.

The choice was Sentry or nothing. Building error collection is not a thing to build.

## Decision

**`@sentry/nextjs`, installed by the official wizard, wired for all three Next runtimes.**

- `src/instrumentation.ts` loads `sentry.server.config.ts` under the Node runtime and `sentry.edge.config.ts` under the edge runtime, and exports `onRequestError = Sentry.captureRequestError`. That export is what catches server errors from the tRPC route handler, so a throw inside a procedure arrives with the request attached instead of as an anonymous 500.
- `src/instrumentation-client.ts` initializes the browser SDK and exports `onRouterTransitionStart` so App Router navigations are traced.
- `src/app/global-error.tsx` reports a crash that escapes the root layout. This is the one user-visible part: a page that previously rendered nothing now renders Next's generic error page.
- `next.config.js` is wrapped in `withSentryConfig`, which uploads source maps at build time. Without it every stack trace is minified and useless.

**The DSN is hardcoded in the three init files, not read from `env.ts`.** A DSN is a public value, it ships in the client bundle either way, and there is exactly one Sentry project. Putting it in the t3-env `client` schema would make it a required variable that fails the build when unset, which is a worse failure than reporting nothing.

**`tracesSampleRate: 1`.** Every request is traced. This is wrong for a busy app and right for a pilot with a few academies, where the interesting question is "what happened to that one owner" and sampling would throw the answer away. Revisit when volume makes the quota bite.

## What the wizard got wrong, and had to be fixed

**It broke the build.** `apps/nextjs/package.json` sets `"type": "module"` and `next.config.js` is ESM: `import`, top-level `await`, `export default`. The wizard appended CommonJS to the end of it:

```js
const { withSentryConfig } = require("@sentry/nextjs");
module.exports = withSentryConfig(module.exports, { ... });
```

Node refuses to load that file at all: `ERR_AMBIGUOUS_MODULE_SYNTAX`, because `require()` and top-level `await` cannot both appear in one module. `next dev` and `next build` both failed on the spot. There is a second bug hiding under the first: the file never assigns `module.exports`, so even in a CommonJS file the wrapper would have wrapped an empty object and silently dropped `transpilePackages` and every other setting. Fixed by moving the import to the top and wrapping the existing `config` object in the existing `export default`.

**It tripped two repo lint rules.** `src/instrumentation.ts` reads `process.env.NEXT_RUNTIME`, and this repo bans bare `process.env` (`no-restricted-properties`, use `~/env`) and requires every env var to be declared in `turbo.json` (`turbo/no-undeclared-env-vars`). `NEXT_RUNTIME` does not belong in `env.ts`: it is injected by Next per runtime, it has no meaning at config-validation time, and validating it would fail the build in whichever runtime it is absent. So it gets an `eslint-disable-next-line`, matching the precedent already in `src/trpc/react.tsx`, and both it and `SENTRY_AUTH_TOKEN` are added to `globalPassThroughEnv`. Pass-through, not `globalEnv`, because neither should invalidate the Turbo build cache.

## What the default setup does not cover, and what was wired by hand

The wizard's output reports far less than it looks like it does. Three gaps, found by reading the actual error paths:

**1. The whole tRPC API was invisible.** `fetchRequestHandler` catches every error a procedure throws and converts it into a JSON error response. It never rethrows, so Next's `onRequestError` never fires for any of it. `onRequestError` covers server components, middleware, and route handlers that throw, which is why the two cron routes need nothing: they have no `try`/`catch` and propagate normally. But every tRPC procedure error reached only `console.error`.

Fixed in the `onError` hook that already existed in `app/api/trpc/[trpc]/route.ts`. One hook covers the entire API surface, because every procedure error funnels through it. Two details matter:

- **Only `INTERNAL_SERVER_ERROR` is reported.** `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, and `BAD_REQUEST` are normal application behavior, not defects. Reporting them would turn every failed sign-in and every rejected form into a Sentry issue and burn the quota on noise.
- **`error.cause ?? error` is captured**, not the `TRPCError` wrapper. tRPC wraps the original throw, and grouping on the wrapper collapses unrelated failures into one issue. The procedure path and type go on as tags, and the caller's user id plus `academyId` go on the event, so an error names **which academy** hit it. With a handful of pilot gyms that is the difference between "something broke" and "Alma's owner broke".

**2. Sign-in failed silently.** Both magic-link server actions in `_components/sign-in-actions.ts` ended in a bare `catch {}` that discarded the error and returned `{ status: "error" }`. If sending breaks (a bad Resend key, a provider outage), the user sees a generic failure and we learn nothing, on the one path where losing a person is total. Both now capture before returning the same state.

Note that `Sentry.withServerActionInstrumentation` would **not** have fixed this. It only sees errors that throw out of the action, and these were caught inside it. Capturing in the `catch` is the fix.

**3. React render errors below the root layout reached nothing.** An error boundary intercepts the error before any global handler sees it, and the app had no `error.tsx` at all, only the wizard's `global-error.tsx` (which fires only for a crash in the root layout itself). A single root `app/error.tsx` now captures and offers "Try again" plus the `digest` as a reference the owner can quote. One file covers every route segment below it, which is the whole app.

**Deliberately left alone:** `notify.ts`, `payments.ts:482`, and `referral.ts:221` swallow errors on purpose, and that design is right (a failed push must never fail the mutation). They live in `packages/api`, which the Expo app also consumes, so importing `@sentry/nextjs` there would break the mobile build. Reporting them needs a reporter injected through the tRPC context, which is a bigger change than a pilot justifies. Their `console.error` lines still reach the Vercel logs.

## Consequences

- **The auth token is a real secret and it is on disk.** The wizard wrote `apps/nextjs/.env.sentry-build-plugin` holding a `sntrys_` org token. It is covered by the existing `.env*` rule in `.gitignore`, verified with `git check-ignore`. For deploys the same value has to be set as `SENTRY_AUTH_TOKEN` in the Vercel project. If it is missing there, the build still succeeds and source maps silently do not upload.
- **`automaticVercelMonitors: true` is a no-op today.** ADR [46](46-no-scheduler-in-v1.md) removed the crons from `vercel.json`. The option costs nothing and starts working if a schedule is ever attached.
- **Session Replay is on** at 10% of sessions and 100% of sessions with an error. It adds weight to the client bundle on every page. Drop `replayIntegration()` from `instrumentation-client.ts` if that matters more than seeing what the owner clicked.
- **Mobile is not covered.** The Expo app reports nothing. `@sentry/react-native` is a separate wizard run and needs a dev-client rebuild, which this environment cannot do.
- **Roadmap 5.2 is now half done.** Rate limiting the public drop-in endpoint is still open, and ADR [58](58-input-validation-and-sanitization.md) still points at Phase 5 for it.

## Verification

`pnpm lint` 15/15 and `pnpm typecheck` 17/17 green, and `next build` completes, both before and after the hand-wiring above. `next build` completes and runs the source-map upload hook (`runAfterProductionCompile`, 11.1s). The config load was checked directly with a real env before and after the fix: `ERR_AMBIGUOUS_MODULE_SYNTAX` before, loads with `transpilePackages` intact after. **Delivery confirmed end to end.** `system.health` was temporarily made to throw and `/api/sentry-test` added as a throwing route; both events arrived in the Sentry dashboard (`SENTRY_VERIFY_TRPC_…` on `GET /api/trpc/[trpc]`, `SENTRY_VERIFY_ROUTE_…` on `GET /api/sentry-test`), which proves the `onError` hook reports and that the `INTERNAL_SERVER_ERROR` filter passes a real internal error through. Both temporary changes were reverted.

Two things that test did **not** cover. The trigger was unauthenticated, so `ctx.session` was null and the **user / `academyId` enrichment branch never ran**: the tag that names which academy hit an error is unproven until a signed-in user hits a real 500. And it ran in dev, where the process stays alive; **serverless freezes after the response**, so if events go missing in production but work locally, flushing is the first thing to check.

Note that a `captureException` event is **handled**, so tRPC errors never carry Sentry's `Unhandled` flag (the route-handler throw does). An alert rule built on `error.unhandled:true` would skip the entire API. Filter on the `trpcPath` tag instead.
