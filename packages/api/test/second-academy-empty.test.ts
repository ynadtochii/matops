import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, memberId, seedAcademies, seedClasses } from "./helpers";

const ORG = "acad_second_empty";
const OWNER = "u_second_owner";
const COACH = "u_second_coach";
const STUDENT = "u_second_student";
const STUDENT_MEMBER = memberId(ORG, STUDENT);
const CLASS = "aaaaaaaa-0000-4000-8000-000000000901";

const WEEK = {
  from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  to: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
};

function withEntity(id: string): Headers {
  const headers = new Headers();
  headers.set("x-matops-entity", id);
  return headers;
}

describe("a second academy starts empty", () => {
  let h: Harness;
  let secondId: string;

  const first = () => h.as(OWNER, ORG, withEntity(ORG));
  const second = () => h.as(OWNER, ORG, withEntity(secondId));

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700090",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
    ]);
    await seedClasses(h.pg, [
      { id: CLASS, academyId: ORG, instructorId: COACH, startsInMinutes: 60 },
    ]);
    await first().template.create({
      title: "Gi Fundamentals",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startsAtMinutes: 600,
      durationMinutes: 60,
      timeZone: "UTC",
      capacity: 20,
    });
    const plan = await first().payments.createPlan({
      name: "Unlimited",
      priceMinor: 8000,
      currency: "EUR",
      cycle: "monthly",
    });
    await first().payments.setMemberDues({
      memberId: STUDENT_MEMBER,
      planId: plan.id,
      nextDueAt: "2026-08-31",
    });
    await first().payments.updateRequisites({
      bankDetails: "IBAN PT50 0000 0000 0000 0000 0",
    });

    const made = await h
      .as(OWNER, ORG)
      .entity.create({ name: "Second Mat", type: "bjj_academy" });
    secondId = made.entityId;
  });

  afterAll(() => h.close());

  it("carries no roster but the owner", async () => {
    const rows = await second().membership.members();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("owner");
    expect(rows[0]?.email).toBe(`${OWNER}@test.local`);
  });

  it("carries no instructors", async () => {
    expect(await second().membership.staff()).toHaveLength(1);
    expect(await second().membership.instructors()).toEqual([
      { userId: OWNER, name: `User ${OWNER}`, role: "owner" },
    ]);
  });

  it("carries no schedule and no templates", async () => {
    expect(await second().class.week(WEEK)).toEqual([]);
    expect(await second().template.list()).toEqual([]);
  });

  it("carries no plans, dues or bank details", async () => {
    expect(await second().payments.plans()).toEqual([]);
    expect(await second().payments.claims()).toEqual([]);
    expect((await second().payments.getRequisites()).bankDetails).toBeFalsy();
  });

  it("gets its own join code", async () => {
    const a = await first().academy.current();
    const b = await second().academy.current();
    expect(b?.code).toBeTruthy();
    expect(b?.code).not.toBe(a?.code);
    expect(b?.name).toBe("Second Mat");
  });

  it("leaves the first academy's data where it was", async () => {
    const roster = await first().membership.members();
    expect(roster.map((r) => r.memberId).sort()).toEqual(
      [COACH, OWNER, STUDENT].map((u) => memberId(ORG, u)).sort(),
    );
    expect((await first().class.week(WEEK)).map((c) => c.id)).toContain(CLASS);
    expect(await first().template.list()).toHaveLength(1);
    expect(await first().payments.plans()).toHaveLength(1);
  });
});
