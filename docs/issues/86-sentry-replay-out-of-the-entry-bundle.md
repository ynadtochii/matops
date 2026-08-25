# 86 — Session Replay shipped on every route, including the static one

**Status:** accepted · **Date:** 2026-08-24 · **Area:** `apps/nextjs`. One file, no migration, no dependency, nothing a member can see.

## Context

ADR [85](85-frontend-performance-baseline.md) measured the client bundle and
found that 1419 kB of the dashboard's 1555 kB first load is 16 chunks shared by
all 18 routes, and that the largest of those chunks, at 536 kB, is Sentry.

The cause was one line in `apps/nextjs/src/instrumentation-client.ts`:

```ts
integrations: [Sentry.replayIntegration()],
```

A static import, so rrweb was linked into the entry bundle for every route,
including `/privacy`, which is prerendered prose, and `/_not-found`.

The rest of the config already says Replay is not meant to run all the time:
`replaysSessionSampleRate` is 0 and `replaysOnErrorSampleRate` is 1.0. Replay
only ever records around an error. It was being downloaded by everyone anyway.

## Decision

Load Replay through a dynamic import after `Sentry.init`, using the pattern
Sentry documents for exactly this:

```ts
integrations: [],
...
void import("@sentry/nextjs").then((lazy) => {
  Sentry.addIntegration(lazy.replayIntegration());
});
```

Measured across three builds:

| Build | shared floor | dashboard raw | dashboard gzip |
|---|---:|---:|---:|
| before | 1419 kB | 1555 kB | 448 kB |
| Replay deleted entirely | 1296 kB | 1432 kB | 409 kB |
| **shipped: Replay lazy** | **1316 kB** | **1452 kB** | **417 kB** |

Lazy loading recovers 103 of the 123 kB and keeps the feature. Deleting Replay
outright would win 20 kB more and was rejected: on-error replay is the main
tool for debugging a report from an academy owner, and 20 kB does not buy that
back.

**What the change costs.** Replay's buffer starts when the dynamic import
resolves rather than at `init`. An error thrown in the first few milliseconds of
a page load would have no replay. That window is far shorter than the time it
takes a person to do anything, and the alternative was paying 123 kB on every
route forever.

## Why this and not the tree-shaking flags

`next.config.js` already passes `webpack: { treeshake: { removeDebugLogging: true } }`
to `withSentryConfig`. Sentry's tree-shaking options are webpack only, and Next 16
builds with Turbopack, so that block does nothing today. It is left in place
because it becomes correct again if the build ever moves back to webpack, but it
must not be read as proof that anything is being stripped.

The same applies to tracing. `tracesSampleRate` is 0, and the tracing code still
ships, for the same reason. Removing it needs either a webpack build or
Turbopack support for these options, and neither is worth doing for a number
ADR 85 showed is not on the critical path.

## Consequences

- Do not move `replayIntegration()` back into `integrations[]`. It looks tidier
  and costs 123 kB on all 18 routes.
- The rest of the plan's wave 1 (dynamic imports on the poster and QR
  components, `preload: false` on `Geist_Mono`, React Compiler) is now ranked
  below this and is opportunistic. Per ADR 85, LCP is data-bound, so bundle work
  is worth doing when it is free and not worth spending the arc on.
- zod, the second largest shared chunk at 292 kB, is left alone. `pnpm why zod`
  traces it to `better-auth`, which depends on it directly and loads on every
  route for the session. Only five client components import zod or
  `@matops/validators` themselves. This is not a matops import to delete and it
  needs its own investigation before anyone touches it.
