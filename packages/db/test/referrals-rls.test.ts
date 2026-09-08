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

describe("RLS — referral attribution and audit", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await seedMemberships(pg, "academy_A", [
      "student_A",
      "referrer_A",
      "student_1",
      "referrer_1",
      "referrer_2",
      "referrer_old",
      "referrer_new",
      "same",
    ]);
    await seedMemberships(pg, "academy_B", [
      "student_B",
      "referrer_B",
      "sneak",
    ]);
    await pg.exec(`
      INSERT INTO member_referral
        (academy_id, student_member_id, referrer_member_id, assigned_by)
      VALUES
        ('academy_A', 'student_A', 'referrer_A', 'owner_A'),
        ('academy_B', 'student_B', 'referrer_B', 'owner_B');
      INSERT INTO member_referral_audit
        (academy_id, student_member_id, new_referrer_member_id, action, actor_id)
      VALUES
        ('academy_A', 'student_A', 'referrer_A', 'assigned', 'owner_A'),
        ('academy_B', 'student_B', 'referrer_B', 'assigned', 'owner_B');
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("shows only the active academy's current rows and audit rows", async () => {
    const counts = await asTenant(pg, "academy_A", async (tx) => ({
      current: single(
        await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM member_referral",
        ),
      ).n,
      audit: single(
        await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM member_referral_audit",
        ),
      ).n,
    }));
    expect(counts).toEqual({ current: 1, audit: 1 });
  });

  it("rejects writes for another academy", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(`
          INSERT INTO member_referral
            (academy_id, student_member_id, referrer_member_id, assigned_by)
          VALUES ('academy_B', 'sneak', 'referrer_B', 'owner_A')
        `),
      ),
    ).rejects.toThrow();
  });

  it("fails closed without an academy GUC", async () => {
    const count = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return single(
        await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM member_referral",
        ),
      ).n;
    });
    expect(count).toBe(0);
  });
});

describe("member_referral database invariants", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await seedMemberships(pg, "academy_A", [
      "student_A",
      "referrer_A",
      "student_1",
      "referrer_1",
      "referrer_2",
      "referrer_old",
      "referrer_new",
      "same",
    ]);
    await seedMemberships(pg, "academy_B", [
      "student_B",
      "referrer_B",
      "sneak",
    ]);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("allows at most one current row per academy/student", async () => {
    const insert = (referrer: string) =>
      pg.query(
        `INSERT INTO member_referral
          (academy_id, student_member_id, referrer_member_id, assigned_by)
         VALUES ('academy_A', 'student_1', $1, 'owner_A')`,
        [referrer],
      );
    await insert("referrer_1");
    await expect(insert("referrer_2")).rejects.toThrow();
  });

  it("rejects self-referral in current and audit rows", async () => {
    await expect(
      pg.query(`
        INSERT INTO member_referral
          (academy_id, student_member_id, referrer_member_id, assigned_by)
        VALUES ('academy_A', 'same', 'same', 'owner_A')
      `),
    ).rejects.toThrow();
    await expect(
      pg.query(`
        INSERT INTO member_referral_audit
          (academy_id, student_member_id, new_referrer_member_id, action, actor_id)
        VALUES ('academy_A', 'same', 'same', 'assigned', 'owner_A')
      `),
    ).rejects.toThrow();
  });
});
