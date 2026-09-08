import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SeedExec } from "../src/seed/registry";
import * as schema from "../src/schema";
import {
  academyFakeCount,
  clearAcademy,
  fillAcademy,
} from "../src/seed/augment";
import { freshDb } from "./helpers";

async function sharedBranches() {
  const pg = await freshDb([]);
  const exec = drizzle(pg, {
    schema,
    casing: "snake_case",
  }) as unknown as SeedExec;
  await pg.exec(`
    INSERT INTO "user" (id, name, email) VALUES ('shared_owner', 'Owner', 'shared@real.test');
    INSERT INTO organization (id, name, slug, created_at) VALUES ('shared_org', 'Shared', 'shared', now());
    INSERT INTO entity (id, organization_id, type, name, slug, is_default, public_code, time_zone, membership_enforced_at) VALUES
      ('alpha_branch', 'shared_org', 'bjj_academy', 'Alpha', 'alpha', true, '860280', 'America/Los_Angeles', now()),
      ('beta_branch', 'shared_org', 'bjj_academy', 'Beta', 'beta', false, '860281', 'UTC', now());
    INSERT INTO member (id, organization_id, user_id, role, created_at)
      VALUES ('shared_owner_member', 'shared_org', 'shared_owner', 'owner', now());
    INSERT INTO entity_membership (id, organization_id, entity_id, user_id, role, status) VALUES
      ('alpha_owner', 'shared_org', 'alpha_branch', 'shared_owner', 'owner', 'active'),
      ('beta_owner', 'shared_org', 'beta_branch', 'shared_owner', 'owner', 'active');
    INSERT INTO access_plan (id, organization_id, name, price_minor, currency)
      VALUES ('44444444-4444-4444-4444-444444444444', 'shared_org', 'Shared plan', 5000, 'EUR');
    INSERT INTO access_plan_price (organization_id, plan_id, effective_month, price_minor, currency)
      VALUES ('shared_org', '44444444-4444-4444-4444-444444444444', '2026-06-01', 5000, 'EUR');
    INSERT INTO access_plan_entity (organization_id, plan_id, entity_id) VALUES
      ('shared_org', '44444444-4444-4444-4444-444444444444', 'alpha_branch'),
      ('shared_org', '44444444-4444-4444-4444-444444444444', 'beta_branch');
  `);
  return { pg, exec };
}

describe("shared membership seed isolation", () => {
  it("clears one branch without changing another branch's fake records", async () => {
    const { pg, exec } = await sharedBranches();
    try {
      const now = new Date("2026-07-24T12:00:00Z");
      for (const academyId of ["alpha_branch", "beta_branch"]) {
        await fillAcademy(exec, {
          academyId,
          organizationId: "shared_org",
          now,
          studentCount: 3,
        });
      }
      const snapshot = async () => {
        const result: Record<string, unknown> = {};
        for (const [table, condition] of [
          ["user", "id LIKE 'seed_user_fill_betabran_%'"],
          ["member", "user_id LIKE 'seed_user_fill_betabran_%'"],
          ["entity_membership", "entity_id = 'beta_branch'"],
          ["access_assignment", "user_id LIKE 'seed_user_fill_betabran_%'"],
          [
            "membership_month",
            "assignment_id IN (SELECT id FROM access_assignment WHERE user_id LIKE 'seed_user_fill_betabran_%')",
          ],
          [
            "membership_month_audit",
            "assignment_id IN (SELECT id FROM access_assignment WHERE user_id LIKE 'seed_user_fill_betabran_%')",
          ],
        ] as const) {
          result[table] = (
            await pg.query(
              `SELECT * FROM "${table}" WHERE ${condition} ORDER BY id`,
            )
          ).rows;
        }
        return result;
      };
      const before = await snapshot();
      expect(before.access_assignment).toHaveLength(3);
      await clearAcademy(exec, {
        academyId: "alpha_branch",
        organizationId: "shared_org",
      });
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await pg.query(
            "SELECT id FROM access_assignment WHERE user_id LIKE 'seed_user_fill_alphabra_%'",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await pg.query(
            "SELECT id FROM member WHERE user_id LIKE 'seed_user_fill_alphabra_%'",
          )
        ).rows,
      ).toEqual([]);
      await clearAcademy(exec, {
        academyId: "alpha_branch",
        organizationId: "shared_org",
      });
      expect(await snapshot()).toEqual(before);
    } finally {
      await pg.close();
    }
  });

  it.each(["policy", "default branch"])(
    "uses the %s calendar across a month boundary",
    async (source) => {
      const { pg, exec } = await sharedBranches();
      try {
        if (source === "policy") {
          await pg.exec(`
          UPDATE entity SET time_zone = 'UTC' WHERE id = 'alpha_branch';
          INSERT INTO membership_policy (organization_id, calendar_time_zone)
            VALUES ('shared_org', 'America/Los_Angeles');
        `);
        }
        await fillAcademy(exec, {
          academyId: "beta_branch",
          organizationId: "shared_org",
          now: new Date("2026-08-01T00:30:00Z"),
          studentCount: 4,
        });
        expect(
          (
            await pg.query(
              "SELECT DISTINCT start_month::text FROM access_assignment",
            )
          ).rows,
        ).toEqual([{ start_month: "2026-06-01" }]);
        expect(
          (
            await pg.query(
              "SELECT DISTINCT month::text FROM membership_month ORDER BY month",
            )
          ).rows,
        ).toEqual([{ month: "2026-06-01" }, { month: "2026-07-01" }]);
        expect(
          (
            await pg.query(
              "SELECT id FROM membership_month WHERE month = '2026-07-01' AND paid",
            )
          ).rows,
        ).toHaveLength(1);
      } finally {
        await pg.close();
      }
    },
  );
});

describe("seed fill/clear — augment a real academy", () => {
  let pg: Awaited<ReturnType<typeof freshDb>>;
  let exec: SeedExec;
  const now = new Date("2026-07-24T12:00:00.000Z");
  const ACAD = "real_grapplers";
  const REAL_CLASS = "11111111-1111-1111-1111-111111111111";
  const REAL_PLAN = "22222222-2222-2222-2222-222222222222";

  const scalar = async (sqlText: string, params: unknown[] = []) =>
    (await pg.query<{ n: number }>(sqlText, params)).rows[0]?.n ?? 0;

  beforeAll(async () => {
    pg = await freshDb([]);
    exec = drizzle(pg, { schema, casing: "snake_case" }) as unknown as SeedExec;

    await pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
        ('owner_real', 'Real Owner', 'owner@real.test', true, now(), now()),
        ('stud_real', 'Real Student', 'stud@real.test', true, now(), now());
      INSERT INTO "organization" (id, name, slug, created_at)
        VALUES ('${ACAD}', 'Grapplers', 'grapplers', now());
      INSERT INTO "entity" (id, organization_id, type, name, slug, is_default, public_code)
        VALUES ('${ACAD}', '${ACAD}', 'bjj_academy', 'Grapplers', 'grapplers', true, '860275');
      INSERT INTO "member" (id, organization_id, user_id, role, created_at) VALUES
        ('mem_owner', '${ACAD}', 'owner_real', 'owner', now()),
        ('mem_stud', '${ACAD}', 'stud_real', 'student', now());
      INSERT INTO "access_plan" (id, organization_id, name, price_minor, currency)
        VALUES ('${REAL_PLAN}', '${ACAD}', 'Adult', 5000, 'EUR');
      INSERT INTO "access_plan_price" (organization_id, plan_id, effective_month, price_minor, currency)
        VALUES ('${ACAD}', '${REAL_PLAN}', '2026-06-01', 5000, 'EUR');
      INSERT INTO "access_plan_entity" (organization_id, plan_id, entity_id)
        VALUES ('${ACAD}', '${REAL_PLAN}', '${ACAD}');
      INSERT INTO "class" (id, academy_id, instructor_id, title, starts_at, duration_minutes, capacity, booking_count, status)
        VALUES ('${REAL_CLASS}', '${ACAD}', 'owner_real', 'BJJ', '2026-07-26T17:00:00Z', 60, 20, 1, 'scheduled');
      INSERT INTO "class_participation" (academy_id, class_id, student_id, booking_status, booking_tier)
        VALUES ('${ACAD}', '${REAL_CLASS}', 'stud_real', 'booked', 'confirmed');
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("fill adds fake students and books them onto the real class", async () => {
    await fillAcademy(exec, { academyId: ACAD, organizationId: ACAD, now });
    expect(await academyFakeCount(exec, ACAD)).toBe(20);
    const booked = await scalar(
      `SELECT count(*)::int n FROM "class_participation" WHERE class_id = $1 AND booking_status='booked'`,
      [REAL_CLASS],
    );
    expect(booked).toBeGreaterThan(1);
    const bc = await scalar(
      `SELECT booking_count n FROM "class" WHERE id = $1`,
      [REAL_CLASS],
    );
    expect(bc).toBe(booked);
    const assignmentsOnRealPlan = await scalar(
      `SELECT count(*)::int n FROM "access_assignment" WHERE plan_id = $1`,
      [REAL_PLAN],
    );
    expect(assignmentsOnRealPlan).toBeGreaterThan(0);
  });

  it("clear removes every fake and restores the real academy exactly", async () => {
    await clearAcademy(exec, { academyId: ACAD, organizationId: ACAD });
    expect(await academyFakeCount(exec, ACAD)).toBe(0);

    expect(
      await scalar(
        `SELECT count(*)::int n FROM "member" WHERE organization_id=$1 AND id LIKE 'seed_%'`,
        [ACAD],
      ),
    ).toBe(0);
    expect(
      await scalar(`SELECT count(*)::int n FROM "user" WHERE id LIKE 'seed_%'`),
    ).toBe(0);
    expect(
      await scalar(
        `SELECT count(*)::int n FROM "class_participation" WHERE academy_id=$1 AND student_id LIKE 'seed_%'`,
        [ACAD],
      ),
    ).toBe(0);
    for (const [t, col] of [
      ["member_rank", "member_id"],
      ["rank_promotion", "member_id"],
      ["member_note", "member_id"],
      ["member_referral", "student_member_id"],
      ["member_referral_audit", "student_member_id"],
    ] as const) {
      expect(
        await scalar(
          `SELECT count(*)::int n FROM "${t}" WHERE academy_id=$1 AND ${col} LIKE 'seed_%'`,
          [ACAD],
        ),
      ).toBe(0);
    }
    expect(
      await scalar(
        `SELECT count(*)::int n FROM "member_referral" WHERE academy_id=$1 AND referrer_member_id LIKE 'seed_%'`,
        [ACAD],
      ),
    ).toBe(0);
  });

  it("leaves the real owner, student, plan, class, and its booking untouched", async () => {
    expect(
      await scalar(
        `SELECT count(*)::int n FROM "member" WHERE organization_id=$1`,
        [ACAD],
      ),
    ).toBe(2);
    expect(
      await scalar(
        `SELECT count(*)::int n FROM "access_plan" WHERE organization_id=$1`,
        [ACAD],
      ),
    ).toBe(1);
    expect(
      await scalar(`SELECT count(*)::int n FROM "class" WHERE academy_id=$1`, [
        ACAD,
      ]),
    ).toBe(1);
    const booked = await scalar(
      `SELECT count(*)::int n FROM "class_participation" WHERE class_id=$1 AND student_id='stud_real'`,
      [REAL_CLASS],
    );
    expect(booked).toBe(1);
    expect(
      await scalar(`SELECT booking_count n FROM "class" WHERE id=$1`, [
        REAL_CLASS,
      ]),
    ).toBe(1);
  });
});

describe("seed fill/clear — a branch on shared memberships", () => {
  let pg: Awaited<ReturnType<typeof freshDb>>;
  let exec: SeedExec;
  const now = new Date("2026-07-24T12:00:00.000Z");
  const ACAD = "real_gated";
  const PLAN = "33333333-3333-3333-3333-333333333333";

  const scalar = async (sqlText: string, params: unknown[] = []) =>
    (await pg.query<{ n: number }>(sqlText, params)).rows[0]?.n ?? 0;

  beforeAll(async () => {
    pg = await freshDb([]);
    exec = drizzle(pg, { schema, casing: "snake_case" }) as unknown as SeedExec;
    await pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('owner_gated', 'Gated Owner', 'owner@gated.test', true, now(), now());
      INSERT INTO "organization" (id, name, slug, created_at)
        VALUES ('${ACAD}', 'Gated', 'gated', now());
      INSERT INTO "entity" (id, organization_id, type, name, slug, is_default, public_code, time_zone, membership_enforced_at)
        VALUES ('${ACAD}', '${ACAD}', 'bjj_academy', 'Gated', 'gated', true, '860276', 'Europe/Lisbon', now());
      INSERT INTO "member" (id, organization_id, user_id, role, created_at)
        VALUES ('mem_gated_owner', '${ACAD}', 'owner_gated', 'owner', now());
      INSERT INTO "entity_membership" (id, organization_id, entity_id, user_id, role, status, joined_at)
        VALUES ('emem_gated_owner', '${ACAD}', '${ACAD}', 'owner_gated', 'owner', 'active', now());
      INSERT INTO "access_plan" (id, organization_id, name, student_selectable, price_minor, currency)
        VALUES ('${PLAN}', '${ACAD}', 'Unlimited', true, 5000, 'EUR');
      INSERT INTO "access_plan_price" (organization_id, plan_id, effective_month, price_minor, currency)
        VALUES ('${ACAD}', '${PLAN}', '2026-06-01', 5000, 'EUR');
      INSERT INTO "access_plan_entity" (organization_id, plan_id, entity_id)
        VALUES ('${ACAD}', '${PLAN}', '${ACAD}');
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("fill puts the fakes on the gym's own plan", async () => {
    await fillAcademy(exec, { academyId: ACAD, organizationId: ACAD, now });
    expect(
      await scalar(
        `SELECT count(*)::int n FROM "access_assignment" WHERE organization_id=$1`,
        [ACAD],
      ),
    ).toBeGreaterThan(0);
    expect(
      await scalar(
        `SELECT count(*)::int n FROM "membership_month" WHERE organization_id=$1 AND paid`,
        [ACAD],
      ),
    ).toBeGreaterThan(0);
  });

  it("clear takes the memberships with the fakes", async () => {
    await clearAcademy(exec, { academyId: ACAD, organizationId: ACAD });
    expect(await academyFakeCount(exec, ACAD)).toBe(0);
    for (const table of [
      "access_assignment",
      "membership_month",
      "membership_month_audit",
    ]) {
      expect(
        await scalar(
          `SELECT count(*)::int n FROM "${table}" WHERE organization_id=$1`,
          [ACAD],
        ),
      ).toBe(0);
    }
    expect(
      await scalar(`SELECT count(*)::int n FROM "user" WHERE id LIKE 'seed_%'`),
    ).toBe(0);
  });
});
