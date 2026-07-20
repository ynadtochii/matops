/**
 * Dev seed (slice 0.2). Proves the DB pipeline: writes a `_health` row and reads
 * it back. Run with `pnpm -F @matops/db seed` (needs POSTGRES_URL in ../../.env).
 *
 * As the domain grows, seed the base fixtures a developer needs to click through
 * the app here (an academy, an owner, a few classes). Keep it idempotent-ish and
 * safe to re-run against a dev database only — never production.
 */
import { db, pool } from "./client";
import { Health } from "./schema";

async function seed() {
  await db.insert(Health).values({ note: "seed ok" });
  const rows = await db.select().from(Health);
  console.log(`[seed] _health rows: ${rows.length}`);
}

seed()
  .then(() => pool.end())
  .catch((err: unknown) => {
    console.error("[seed] failed:", err);
    void pool.end();
    process.exit(1);
  });
