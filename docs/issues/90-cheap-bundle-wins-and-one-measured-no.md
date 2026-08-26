# 90 — The cheap bundle wins, and React Compiler measured as a no

**Status:** accepted · **Date:** 2026-08-24 · **Area:** `apps/nextjs`. No migration, no dependency added, no procedure changed. Five files and one new two-line module.

## Context

Wave 1 of the [frontend performance plan](../frontend-performance-plan.md) listed
five bundle changes. ADR [86](86-sentry-replay-out-of-the-entry-bundle.md) shipped
item 1, the Sentry Session Replay move, which was worth more than the other four
put together. This note closes the remaining four.

The reason they sat unshipped is ADR
[85](85-frontend-performance-baseline.md)'s finding: LCP lands about 50 ms after
the last query resolves, so the page waits on data, not on code. Bundle work is
worth doing when it is nearly free. It is not worth doing when it costs
something.

## Decision

### Item 3, lazy poster and QR: shipped, and smaller than the plan guessed

Three heavy leaves were reachable from a static import chain on routes that
mostly do not use them.

- `poster-draw.ts` is 370 lines of canvas drawing behind a dialog. It is now
  loaded by an `import()` inside `SchedulePoster`'s `render()`, which already
  only ran when the dialog opened. The two page dimensions it exported moved to
  a new `poster-size.ts`, so the wrapper can size its preview without pulling
  the engine in. `poster-draw.ts` re-exports them, so nothing else changed.
- `qrcode.react` is behind a "Show QR" dialog in `invite-link-card.tsx`, so
  `QrPoster` there is a plain `next/dynamic` with no fallback.
- The same component renders inline in `venue-checkin.tsx`, so that one gets a
  `loading` placeholder the size of the poster it replaces.

Measured, First Load JS gzip:

| Route | before | after |
|---|---:|---:|
| `/coaches` | 425 kB | **420 kB** |
| `/members` | 430 kB | **426 kB** |
| `/schedule` | 431 kB | **428 kB** |

About 12 kB across three routes. The plan called it "tens of kB on two routes";
it is single-digit kB on three. Four other routes moved by 1 kB in either
direction, which is the chunk graph reshuffling, not a real change.

### Item 4, `preload: false` on `Geist_Mono`: shipped

One argument in `app/layout.tsx`. It changes no bytes, only ordering: the mono
face is no longer in a `<link rel="preload">` competing with the JavaScript
bundle on a cold load. `next/font` defaults to `font-display: swap`, so text in
that face paints in the fallback and swaps.

**Worth knowing before anyone reverts it.** The mono face carries the dashboard's
queue counts at `text-4xl`, which are plausibly the LCP element. The swap is
therefore visible. It was shipped anyway because those counts do not exist until
their query lands, which ADR 85 timed at about 700 ms, by which point a
same-origin font has long arrived. If an LCP measurement ever shows otherwise,
this is one argument to put back.

### Item 5, React Compiler: **measured, and rejected**

The plan's open decision was whether it shipped in this wave or its own. It
ships in neither. Built both ways on the same tree:

| | build | `/` | `/schedule` | `/members` | `/payments` |
|---|---:|---:|---:|---:|---:|
| off | 8.6 s | 426 kB | 428 kB | 426 kB | 421 kB |
| on | 13.9 s | 440 kB | 444 kB | 440 kB | 436 kB |

The compiler's emitted memoization costs **10 to 16 kB gzip on every one of the
18 routes** and 60% more build time. Item 3 above won 12 kB in total, across
three routes. React Compiler gives all of it back three times over, everywhere.

What it buys in return is fewer re-renders during interaction, which is an INP
number, not an LCP one. This app's measured bottleneck is the wait for Neon. No
screen here has a render-cost complaint attached to it, and INP cannot be
measured from this environment at all. So the cost is known and the benefit is
not.

`babel-plugin-react-compiler` was installed to run the test and removed
afterwards; `package.json` and the lockfile are unchanged.

### Item 2, zod: still an investigation

Unchanged from ADR 86. 292 kB on every route, traced by `pnpm why zod` to
`better-auth`, which loads on every route for the session. Only five client
components import zod or `@matops/validators` themselves, so there is no matops
import to delete. It needs a real look, not a guess.

## Consequences

- **A heavy leaf behind a dialog should be an `import()` inside the handler that
  needs it, not a `next/dynamic` wrapper**, when the trigger itself is cheap.
  `SchedulePoster` keeps rendering its button instantly this way.
- `poster-size.ts` exists so the poster wrapper and the poster engine can share
  two numbers without sharing a chunk. Do not move `POSTER_W` / `POSTER_H` back
  into `poster-draw.ts`.
- **Do not re-open React Compiler on general principle.** Re-open it if an INP
  measurement on a real screen justifies 14 kB a route.
- This closes wave 1. Nothing is left in the arc's bundle column except zod.

## Verification

`pnpm -F @matops/nextjs typecheck` and `lint` clean, `next build` green in 8.4 s,
and `/members`, `/coaches` and `/schedule` all render 200 against the live
database with no runtime error in the HTML. Bundle numbers above are from
`.next/diagnostics/route-bundle-stats.json`, gzipping each listed chunk.

The dialogs themselves were not clicked, because browser automation was
unavailable (`Tab not found` on every attempt). The dynamic chunks are therefore
proven to leave the first load and not proven to arrive on open. Both are a plain
`import()` of a module in the same app, which is the pattern Next documents, but
that is the gap.
