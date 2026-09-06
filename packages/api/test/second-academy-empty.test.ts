import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { eq } from "@matops/db";
import { organization } from "@matops/db/schema";

import type { Harness } from "./helpers";
import {
  harness,
  memberId,
  rejectionCode,
  seedAcademies,
  seedClasses,
} from "./helpers";

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

  it("carries no plans and no dues", async () => {
    expect(await second().payments.plans()).toEqual([]);
    expect(await second().payments.claims()).toEqual([]);
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

describe("opening a general branch", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700091",
        members: [{ userId: OWNER, role: "owner", status: "active" }],
      },
    ]);
  });

  afterAll(() => h.close());

  it("refuses one while the flag is off", async () => {
    expect(
      await rejectionCode(
        h.as(OWNER, ORG).entity.create({
          name: "The Gym",
          type: "general_space",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("still opens a second mat while the flag is off", async () => {
    const made = await h
      .as(OWNER, ORG)
      .entity.create({ name: "Second Mat", type: "bjj_academy" });
    expect(made.created).toContain("academy_profile");
  });

  it("opens one once the flag is on, with no profile or track", async () => {
    await h.exec
      .update(organization)
      .set({ generalBranchesEnabled: true })
      .where(eq(organization.id, ORG));

    const made = await h
      .as(OWNER, ORG)
      .entity.create({ name: "The Gym", type: "general_space" });
    expect(made.created.sort()).toEqual(["entity", "entity_membership"]);

    const headers = new Headers();
    headers.set("x-matops-entity", made.entityId);
    const current = await h.as(OWNER, ORG, headers).entity.current();
    expect([current.name, current.type]).toEqual(["The Gym", "general_space"]);
  });
});
