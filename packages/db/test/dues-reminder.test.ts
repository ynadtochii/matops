import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import { claimDueDuesReminders } from "../src/dues-reminder";
import { execOn, freshDb, single } from "./helpers";

const ACAD = "acad_dues_rem";
const PLAN = "11111111-1111-4111-8111-000000000001";

const statuses = ["active", "pending", "suspended", "archived", "removed"];

const seed = async (pg: PGlite) => {
  const users = statuses
    .map(
      (s) => `('u_${s}', 'User ${s}', 'u_${s}@test.local', true, now(), now())`,
    )
    .join(",");
  const members = statuses
    .map((s) => `('mem_${s}', '${ACAD}', 'u_${s}', 'student', '${s}', now())`)
    .join(",");
  const dues = statuses
    .map(
      (s) =>
        `(gen_random_uuid(), '${ACAD}', 'mem_${s}', '${PLAN}', now() + interval '1 day', now(), now())`,
    )
    .join(",");

  await pg.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ${users};
    INSERT INTO "organization" (id, name, slug, public_code, created_at)
      VALUES ('${ACAD}', 'Dues Gym', 'dues-gym', '700086', now());
    INSERT INTO "member" (id, organization_id, user_id, role, status, created_at)
      VALUES ${members};
    INSERT INTO "membership_plan" (id, academy_id, name, price_minor, currency)
      VALUES ('${PLAN}', '${ACAD}', 'Unlimited', 8000, 'EUR');
    INSERT INTO "member_dues" (id, academy_id, member_id, plan_id, next_due_at, created_at, updated_at)
      VALUES ${dues};
  `);
};

describe("dues reminders never chase someone who left (docs/issues/84)", () => {
  let pg: PGlite;

  beforeEach(async () => {
    pg = await freshDb();
    await seed(pg);
  });

  it("claims the active member only", async () => {
    const claimed = await claimDueDuesReminders({ exec: execOn(pg) });
    expect(claimed.map((c) => c.userId)).toEqual(["u_active"]);
  });

  it("leaves the other rows unclaimed, so a restore is still reminded", async () => {
    await claimDueDuesReminders({ exec: execOn(pg) });

    const stamped = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "member_dues"
        WHERE dues_reminder_period IS NOT NULL`,
    );
    expect(single(stamped).n).toBe(1);

    await pg.exec(
      `UPDATE "member" SET status = 'active' WHERE id = 'mem_archived';`,
    );
    const second = await claimDueDuesReminders({ exec: execOn(pg) });
    expect(second.map((c) => c.userId)).toEqual(["u_archived"]);
  });

  it("claims each active member once per billing period", async () => {
    expect(await claimDueDuesReminders({ exec: execOn(pg) })).toHaveLength(1);
    expect(await claimDueDuesReminders({ exec: execOn(pg) })).toHaveLength(0);
  });
});
