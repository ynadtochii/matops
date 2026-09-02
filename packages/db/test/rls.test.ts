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

/**
 * Two mats under ONE owner. `entity` and `entity_membership` are shared across
 * the organization so the overview can enumerate them, and this is the test
 * that the product rows are not: a request scoped to one mat must not see the
 * other's, even though nothing separates them at the organization level.
 */
describe("RLS between two entities of one organization", () => {
  let pg: PGlite;
  const ORG = "org_two_mats";
  const MAT_A = "org_two_mats";
  const MAT_B = "entity_two_mats_b";

  beforeAll(async () => {
    pg = await freshDb([ORG]);
    await pg.exec(`
      INSERT INTO "entity" (id, organization_id, type, name, slug, public_code)
        VALUES ('${MAT_B}', '${ORG}', 'bjj_academy', 'Mat B', 'mat-b', '654321');
      INSERT INTO "academy_profile" (entity_id) VALUES ('${MAT_B}');
      INSERT INTO "tenant_probe" (academy_id, payload) VALUES
        ('${MAT_A}', 'on mat a'), ('${MAT_B}', 'on mat b');
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  const scoped = <T>(entityId: string, run: (tx: Tx) => Promise<T>) =>
    pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      await tx.query(
        "SELECT set_config('app.organization_id', $1, true), set_config('app.academy_id', $2, true)",
        [ORG, entityId],
      );
      return run(tx);
    });

  it("shows one mat its own rows and not its sibling's", async () => {
    const rows = await scoped(MAT_A, (tx) =>
      tx
        .query<{ payload: string }>(`SELECT payload FROM "tenant_probe"`)
        .then((r) => r.rows.map((x) => x.payload)),
    );
    expect(rows).toEqual(["on mat a"]);
  });

  it("refuses a write aimed at the sibling mat", async () => {
    await expect(
      scoped(MAT_A, (tx) =>
        tx.query(
          `INSERT INTO "tenant_probe" (academy_id, payload) VALUES ('${MAT_B}', 'sneak')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("still lets the organization read both entities", async () => {
    const names = await scoped(MAT_A, (tx) =>
      tx
        .query<{ name: string }>(`SELECT name FROM "entity" ORDER BY name`)
        .then((r) => r.rows.map((x) => x.name)),
    );
    expect(names).toHaveLength(2);
  });
});
