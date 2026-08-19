import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

const COLS = "(academy_id, first_name, last_name, phone, consent)";
const vals = (academyId: string, phone: string) =>
  `('${academyId}', 'Sam', 'Lee', '${phone}', true)`;

const count = (tx: Tx, where = ""): Promise<number> =>
  tx
    .query<{ n: number }>(`SELECT count(*)::int AS n FROM "drop_in" ${where}`)
    .then((r) => single(r).n);

/** Owner reads of `drop_in` are tenant-scoped (slice 3.5); public writes bypass. */
describe("RLS — drop_in isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    // Seed as the bootstrap superuser (mimics the base-connection public write).
    await pg.exec(
      `INSERT INTO "drop_in" ${COLS} VALUES
        ${vals("academy_A", "111")}, ${vals("academy_A", "222")}, ${vals("academy_B", "333")};`,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  it("an owner sees only their academy's leads", async () => {
    expect(await asTenant(pg, "academy_A", (tx) => count(tx))).toBe(2);
    expect(await asTenant(pg, "academy_B", (tx) => count(tx))).toBe(1);
  });

  it("cannot INSERT a lead for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "drop_in" ${COLS} VALUES ${vals("academy_B", "evil")}`,
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

/** Dedupe by (academy, phone): a repeat visitor bumps visit_count, no new row. */
describe("drop_in dedupe by phone (slice 3.5)", () => {
  let pg: PGlite;

  // The exact upsert createDropIn runs (on the base connection here = superuser).
  async function submit(phone: string, first = "Sam", consent = true) {
    await pg.query(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, consent)
         VALUES ('academy_A', $1, 'Lee', $2, $3)
       ON CONFLICT (academy_id, phone) DO UPDATE SET
         first_name = excluded.first_name,
         consent = "drop_in".consent OR excluded.consent,
         visit_count = "drop_in".visit_count + 1,
         last_visit_at = now()`,
      [first, phone, consent],
    );
  }

  beforeEach(async () => {
    pg = await freshDb();
  });

  afterAll(async () => {
    await pg.close();
  });

  it("a first visit creates one lead with visit_count 1", async () => {
    await submit("5551234");
    const rows = await pg.query<{ visit_count: number }>(
      `SELECT visit_count FROM "drop_in" WHERE phone='5551234'`,
    );
    expect(rows.rows.length).toBe(1);
    expect(single(rows).visit_count).toBe(1);
  });

  it("a repeat phone bumps visit_count instead of adding a row", async () => {
    await submit("5551234", "Sam");
    await submit("5551234", "Samuel"); // same person, refreshed name
    const rows = await pg.query<{ visit_count: number; first_name: string }>(
      `SELECT visit_count, first_name FROM "drop_in" WHERE phone='5551234'`,
    );
    expect(rows.rows.length).toBe(1);
    expect(single(rows).visit_count).toBe(2);
    expect(single(rows).first_name).toBe("Samuel");
  });

  it("a staff-recorded visitor never clears a consent the visitor gave", async () => {
    await submit("5551234", "Sam", true);
    await submit("5551234", "Sam", false); // staff adds them at the mat
    const rows = await pg.query<{ consent: boolean }>(
      `SELECT consent FROM "drop_in" WHERE phone='5551234'`,
    );
    expect(single(rows).consent).toBe(true);
  });

  it("a staff-recorded visitor starts without consent", async () => {
    await submit("5559999", "Alex", false);
    const rows = await pg.query<{ consent: boolean }>(
      `SELECT consent FROM "drop_in" WHERE phone='5559999'`,
    );
    expect(single(rows).consent).toBe(false);
  });
});
