import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import type { DbExec } from "../src/client";
import * as schema from "../src/schema";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");

/**
 * Boot an ephemeral in-memory Postgres (PGlite) and apply every migration in
 * order — the SAME SQL that drizzle-kit applies to Neon. This makes the RLS
 * policies (docs/issues/12) testable with zero external services, so the leak
 * test runs anywhere, including CI.
 */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function cachePath(): string {
  const hash = createHash("sha256");
  for (const file of migrationFiles()) {
    hash.update(file);
    hash.update(readFileSync(path.join(MIGRATIONS_DIR, file)));
  }
  const dir = path.join(tmpdir(), "matops-pglite");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${hash.digest("hex").slice(0, 16)}.tar.gz`);
}

async function migratedDb(): Promise<PGlite> {
  const cache = cachePath();
  if (existsSync(cache)) {
    return new PGlite({ loadDataDir: new Blob([readFileSync(cache)]) });
  }

  const pg = new PGlite();
  for (const file of migrationFiles()) {
    const raw = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    // Breakpoints are drizzle's per-statement markers; PGlite runs the whole file.
    await pg.exec(raw.replaceAll("--> statement-breakpoint", ""));
  }

  const dump = await pg.dumpDataDir("gzip");
  const temp = `${cache}.${process.pid}.tmp`;
  writeFileSync(temp, Buffer.from(await dump.arrayBuffer()));
  renameSync(temp, cache);
  return pg;
}

export async function freshDb(
  academies: readonly string[] = DEFAULT_ACADEMIES,
): Promise<PGlite> {
  const pg = await migratedDb();
  await seedEntities(pg, academies);
  return pg;
}

const DEFAULT_ACADEMIES = ["academy_A", "academy_B"] as const;

export async function seedEntities(
  pg: PGlite,
  ids: readonly string[],
): Promise<void> {
  for (const id of ids) {
    await pg.query(
      `INSERT INTO "organization" (id, name, slug, created_at)
         VALUES ($1, $1, $1, now())
         ON CONFLICT (id) DO NOTHING`,
      [id],
    );
    await pg.query(
      `INSERT INTO "entity" (id, organization_id, type, name, slug, is_default, public_code)
         VALUES ($1, $1, 'bjj_academy', $1, $1, true, substr(md5($1), 1, 6))
         ON CONFLICT (id) DO NOTHING`,
      [id],
    );
    await pg.query(
      `INSERT INTO "academy_profile" (entity_id) VALUES ($1)
         ON CONFLICT (entity_id) DO NOTHING`,
      [id],
    );
  }
}

export async function seedMemberships(
  pg: PGlite,
  entityId: string,
  memberIds: readonly string[],
  status = "active",
): Promise<void> {
  for (const id of memberIds) {
    const userId = `u_${entityId}_${id}`;
    await pg.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, $1, $1 || '@test.local', true, now(), now())
         ON CONFLICT (id) DO NOTHING`,
      [userId],
    );
    await pg.query(
      `INSERT INTO "entity_membership"
         (id, organization_id, entity_id, user_id, role, status, joined_at)
       SELECT $1, e.organization_id, e.id, $3, 'student', $4, now()
         FROM "entity" e WHERE e.id = $2
       ON CONFLICT (id) DO NOTHING`,
      [id, entityId, userId, status],
    );
  }
}

export function execOn(pg: PGlite): DbExec {
  return drizzle(pg, {
    schema,
    casing: "snake_case",
  }) as unknown as DbExec;
}

/** Read the single row a query is expected to return (guarded for noUncheckedIndexedAccess). */
export function single<T>(res: { rows: T[] }): T {
  const [row] = res.rows;
  if (row === undefined) throw new Error("expected at least one row");
  return row;
}
