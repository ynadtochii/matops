import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

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

const countPlans = (tx: Tx): Promise<number> =>
  tx
    .query<{ n: number }>(`SELECT count(*)::int AS n FROM "membership_plan"`)
    .then((r) => single(r).n);

/** The manual-transfer payment tables are tenant-scoped (slice P.1, ADR 40). */
describe("RLS — payments tables isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    // Seed as the bootstrap superuser (mimics a trusted base-connection write).
    await pg.exec(
      `INSERT INTO "membership_plan" (academy_id, name, price_minor, currency) VALUES
        ('academy_A', 'Adult', 5000, 'USD'),
        ('academy_A', 'Student', 3000, 'USD'),
        ('academy_B', 'Adult', 6000, 'EUR');`,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  it("an academy sees only its own plans", async () => {
    expect(await asTenant(pg, "academy_A", (tx) => countPlans(tx))).toBe(2);
    expect(await asTenant(pg, "academy_B", (tx) => countPlans(tx))).toBe(1);
  });

  it("cannot INSERT a plan for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "membership_plan" (academy_id, name, price_minor, currency)
             VALUES ('academy_B', 'Sneak', 1, 'USD')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("fails closed when app.academy_id is unset", async () => {
    const n = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return countPlans(tx);
    });
    expect(n).toBe(0);
  });

  it("a payment_claim is scoped to its academy", async () => {
    const planId = await asTenant(pg, "academy_A", (tx) =>
      tx
        .query<{ id: string }>(
          `SELECT id FROM "membership_plan" WHERE name='Adult' LIMIT 1`,
        )
        .then((r) => single(r).id),
    );
    await asTenant(pg, "academy_A", (tx) =>
      tx.query(
        `INSERT INTO "payment_claim"
           (academy_id, member_id, plan_id, amount_minor, currency, period)
         VALUES ('academy_A', 'member_1', $1, 5000, 'USD', '2026-07')`,
        [planId],
      ),
    );
    // academy_B cannot see academy_A's claim.
    const bSees = await asTenant(pg, "academy_B", (tx) =>
      tx
        .query<{ n: number }>(`SELECT count(*)::int AS n FROM "payment_claim"`)
        .then((r) => single(r).n),
    );
    expect(bSees).toBe(0);
  });
});

/** One OPEN ("pending") claim per member per period; history rows are free. */
describe("payment_claim — one open claim per period (P.1)", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await pg.exec(
      `INSERT INTO "membership_plan" (id, academy_id, name, price_minor, currency)
         VALUES ('11111111-1111-1111-1111-111111111111', 'academy_A', 'Adult', 5000, 'USD');`,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  const insertClaim = (status: string) =>
    pg.query(
      `INSERT INTO "payment_claim"
         (academy_id, member_id, plan_id, amount_minor, currency, period, status)
       VALUES ('academy_A', 'member_1',
               '11111111-1111-1111-1111-111111111111', 5000, 'USD', '2026-07', $1)`,
      [status],
    );

  it("rejects a second pending claim for the same member+period", async () => {
    await insertClaim("pending");
    await expect(insertClaim("pending")).rejects.toThrow();
  });

  it("allows a confirmed/rejected claim to coexist (partial index)", async () => {
    // A rejected claim for the same period is fine — only 'pending' is unique.
    await expect(insertClaim("rejected")).resolves.toBeDefined();
  });
});
