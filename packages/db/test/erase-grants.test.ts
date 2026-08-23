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

const remaining = (pg: PGlite, table: string, academyId: string) =>
  asTenant(pg, academyId, (tx) =>
    tx
      .query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}"`)
      .then((r) => single(r).n),
  );

describe("the app role can delete the rows a permanent erase must clear", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await pg.exec(`
      INSERT INTO notification (academy_id, user_id, kind, title, body, link)
      VALUES
        ('academy_A', 'user_gone', 'announcement', 'A news', 'body', '/'),
        ('academy_B', 'user_gone', 'announcement', 'B news', 'body', '/');
      INSERT INTO member_referral_audit
        (academy_id, student_member_id, old_referrer_member_id, new_referrer_member_id, action, actor_id)
      VALUES
        ('academy_A', 'mem_gone', NULL, 'mem_ref', 'assigned', 'owner_A'),
        ('academy_B', 'mem_other', NULL, 'mem_ref', 'assigned', 'owner_B');
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("deletes a notification", async () => {
    await asTenant(pg, "academy_A", (tx) =>
      tx.query(`DELETE FROM notification WHERE user_id = 'user_gone'`),
    );
    expect(await remaining(pg, "notification", "academy_A")).toBe(0);
  });

  it("deletes a referral audit row", async () => {
    await asTenant(pg, "academy_A", (tx) =>
      tx.query(
        `DELETE FROM member_referral_audit WHERE student_member_id = 'mem_gone'`,
      ),
    );
    expect(await remaining(pg, "member_referral_audit", "academy_A")).toBe(0);
  });

  it("a delete still cannot cross the tenant boundary", async () => {
    expect(await remaining(pg, "notification", "academy_B")).toBe(1);
    expect(await remaining(pg, "member_referral_audit", "academy_B")).toBe(1);
  });
});
