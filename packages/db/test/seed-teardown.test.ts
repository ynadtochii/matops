import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SeedExec } from "../src/seed/registry";
import * as schema from "../src/schema";
import { seedAll } from "../src/seed/run";
import { removeAll, seedStatus } from "../src/seed/teardown";
import { freshDb } from "./helpers";

/**
 * The load-bearing invariant: `removeAll` deletes every seed row and NOTHING
 * else. A real user and a real academy inserted alongside the seed must survive.
 * Runs the real seedAll → removeAll against PGlite (superuser, bypasses RLS —
 * matches the base connection the seed uses).
 */
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
    pg = await freshDb();
    exec = drizzle(pg, { schema, casing: "snake_case" }) as unknown as SeedExec;

    // The real user you sign in as (NOT a seed id).
    await pg.exec(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
       VALUES ('${realUser.id}', 'Real Owner', 'real@example.com', true, now(), now());`,
    );
    // A completely separate REAL academy that must never be touched.
    await pg.exec(
      `INSERT INTO "organization" (id, name, slug, public_code, created_at)
       VALUES ('real_org', 'Real Gym', 'real-gym', '123456', now());
       INSERT INTO "member" (id, organization_id, user_id, role, status, created_at)
       VALUES ('real_mem', 'real_org', '${realUser.id}', 'owner', 'active', now());
       INSERT INTO "membership_plan" (academy_id, name, price_minor, currency)
       VALUES ('real_org', 'Adult', 5000, 'EUR');`,
    );

    await seedAll(exec, { realUser, now });
  });

  afterAll(async () => {
    await pg.close();
  });

  it("seeds both demo academies with data", async () => {
    const status = await seedStatus(exec);
    expect(status.every((s) => s.present)).toBe(true);
    expect(status.every((s) => s.members > 0)).toBe(true);
    expect(status.every((s) => s.classes > 0)).toBe(true);
    // Fake seed users were created.
    expect(await countLike("user", "id", "seed_%")).toBeGreaterThan(0);
  });

  it("attaches the real user to a demo academy without a seed id", async () => {
    const members = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "member" WHERE user_id = $1`,
      [realUser.id],
    );
    // Real academy (1) + owner of ALPHA + student of BETA = 3.
    expect(members.rows[0]?.n).toBe(3);
  });

  it("removeAll deletes every seed row", async () => {
    await removeAll(exec);
    const status = await seedStatus(exec);
    expect(status.every((s) => !s.present)).toBe(true);

    // No seed rows remain, anywhere.
    expect(await countLike("user", "id", "seed_%")).toBe(0);
    expect(await countLike("organization", "id", "seed_%")).toBe(0);
    expect(await countLike("member", "id", "seed_%")).toBe(0);
    for (const table of [
      "class",
      "class_template",
      "class_participation",
      "membership_plan",
      "member_dues",
      "payment_claim",
      "member_rank",
      "drop_in",
    ]) {
      expect(await countLike(table, "academy_id", "seed_org_%")).toBe(0);
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
      `SELECT id FROM "membership_plan" WHERE academy_id = 'real_org'`,
    );
    expect(realPlan.rows).toHaveLength(1);

    // The real user's membership in the real academy survives; their demo
    // memberships (seed_ ids) are gone.
    const realMembers = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "member" WHERE user_id = $1`,
      [realUser.id],
    );
    expect(realMembers.rows[0]?.n).toBe(1);
  });
});
