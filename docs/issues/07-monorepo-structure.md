# 07 — Monorepo structure & shared packages

Type: grilling
Status: resolved
Blocked by: 01

## Question

How is the TS monorepo laid out, and **exactly what is shared** between the owner web app and the student mobile app?

Decide:
- **Tooling** — Turborepo + pnpm workspaces (default recommendation) vs Nx vs bare pnpm workspaces.
- **App boundaries** — `apps/web` (Next.js, owner), `apps/mobile` (Expo, student), and which shared `packages/*` exist.
- **What goes in shared packages** — the crux: `packages/api-client` (shape decided by [01](01-api-contract-and-runtime.md)), `packages/domain` (pure business logic — the re-derived booking-policy engine, framework-free), `packages/types`/schema, shared config (eslint/tsconfig). What must NOT be shared (RN vs web UI, platform code).
- **Can the pure domain layer be genuinely platform-agnostic** so both clients and the server import the same policy functions?

Depends on the API contract ([01](01-api-contract-and-runtime.md)) because that dictates the api-client package's generation.

Output: the workspace tree, the shared-package inventory with responsibilities, and the dependency direction rules.

## Answer

**Turborepo + pnpm, create-t3-turbo layout.**

```
apps/
  nextjs/        # owner web (Next.js App Router) + tRPC API route handler
  expo/          # student mobile (Expo)
packages/
  api/           # tRPC routers + procedures (the contract; both apps import its type)
  db/            # Drizzle schema (per-domain files) + scopedDb client
  auth/          # Better Auth config (server) + client helpers
  validators/    # Zod schemas shared by api + clients
  domain/        # pure, framework-free business logic (re-derived booking-policy engine)
  ui/            # shared design tokens (+ any genuinely shareable primitives)
tooling/
  eslint/  tsconfig/  tailwind/   # shared config presets
```

- **Shared via types, no codegen:** tRPC means the Expo and Next apps import `AppRouter`'s type from `packages/api` directly — no generated `api-client` package to maintain.
- **Dependency direction:** `apps/*` depend on `packages/*`; packages never depend on apps; `db`/`validators`/`domain` are leaf-ish and platform-agnostic. `domain` must stay free of React/Next/Expo imports so server + both clients can use the same policy functions.
- **Not shared:** rendered UI components (DOM vs RN primitives) — only tokens/headless logic cross the boundary (see [11](11-design-system.md)).
