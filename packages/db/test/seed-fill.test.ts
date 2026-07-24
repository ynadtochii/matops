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
    pg = await freshDb();
    exec = drizzle(pg, { schema, casing: "snake_case" }) as unknown as SeedExec;

    // A real academy: owner + one real student, one real plan, one upcoming
    // class with the real student booked (booking_count = 1).
    await pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
        ('owner_real', 'Real Owner', 'owner@real.test', true, now(), now()),
        ('stud_real', 'Real Student', 'stud@real.test', true, now(), now());
      INSERT INTO "organization" (id, name, slug, public_code, created_at)
        VALUES ('${ACAD}', 'Grapplers', 'grapplers', '860275', now());
      INSERT INTO "member" (id, organization_id, user_id, role, status, created_at) VALUES
        ('mem_owner', '${ACAD}', 'owner_real', 'owner', 'active', now()),
        ('mem_stud', '${ACAD}', 'stud_real', 'student', 'active', now());
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
    await fillAcademy(exec, { academyId: ACAD, now });
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
    await clearAcademy(exec, { academyId: ACAD });
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
    for (const t of [
      "member_dues",
      "payment_claim",
      "member_rank",
      "rank_promotion",
      "member_note",
    ]) {
      expect(
        await scalar(
          `SELECT count(*)::int n FROM "${t}" WHERE academy_id=$1 AND member_id LIKE 'seed_%'`,
          [ACAD],
        ),
      ).toBe(0);
    }
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
