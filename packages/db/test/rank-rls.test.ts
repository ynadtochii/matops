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

const countRanks = (tx: Tx): Promise<number> =>
  tx
    .query<{ n: number }>(`SELECT count(*)::int AS n FROM "member_rank"`)
    .then((r) => single(r).n);

/** Member rank + staff notes tables are tenant-scoped (v1.4, ADR 41). */
describe("RLS — rank + notes tables isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    // Seed as the bootstrap superuser (mimics a trusted base-connection write).
    await pg.exec(
      `INSERT INTO "member_rank" (academy_id, member_id, discipline, belt, stripes, updated_by) VALUES
        ('academy_A', 'member_1', 'bjj', 'Blue', 2, 'staff_A'),
        ('academy_A', 'member_1', 'judo', 'Green', 0, 'staff_A'),
        ('academy_B', 'member_9', 'bjj', 'White', 0, 'staff_B');`,
    );
    await pg.exec(
      `INSERT INTO "member_note" (academy_id, member_id, body, author_id) VALUES
        ('academy_A', 'member_1', 'Recovering knee — no leglocks.', 'staff_A'),
        ('academy_B', 'member_9', 'Ready for a stripe.', 'staff_B');`,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  it("an academy sees only its own ranks", async () => {
    expect(await asTenant(pg, "academy_A", (tx) => countRanks(tx))).toBe(2);
    expect(await asTenant(pg, "academy_B", (tx) => countRanks(tx))).toBe(1);
  });

  it("cannot INSERT a rank for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "member_rank" (academy_id, member_id, discipline, belt, stripes, updated_by)
             VALUES ('academy_B', 'member_9', 'bjj', 'Black', 0, 'staff_A')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("enforces one rank per member+discipline", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "member_rank" (academy_id, member_id, discipline, belt, stripes, updated_by)
             VALUES ('academy_A', 'member_1', 'bjj', 'Purple', 0, 'staff_A')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("a staff note is scoped to its academy", async () => {
    const bSeesNotes = await asTenant(pg, "academy_B", (tx) =>
      tx
        .query<{ n: number }>(`SELECT count(*)::int AS n FROM "member_note"`)
        .then((r) => single(r).n),
    );
    expect(bSeesNotes).toBe(1);
  });

  it("a promotion record is scoped to its academy", async () => {
    await asTenant(pg, "academy_A", (tx) =>
      tx.query(
        `INSERT INTO "rank_promotion"
           (academy_id, member_id, discipline, from_belt, from_stripes, to_belt, to_stripes, promoted_by)
         VALUES ('academy_A', 'member_1', 'bjj', 'White', 4, 'Blue', 0, 'staff_A')`,
      ),
    );
    const bSees = await asTenant(pg, "academy_B", (tx) =>
      tx
        .query<{ n: number }>(`SELECT count(*)::int AS n FROM "rank_promotion"`)
        .then((r) => single(r).n),
    );
    expect(bSees).toBe(0);
  });

  it("fails closed when app.academy_id is unset", async () => {
    const n = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return countRanks(tx);
    });
    expect(n).toBe(0);
  });
});
