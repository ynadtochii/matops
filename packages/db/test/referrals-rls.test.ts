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

describe("RLS — referral attribution and audit", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
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

describe("referral reporting state transitions", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
  });

  afterAll(async () => {
    await pg.close();
  });

  it("moves retroactive currency totals on correction and keeps a cleared audit", async () => {
    await pg.exec(`
      INSERT INTO membership_plan
        (id, academy_id, name, price_minor, currency)
      VALUES
        ('11111111-1111-1111-1111-111111111111', 'academy_A', 'USD plan', 5000, 'USD'),
        ('22222222-2222-2222-2222-222222222222', 'academy_A', 'EUR plan', 3000, 'EUR');
      INSERT INTO payment_claim
        (academy_id, member_id, plan_id, amount_minor, currency, period,
         status, confirmed_by, confirmed_at)
      VALUES
        ('academy_A', 'student_1', '11111111-1111-1111-1111-111111111111',
         5000, 'USD', '2026-07', 'confirmed', 'owner', '2026-07-02T12:00:00Z'),
        ('academy_A', 'student_1', '22222222-2222-2222-2222-222222222222',
         3000, 'EUR', '2026-06', 'confirmed', 'owner', '2026-06-02T12:00:00Z');
      INSERT INTO member_referral
        (academy_id, student_member_id, referrer_member_id, assigned_by)
      VALUES ('academy_A', 'student_1', 'referrer_old', 'owner');
      INSERT INTO member_referral_audit
        (academy_id, student_member_id, new_referrer_member_id, action, actor_id)
      VALUES ('academy_A', 'student_1', 'referrer_old', 'assigned', 'owner');
    `);

    const revenue = () =>
      pg.query<{
        referrer: string;
        currency: string;
        amount: number;
      }>(`
        SELECT mr.referrer_member_id AS referrer, pc.currency,
               sum(pc.amount_minor)::int AS amount
        FROM member_referral mr
        JOIN payment_claim pc ON pc.academy_id = mr.academy_id
          AND pc.member_id = mr.student_member_id
        WHERE mr.academy_id = 'academy_A' AND pc.status = 'confirmed'
          AND mr.referrer_member_id IS NOT NULL
        GROUP BY mr.referrer_member_id, pc.currency
        ORDER BY pc.currency
      `);

    expect((await revenue()).rows).toEqual([
      { referrer: "referrer_old", currency: "EUR", amount: 3000 },
      { referrer: "referrer_old", currency: "USD", amount: 5000 },
    ]);

    await pg.transaction(async (tx) => {
      await tx.query(`
        UPDATE member_referral SET referrer_member_id = 'referrer_new'
        WHERE academy_id = 'academy_A' AND student_member_id = 'student_1'
      `);
      await tx.query(`
        INSERT INTO member_referral_audit
          (academy_id, student_member_id, old_referrer_member_id,
           new_referrer_member_id, action, actor_id)
        VALUES
          ('academy_A', 'student_1', 'referrer_old', 'referrer_new',
           'corrected', 'owner')
      `);
    });
    expect((await revenue()).rows).toEqual([
      { referrer: "referrer_new", currency: "EUR", amount: 3000 },
      { referrer: "referrer_new", currency: "USD", amount: 5000 },
    ]);

    await pg.transaction(async (tx) => {
      await tx.query(`
        UPDATE member_referral SET referrer_member_id = NULL
        WHERE academy_id = 'academy_A' AND student_member_id = 'student_1'
      `);
      await tx.query(`
        INSERT INTO member_referral_audit
          (academy_id, student_member_id, old_referrer_member_id,
           new_referrer_member_id, action, actor_id)
        VALUES
          ('academy_A', 'student_1', 'referrer_new', NULL, 'cleared', 'owner')
      `);
    });
    expect((await revenue()).rows).toEqual([]);
    expect(
      single(
        await pg.query<{ referrer: string | null; audits: number }>(`
          SELECT mr.referrer_member_id AS referrer,
            (SELECT count(*)::int FROM member_referral_audit
             WHERE academy_id = 'academy_A' AND student_member_id = 'student_1') AS audits
          FROM member_referral mr
          WHERE mr.academy_id = 'academy_A' AND mr.student_member_id = 'student_1'
        `),
      ),
    ).toEqual({ referrer: null, audits: 3 });
  });
});
