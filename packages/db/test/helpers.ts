import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");

/**
 * Boot an ephemeral in-memory Postgres (PGlite) and apply every migration in
 * order — the SAME SQL that drizzle-kit applies to Neon. This makes the RLS
 * policies (docs/issues/12) testable with zero external services, so the leak
 * test runs anywhere, including CI.
 */
export async function freshDb(): Promise<PGlite> {
  const pg = new PGlite();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const raw = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    // Breakpoints are drizzle's per-statement markers; PGlite runs the whole file.
    await pg.exec(raw.replaceAll("--> statement-breakpoint", ""));
  }
  return pg;
}

/** Read the single row a query is expected to return (guarded for noUncheckedIndexedAccess). */
export function single<T>(res: { rows: T[] }): T {
  const [row] = res.rows;
  if (row === undefined) throw new Error("expected at least one row");
  return row;
}
