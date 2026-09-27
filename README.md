# matops

Admin SaaS for grappling gyms. It has a **Next.js** web app for owners, instructors and students, and an **Expo** student mobile app, in one TypeScript monorepo.

Scaffolded from [`create-t3-turbo`](https://github.com/t3-oss/create-t3-turbo).

## Stack

Turborepo · pnpm · tRPC v11 · Better Auth (Organization + magic-link) · Drizzle + Postgres (Neon) · Next.js (Vercel) · Expo (EAS) · Tailwind · TanStack Query.

## Layout

```
apps/
  nextjs          web app (owner, instructor, student) and the hosted tRPC API
  expo            student mobile app
packages/
  api             tRPC routers + procedure tiers
  auth            Better Auth setup
  db              Drizzle schema, migrations, seeds (Neon, pg driver)
  domain          pure business rules (framework-free, unit-tested)
  notifications   push and email transport (Expo Push, Resend)
  validators      shared zod schemas
  ui              shared UI primitives
tooling/          eslint · prettier · typescript
docs/             spec, architecture, roadmap, delivery rulebook, decisions (ADRs)
```

## How the first release works

- A gym runs **one BJJ academy**. The owner creates it at `/start` with a name and a time zone.
- Students join through an invite link (`/join/<token>`) and wait for approval. An owner, manager or instructor approves them.
- An approved, active student books and cancels classes up to 7 days ahead. No plan or payment is needed.
- Staff run the schedule (recurring templates, one-off classes, calendar extension, safe rebuild) and take attendance.
- Visitors use the wall QR form at `/checkin/<id>`. It records them as a lead and marks them present or books a coming class.
- Changing or cancelling a booked class sends one email batch and a push. There is no retry screen.
- The payment code is kept but switched off. No screen turns it on.

There is no public booking page, no public API and no scheduled job. Details: `docs/first-release-plan.md` and ADR 142.

## Getting started

```bash
cp .env.example .env    # then fill in the values (DB_ENV=dev is required)
pnpm install
pnpm dev:next           # web on http://localhost:3004 (pnpm dev runs everything)
pnpm -F @matops/db seed pilot <your-email>   # demo academy, after signing in once
```

## Common commands

| Command                        | Does                                      |
| ------------------------------ | ----------------------------------------- |
| `pnpm typecheck` / `pnpm lint` | check types / lint                        |
| `pnpm test`                    | run every package's tests (PGlite, no DB) |
| `pnpm -F @matops/db migrate`   | apply migrations to the dev database      |
| `pnpm db:studio`               | open Drizzle studio                       |
| `pnpm auth:generate`           | regenerate the Better Auth schema         |

## Where to start reading

- `CLAUDE.md`: the short project guide loaded into every agent session.
- `docs/spec.md` / `docs/architecture.md`: product and system design of record.
- `docs/roadmap.md`: the status matrix.
- `docs/delivery.md`: how we build and keep the docs true.
