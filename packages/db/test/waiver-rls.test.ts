import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb, seedMemberships, single } from "./helpers";

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

const count = (pg: PGlite, table: string, academyId: string) =>
  asTenant(pg, academyId, (tx) =>
    tx
      .query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}"`)
      .then((r) => single(r).n),
  );

const WAIVER_A = "00000000-0000-4000-8000-00000000000a";
const WAIVER_B = "00000000-0000-4000-8000-00000000000b";

describe("agreement tables (ADR 146)", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await seedMemberships(pg, "academy_A", ["mem_a"]);
    await seedMemberships(pg, "academy_B", ["mem_b"]);
    await pg.exec(`
      INSERT INTO academy_waiver (id, academy_id, body, created_by)
      VALUES
        ('${WAIVER_A}', 'academy_A', 'A text', 'u_owner'),
        ('${WAIVER_B}', 'academy_B', 'B text', 'u_owner');
      INSERT INTO waiver_acceptance (academy_id, member_id, waiver_id)
      VALUES
        ('academy_A', 'mem_a', '${WAIVER_A}'),
        ('academy_B', 'mem_b', '${WAIVER_B}');
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("shows each academy only its own rows", async () => {
    expect(await count(pg, "academy_waiver", "academy_A")).toBe(1);
    expect(await count(pg, "waiver_acceptance", "academy_A")).toBe(1);
  });

  it("refuses an acceptance for another academy's agreement", async () => {
    await expect(
      pg.query(
        `INSERT INTO waiver_acceptance (academy_id, member_id, waiver_id)
         VALUES ('academy_A', 'mem_a', '${WAIVER_B}')`,
      ),
    ).rejects.toThrow();
  });

  it("never lets the app role edit an acceptance or an agreement", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(`UPDATE waiver_acceptance SET accepted_at = now()`),
      ),
    ).rejects.toThrow();
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(`UPDATE academy_waiver SET body = 'changed'`),
      ),
    ).rejects.toThrow();
  });

  it("lets an erase delete an acceptance inside its own academy only", async () => {
    await asTenant(pg, "academy_A", (tx) =>
      tx.query(`DELETE FROM waiver_acceptance`),
    );
    expect(await count(pg, "waiver_acceptance", "academy_A")).toBe(0);
    expect(await count(pg, "waiver_acceptance", "academy_B")).toBe(1);
  });
});
