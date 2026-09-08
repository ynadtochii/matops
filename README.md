# matops

Multi-academy admin SaaS for grappling gyms. It has a **Next.js** owner and instructor web app and an **Expo** student mobile app in one TypeScript monorepo.

Scaffolded from [`create-t3-turbo`](https://github.com/t3-oss/create-t3-turbo).

## Stack

Turborepo · pnpm · tRPC v11 · Better Auth (Organization + magic-link) · Drizzle + Postgres (Neon) · Next.js (Vercel) · Expo (EAS) · Tailwind / NativeWind · TanStack Query.

##

## Layout

```
apps/
  nextjs        owner/instructor web app and hosted tRPC API
  expo          student mobile app
packages/
  api           tRPC routers + procedure tiers
  auth          Better Auth setup
  db            Drizzle schema + client (Neon, pg driver)
  domain        pure business rules (framework-free, unit-tested)
  validators    shared zod schemas
  ui            shared UI primitives
tooling/         eslint · prettier · tailwind · typescript · github
docs/            spec, architecture, roadmap, delivery rulebook, decisions (ADRs)
```

## First academy operating model

- Staff create adult student records and assign shared membership plans. A login link is optional.
- Students report monthly payment. Owners and managers confirm, correct, or reject each month.
- A rejected month creates a branch coverage hold. Only an owner or manager can resolve it.
- Each branch has a 1-90 day booking window. The default is 7 local calendar days.
- Owners extend the generated calendar or preview and apply a safe schedule rebuild from Templates.
- Visitors book at `/book/<academy-code>`. The page stores a private return token for status and cancellation.
- Class and visitor email creates a saved notice. The request sends a bounded first batch. Staff send remaining recipients or retry failures from Notifications.

MatOps has no scheduled application jobs or external public booking API. It does not need `CRON_SECRET`, public API keys, or allowed-origin settings.

## Getting started

```bash
cp .env.example .env    # then fill in the values
pnpm install
pnpm dev                # everything   (pnpm dev:next for web only)
```

## Common commands

| Command                           | Does                              |
| --------------------------------- | --------------------------------- |
| `pnpm typecheck` / `pnpm lint`    | check types / lint                |
| `pnpm db:push` / `pnpm db:studio` | push schema / open Drizzle studio |
| `pnpm auth:generate`              | regenerate the Better Auth schema |

## Where to start reading

- `docs/roadmap.md` — the live plan and scope matrix (what's built, what's next).
- `docs/delivery.md` — how we build and keep the specs true.
- `docs/spec.md` / `docs/architecture.md` — product + system design of record.
- `CLAUDE.md` — the short project guide loaded into every agent session.
