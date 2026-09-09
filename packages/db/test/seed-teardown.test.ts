import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SeedExec } from "../src/seed/registry";
import * as schema from "../src/schema";
import { SEED_ACADEMY } from "../src/seed/registry";
import { seedAll } from "../src/seed/run";
import { removeAll, seedStatus } from "../src/seed/teardown";
import { freshDb } from "./helpers";

describe("seed roundtrip — up then down", () => {
  let pg: Awaited<ReturnType<typeof freshDb>>;
  let exec: SeedExec;
  const now = new Date("2026-07-24T12:00:00.000Z");
  const realUser = { id: "real_you_abc", name: "Real Owner" };

  const countLike = async (table: string, col: string, pattern: string) =>
    (
      await pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "${col}" LIKE $1`,
        [pattern],
      )
    ).rows[0]?.n ?? 0;

  beforeAll(async () => {
    pg = await freshDb([]);
    exec = drizzle(pg, { schema, casing: "snake_case" }) as unknown as SeedExec;

    await pg.exec(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
       VALUES ('${realUser.id}', 'Real Owner', 'real@example.com', true, now(), now());`,
    );
    await pg.exec(
      `INSERT INTO "organization" (id, name, slug, created_at)
       VALUES ('real_org', 'Real Gym', 'real-gym', now());
       INSERT INTO "entity" (id, organization_id, type, name, slug, is_default, public_code)
       VALUES ('real_org', 'real_org', 'bjj_academy', 'Real Gym', 'real-gym', true, '123456');
       INSERT INTO "member" (id, organization_id, user_id, role, created_at)
       VALUES ('real_mem', 'real_org', '${realUser.id}', 'owner', now());
       INSERT INTO "access_plan" (id, organization_id, name, price_minor, currency)
       VALUES ('99999999-9999-4999-8999-999999999999', 'real_org', 'Adult', 5000, 'EUR');`,
    );

    await seedAll(exec, { realUser, now });

    await pg.exec(
      `INSERT INTO "notification" (academy_id, user_id, kind, title, body)
       VALUES ('${SEED_ACADEMY.id}', 'seed_user_s01', 'announcement', 'Mat closed', 'No class tonight.');
       INSERT INTO "product_event" (organization_id, entity_id, kind, name)
       VALUES ('${SEED_ACADEMY.id}', '${SEED_ACADEMY.id}', 'milestone', 'first_class');`,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  it("seeds the demo academy with data", async () => {
    const status = await seedStatus(exec);
    const demo = status.find((s) => s.academyId === SEED_ACADEMY.id);
    expect(demo?.present).toBe(true);
    expect(demo?.members).toBeGreaterThan(0);
    expect(demo?.classes).toBeGreaterThan(0);
    expect(await countLike("user", "id", "seed_%")).toBeGreaterThan(0);
  });

  it("attaches the real user to a demo academy without a seed id", async () => {
    const members = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "member" WHERE user_id = $1`,
      [realUser.id],
    );
    expect(members.rows[0]?.n).toBe(2);
  });

  it("removeAll deletes every seed row", async () => {
    await removeAll(exec);
    const status = await seedStatus(exec);
    expect(status.every((s) => !s.present)).toBe(true);

    expect(await countLike("user", "id", "seed_%")).toBe(0);
    expect(await countLike("organization", "id", "seed_%")).toBe(0);
    expect(await countLike("member", "id", "seed_%")).toBe(0);
    for (const table of [
      "class",
      "class_template",
      "class_participation",
      "member_rank",
      "member_referral",
      "member_referral_audit",
      "drop_in",
      "notification",
    ]) {
      expect(await countLike(table, "academy_id", "seed_org_%")).toBe(0);
    }
    for (const table of [
      "access_plan",
      "access_plan_price",
      "access_plan_entity",
      "access_assignment",
      "access_assignment_change",
      "membership_month",
      "membership_month_audit",
      "membership_policy",
      "product_event",
    ]) {
      expect(await countLike(table, "organization_id", "seed_org_%")).toBe(0);
    }
  });

  it("spares the real user and the real academy", async () => {
    const realUserRow = await pg.query(`SELECT id FROM "user" WHERE id = $1`, [
      realUser.id,
    ]);
    expect(realUserRow.rows).toHaveLength(1);

    const realOrg = await pg.query(
      `SELECT id FROM "organization" WHERE id = 'real_org'`,
    );
    expect(realOrg.rows).toHaveLength(1);

    const realPlan = await pg.query(
      `SELECT id FROM "access_plan" WHERE organization_id = 'real_org'`,
    );
    expect(realPlan.rows).toHaveLength(1);

    const realMembers = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "member" WHERE user_id = $1`,
      [realUser.id],
    );
    expect(realMembers.rows[0]?.n).toBe(1);
  });
});
