# 03 — Postgres access layer (ORM / query builder)

Type: grilling
Status: resolved
Blocked by: —

## Question

What sits between the backend and Postgres — **Drizzle**, **Prisma**, or **Kysely** (or raw `pg`)?

Weigh against this effort's constraints:
- **Portability** — standard SQL, no proprietary engine; easy to run the same schema on Supabase / Neon / RDS / self-hosted.
- **Expandability** — migrations story, schema-as-code, ergonomics as new domains (billing, curriculum) get added later.
- **Type safety** — end-to-end inferred types feeding the shared packages.
- **Multi-tenant ergonomics** — how cleanly it expresses the academyId-scoped access seam decided in [05](05-multitenancy-model.md) (this ticket only picks the tool; the seam pattern is 05's call).
- **Agentic familiarity (session-4 criterion)** — how much training data agents have on it. **Prisma** has the most and the best solo-dev DX (schema DSL, migrations, Studio) and is a create-t3-turbo option; **Drizzle** is lighter/SQL-first, also well-known and the modern T3 default. Both are portable Postgres. This criterion tilts the earlier Drizzle lean back toward a genuine **Prisma vs Drizzle** call — decide here.

Output: the chosen tool + migration approach, with a one-paragraph rationale (name the agentic-familiarity tradeoff explicitly).

## Answer

**Drizzle** (with `drizzle-kit` migrations, Neon Postgres driver).

Chosen over Prisma on four context-specific wins — it was a close call, and Prisma leads on pure DB DX (Studio + managed migrations + least-friction declarative schema):
1. **create-t3-turbo default** → consistent with the adopted pattern ([01](01-api-contract-and-runtime.md)) and what current agents scaffold for this stack (serves the agentic-first criterion).
2. **Lightest on Vercel serverless** (no engine binary, no runtime codegen, best cold starts; first-class Neon serverless driver) — where the tRPC-in-Next API runs. Feeds the flawless-UX goal.
3. **Cleanest tenant seam** — an explicit `scopedDb(academyId)` wrapper that always injects the `where academyId = …` filter, transparent and auditable → passes the "deletion test" and re-derives the old app's structural-tenancy value. Feeds [05](05-multitenancy-model.md).
4. **Purest portability** — typed SQL over standard Postgres, no proprietary engine → aligns with minimal-vendor-lock.

**Schema organization:** per-domain TS schema files (`packages/db/schema/*`) mirroring the domain-partitioning lesson from the old app, re-exported into one schema. **Migrations:** `drizzle-kit generate` for versioned SQL in prod; `push` acceptable in local dev.

**Flip criterion (documented):** revisit Prisma only if "never touch SQL / want Prisma Studio" ever outweighs the serverless + tenant-seam + on-pattern wins.
