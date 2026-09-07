import { afterEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import {
  harness,
  rejectionCode,
  seedAcademies,
  seedClasses,
  seedParticipations,
} from "./helpers";

const A = "academy_A";
const OWNER = "u_owner";
const COACH = "u_coach";
const ANA = "u_ana";
const BO = "u_bo";
const PLAN = "11111111-1111-1111-1111-111111111111";
const RECENT = "aaaaaaaa-0000-4000-8000-000000000001";
const OLD = "aaaaaaaa-0000-4000-8000-000000000002";

let open: Harness | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function base(): Promise<Harness> {
  const h = await harness();
  open = h;
  await seedAcademies(h.pg, [
    {
      id: A,
      code: "100001",
      members: [
        { userId: OWNER, role: "owner", status: "active" },
        { userId: COACH, role: "instructor", status: "active" },
        { userId: ANA, role: "student", status: "active", name: "Ana" },
        { userId: BO, role: "student", status: "active", name: "Bo" },
      ],
    },
  ]);
  return h;
}

async function seedClaim(
  h: Harness,
  amountMinor: number,
  daysAgo: number,
): Promise<void> {
  await h.pg.exec(`
    INSERT INTO "access_plan" (id, organization_id, name, price_minor, currency)
      VALUES ('${PLAN}', '${A}', 'Unlimited', ${amountMinor}, 'EUR')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO "membership_purchase"
      (organization_id, user_id, entity_id, plan_id, plan_name, price_minor,
       currency, start_month, entity_ids, branch_names, version, reference,
       status, confirmed_at)
      VALUES ('${A}', '${ANA}', '${A}', '${PLAN}', 'Unlimited', ${amountMinor},
              'EUR', date_trunc('month', now())::date, ARRAY['${A}'],
              ARRAY['Academy A'], 'test', gen_random_uuid()::text,
              'confirmed', now() - interval '${daysAgo} days');
  `);
}

describe("stats.dashboard", () => {
  it("counts marked attendance into the gym insights", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      { id: RECENT, academyId: A, instructorId: COACH, startsInMinutes: -120 },
    ]);
    await seedParticipations(h.pg, [
      {
        classId: RECENT,
        academyId: A,
        studentId: ANA,
        attendanceStatus: "present",
      },
      {
        classId: RECENT,
        academyId: A,
        studentId: BO,
        attendanceStatus: "absent",
      },
    ]);

    const { insights } = await h.as(OWNER, A).stats.dashboard();
    expect(insights.visitsThisWeek).toBe(1);
    expect(insights.attendanceRate).toBe(0.5);
  });

  it("ignores attendance older than the thirty-day window", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: OLD,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: -60 * 1440,
      },
    ]);
    await seedParticipations(h.pg, [
      {
        classId: OLD,
        academyId: A,
        studentId: ANA,
        attendanceStatus: "present",
      },
    ]);

    const { insights } = await h.as(OWNER, A).stats.dashboard();
    expect(insights.visitsThisWeek).toBe(0);
  });

  it("adds this month's confirmed payments and keeps last month apart", async () => {
    const h = await base();
    await seedClaim(h, 5000, 0);

    const { revenue } = await h.as(OWNER, A).stats.dashboard();
    expect(revenue).toEqual([
      { currency: "EUR", amountMinor: 5000, previousMinor: 0 },
    ]);
  });

  it("leaves an unconfirmed payment out of the money", async () => {
    const h = await base();
    await h.pg.exec(`
      INSERT INTO "access_plan" (id, organization_id, name, price_minor, currency)
        VALUES ('${PLAN}', '${A}', 'Unlimited', 5000, 'EUR');
      INSERT INTO "membership_purchase"
        (organization_id, user_id, entity_id, plan_id, plan_name, price_minor,
         currency, start_month, entity_ids, branch_names, version, reference,
         status)
        VALUES ('${A}', '${ANA}', '${A}', '${PLAN}', 'Unlimited', 5000, 'EUR',
                date_trunc('month', now())::date, ARRAY['${A}'],
                ARRAY['Academy A'], 'test', gen_random_uuid()::text, 'claimed');
    `);

    const { revenue } = await h.as(OWNER, A).stats.dashboard();
    expect(revenue).toEqual([]);
  });

  it("lists a member who has stopped coming, and not one who never started", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: OLD,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: -60 * 1440,
      },
    ]);
    await seedParticipations(h.pg, [
      {
        classId: OLD,
        academyId: A,
        studentId: ANA,
        attendanceStatus: "present",
      },
    ]);

    const { drifting } = await h.as(OWNER, A).stats.dashboard();
    expect(drifting?.map((m) => m.name)).toEqual(["Ana"]);
  });

  it("leaves out a member who trained recently", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      { id: RECENT, academyId: A, instructorId: COACH, startsInMinutes: -1440 },
    ]);
    await seedParticipations(h.pg, [
      {
        classId: RECENT,
        academyId: A,
        studentId: ANA,
        attendanceStatus: "present",
      },
    ]);

    const { drifting } = await h.as(OWNER, A).stats.dashboard();
    expect(drifting).toEqual([]);
  });

  it("never lists staff as drifting", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: OLD,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: -60 * 1440,
      },
    ]);
    await seedParticipations(h.pg, [
      {
        classId: OLD,
        academyId: A,
        studentId: COACH,
        attendanceStatus: "present",
      },
    ]);

    const { drifting } = await h.as(OWNER, A).stats.dashboard();
    expect(drifting).toEqual([]);
  });

  it("refuses a student outright", async () => {
    const h = await base();
    expect(await rejectionCode(h.as(ANA, A).stats.dashboard())).toBe(
      "FORBIDDEN",
    );
  });
});
