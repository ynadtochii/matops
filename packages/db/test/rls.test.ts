import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

// The transaction object PGlite hands to its transaction() callback.
type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

/**
 * Mirrors packages/db/src/tenant.ts `withScope`: drop to the restricted role and
 * set app.academy_id, both transaction-local, then run the caller's queries.
 */
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

function count(tx: Tx, where = ""): Promise<number> {
  return tx
    .query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "tenant_probe" ${where}`,
    )
    .then((res) => single(res).n);
}

describe("RLS tenant isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    // Seed as the bootstrap superuser (RLS is bypassed for setup): two academies.
    await pg.exec(`
      INSERT INTO "tenant_probe" (academy_id, payload) VALUES
        ('academy_A', 'a1'), ('academy_A', 'a2'), ('academy_B', 'b1');
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("a tenant sees only its own academy's rows", async () => {
    expect(await asTenant(pg, "academy_A", (tx) => count(tx))).toBe(2);
    expect(await asTenant(pg, "academy_B", (tx) => count(tx))).toBe(1);
  });

  it("cannot see another academy's rows even with an explicit filter", async () => {
    const n = await asTenant(pg, "academy_A", (tx) =>
      count(tx, "WHERE academy_id = 'academy_B'"),
    );
    expect(n).toBe(0);
  });

  it("cannot INSERT a row for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "tenant_probe" (academy_id, payload) VALUES ('academy_B', 'evil')`,
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

  it("can write and read back a row in its own academy", async () => {
    await asTenant(pg, "academy_A", (tx) =>
      tx.query(
        `INSERT INTO "tenant_probe" (academy_id, payload) VALUES ('academy_A', 'a3')`,
      ),
    );
    expect(await asTenant(pg, "academy_A", (tx) => count(tx))).toBe(3);
  });
});
