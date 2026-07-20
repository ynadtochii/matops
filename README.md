# matops

Multi-academy admin SaaS for grappling gyms — a **Next.js** owner/instructor web app and an **Expo** student mobile app in one TypeScript monorepo.

Scaffolded from [`create-t3-turbo`](https://github.com/t3-oss/create-t3-turbo).

## Stack

Turborepo · pnpm · tRPC v11 · Better Auth (Organization + magic-link) · Drizzle + Postgres (Neon) · Next.js (Vercel) · Expo (EAS) · Tailwind / NativeWind · TanStack Query.

## Layout

```
apps/
  nextjs        owner/instructor web app (hosts the tRPC API + cron)
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

## Getting started

```bash
cp .env.example .env    # then fill in the values
pnpm install
pnpm dev                # everything   (pnpm dev:next for web only)
```

## Common commands

| Command | Does |
|---|---|
| `pnpm typecheck` / `pnpm lint` | check types / lint |
| `pnpm db:push` / `pnpm db:studio` | push schema / open Drizzle studio |
| `pnpm auth:generate` | regenerate the Better Auth schema |

## Where to start reading

- `docs/roadmap.md` — the live plan and scope matrix (what's built, what's next).
- `docs/delivery.md` — how we build and keep the specs true.
- `docs/spec.md` / `docs/architecture.md` — product + system design of record.
- `CLAUDE.md` — the short project guide loaded into every agent session.
