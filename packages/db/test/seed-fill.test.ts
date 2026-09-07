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

/**
 * "Fill an existing academy" safety: fill adds fakes onto the REAL academy's own
 * plans + classes; clear removes ONLY the fakes. The real owner, the real
 * student, the real plan, the real class + its real booking, and booking_count
 * must all be exactly as they started.
 */
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

    // A real academy: owner + one real student, one real plan, one upcoming
    // class with the real student booked (booking_count = 1).
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
      INSERT INTO "membership_plan" (id, academy_id, name, price_minor, currency)
        VALUES ('${REAL_PLAN}', '${ACAD}', 'Adult', 5000, 'EUR');
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
    // The upcoming real class now has the real student + fake bookings.
    const booked = await scalar(
      `SELECT count(*)::int n FROM "class_participation" WHERE class_id = $1 AND booking_status='booked'`,
      [REAL_CLASS],
    );
    expect(booked).toBeGreaterThan(1);
    // booking_count was recomputed to match confirmed bookings.
    const bc = await scalar(
      `SELECT booking_count n FROM "class" WHERE id = $1`,
      [REAL_CLASS],
    );
    expect(bc).toBe(booked);
    // Dues span the three payment states → seeded onto the real plan.
    const duesOnRealPlan = await scalar(
      `SELECT count(*)::int n FROM "member_dues" WHERE plan_id = $1`,
      [REAL_PLAN],
    );
    expect(duesOnRealPlan).toBeGreaterThan(0);
  });

  it("clear removes every fake and restores the real academy exactly", async () => {
    await clearAcademy(exec, { academyId: ACAD, organizationId: ACAD });
    expect(await academyFakeCount(exec, ACAD)).toBe(0);

    // No fake rows remain anywhere in the academy.
    expect(
      await scalar(
        `SELECT count(*)::int n FROM "member" WHERE organization_id=$1 AND id LIKE 'seed_%'`,
        [ACAD],
      ),
    ).toBe(0);
    expect(
      await scalar(`SELECT count(*)::int n FROM "user" WHERE id LIKE 'seed_%'`),
    ).toBe(0);
    // class_participation keys the fake by student_id; the rest by member_id.
    expect(
      await scalar(
        `SELECT count(*)::int n FROM "class_participation" WHERE academy_id=$1 AND student_id LIKE 'seed_%'`,
        [ACAD],
      ),
    ).toBe(0);
    for (const [t, col] of [
      ["member_dues", "member_id"],
      ["payment_claim", "member_id"],
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
    // A fake cannot survive as someone else's referrer either.
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
        `SELECT count(*)::int n FROM "membership_plan" WHERE academy_id=$1`,
        [ACAD],
      ),
    ).toBe(1);
    expect(
      await scalar(`SELECT count(*)::int n FROM "class" WHERE academy_id=$1`, [
        ACAD,
      ]),
    ).toBe(1);
    // The real student's real booking survives, and booking_count is back to 1.
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

/**
 * The same fill against a branch that runs SHARED memberships (ADR 126-129).
 * A filled academy full of people with no membership would be the one state it
 * must not show, so fill puts the fakes on the gym's own plans — and clear
 * takes those rows with it, because `access_assignment.user_id` is a real
 * foreign key on the fake user.
 */
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

  it("fill puts the fakes on the gym's own plan and leaves no branch dues", async () => {
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
    // The legacy dues gate is off here, so nothing writes to it.
    expect(
      await scalar(
        `SELECT count(*)::int n FROM "member_dues" WHERE academy_id=$1`,
        [ACAD],
      ),
    ).toBe(0);
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
