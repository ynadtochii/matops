import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

/** Mirrors withScope (packages/db/src/tenant.ts): restricted role + entity GUC. */
function asTenant<T>(
  pg: PGlite,
  academyId: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE matops_app");
    await tx.query("SELECT set_config('app.academy_id', $1, true)", [
      academyId,
    ]);
    return run(tx);
  });
}

const COLS =
  "(academy_id, instructor_id, title, days_of_week, starts_at_minutes, duration_minutes, time_zone, capacity)";
const vals = (academyId: string, title: string) =>
  `('${academyId}', 'user_1', '${title}', '{1,3}', 1080, 60, 'Europe/Kyiv', 20)`;

function count(tx: Tx, where = ""): Promise<number> {
  return tx
    .query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "class_template" ${where}`,
    )
    .then((res) => single(res).n);
}

/**
 * The scheduling tables are tenant-scoped exactly like tenant_probe (migration
 * 0006). This asserts the class_template policy denies cross-academy reads and
 * writes and fails closed — the permanent regression net for slice 2.1's RLS.
 */
describe("RLS — class_template isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    // Seed as the bootstrap superuser (RLS bypassed for setup): two academies.
    await pg.exec(
      `INSERT INTO "class_template" ${COLS} VALUES ${vals("academy_A", "Morning BJJ")}, ${vals("academy_A", "Evening No-Gi")}, ${vals("academy_B", "Judo")};`,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  it("a tenant sees only its own academy's templates", async () => {
    expect(await asTenant(pg, "academy_A", (tx) => count(tx))).toBe(2);
    expect(await asTenant(pg, "academy_B", (tx) => count(tx))).toBe(1);
  });

  it("cannot see another academy's templates even with an explicit filter", async () => {
    const n = await asTenant(pg, "academy_A", (tx) =>
      count(tx, "WHERE academy_id = 'academy_B'"),
    );
    expect(n).toBe(0);
  });

  it("cannot INSERT a template for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "class_template" ${COLS} VALUES ${vals("academy_B", "evil")}`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("fails closed when app.academy_id is unset", async () => {
    const n = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return count(tx);
    });
    expect(n).toBe(0);
  });
});

const classCount = (tx: Tx, where = ""): Promise<number> =>
  tx
    .query<{ n: number }>(`SELECT count(*)::int AS n FROM "class" ${where}`)
    .then((res) => single(res).n);

/** The concrete `class` table (slice 2.2) is tenant-scoped the same way. */
describe("RLS — class isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await pg.exec(
      `INSERT INTO "class" (academy_id, instructor_id, title, starts_at, duration_minutes, capacity) VALUES
        ('academy_A', 'user_1', 'A morning', now(), 60, 20),
        ('academy_A', 'user_1', 'A evening', now(), 60, 20),
        ('academy_B', 'user_1', 'B class', now(), 60, 20);`,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  it("a tenant sees only its own academy's classes", async () => {
    expect(await asTenant(pg, "academy_A", (tx) => classCount(tx))).toBe(2);
    expect(await asTenant(pg, "academy_B", (tx) => classCount(tx))).toBe(1);
  });

  it("cannot INSERT a class for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "class" (academy_id, instructor_id, title, starts_at, duration_minutes, capacity)
             VALUES ('academy_B', 'user_1', 'evil', now(), 60, 20)`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("fails closed when app.academy_id is unset", async () => {
    const n = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return classCount(tx);
    });
    expect(n).toBe(0);
  });
});
