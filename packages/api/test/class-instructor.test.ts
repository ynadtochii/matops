import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const ACAD = "acad_ci";
const OTHER = "acad_ci_other";
const OWNER = "u_ci_owner";
const ANA = "u_ci_ana";
const BRUNO = "u_ci_bruno";
const STUDENT = "u_ci_student";
const REMOVED = "u_ci_removed";
const OTHER_OWNER = "u_ci_other_owner";

const PAST = "22222222-2222-4222-8222-000000000001";
const FUTURE = "22222222-2222-4222-8222-000000000002";
const FOREIGN = "22222222-2222-4222-8222-000000000003";

describe("K.2 who may be credited for a class", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACAD,
        members: [
          { userId: OWNER, role: "owner", status: "active", name: "Owner" },
          { userId: ANA, role: "instructor", status: "active", name: "Ana" },
          {
            userId: BRUNO,
            role: "instructor",
            status: "active",
            name: "Bruno",
          },
          { userId: STUDENT, role: "student", status: "active" },
          { userId: REMOVED, role: "instructor", status: "removed" },
        ],
        code: "700071",
      },
      {
        id: OTHER,
        code: "700072",
        members: [{ userId: OTHER_OWNER, role: "owner", status: "active" }],
      },
    ]);
    await seedClasses(h.pg, [
      { id: PAST, academyId: ACAD, instructorId: ANA, startsInMinutes: -300 },
      { id: FUTURE, academyId: ACAD, instructorId: ANA, startsInMinutes: 600 },
      {
        id: FOREIGN,
        academyId: OTHER,
        instructorId: OTHER_OWNER,
        startsInMinutes: 600,
      },
    ]);
  });

  afterAll(() => h.close());

  describe("setInstructor", () => {
    it("lets any staff member set the coach before the class starts", async () => {
      const row = await h
        .as(ANA, ACAD)
        .class.setInstructor({ id: FUTURE, instructorId: BRUNO });
      expect(row.instructorId).toBe(BRUNO);
      await h
        .as(ANA, ACAD)
        .class.setInstructor({ id: FUTURE, instructorId: ANA });
    });

    it("refuses an instructor rewriting a class that already happened", async () => {
      expect(
        await rejectionCode(
          h
            .as(ANA, ACAD)
            .class.setInstructor({ id: PAST, instructorId: BRUNO }),
        ),
      ).toBe("FORBIDDEN");
    });

    it("lets an owner rewrite a class that already happened", async () => {
      const row = await h
        .as(OWNER, ACAD)
        .class.setInstructor({ id: PAST, instructorId: BRUNO });
      expect(row.instructorId).toBe(BRUNO);
      await h
        .as(OWNER, ACAD)
        .class.setInstructor({ id: PAST, instructorId: ANA });
    });

    it("refuses a user who is not staff of this academy", async () => {
      await expect(
        h
          .as(OWNER, ACAD)
          .class.setInstructor({ id: FUTURE, instructorId: STUDENT }),
      ).rejects.toThrow(/NOT_FOUND|not found/i);
      await expect(
        h
          .as(OWNER, ACAD)
          .class.setInstructor({ id: FUTURE, instructorId: REMOVED }),
      ).rejects.toThrow(/NOT_FOUND|not found/i);
      await expect(
        h
          .as(OWNER, ACAD)
          .class.setInstructor({ id: FUTURE, instructorId: OTHER_OWNER }),
      ).rejects.toThrow(/NOT_FOUND|not found/i);
    });

    it("never reaches another academy's class", async () => {
      await expect(
        h
          .as(OWNER, ACAD)
          .class.setInstructor({ id: FOREIGN, instructorId: ANA }),
      ).rejects.toThrow(/NOT_FOUND|not found/i);
    });
  });
});

describe("who is credited when nobody is named", () => {
  const ORG = "acad_ci_gym";
  const BOSS = "u_ci_gym_owner";
  let h: Harness;

  const session = {
    title: "Open mat",
    date: "2026-09-15",
    startsAtMinutes: 600,
    durationMinutes: 60,
    timeZone: "UTC",
    capacity: 20,
  };
  const weekly = {
    title: "Open mat",
    daysOfWeek: [1],
    startsAtMinutes: 600,
    durationMinutes: 60,
    timeZone: "UTC",
    capacity: 20,
  };

  function at(entityId: string): Headers {
    const headers = new Headers();
    headers.set("x-matops-entity", entityId);
    return headers;
  }

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700073",
        members: [{ userId: BOSS, role: "owner", status: "active" }],
      },
    ]);
  });

  afterAll(() => h.close());

  it("credits the staff member who saved a BJJ class", async () => {
    const row = await h.as(BOSS, ORG, at(ORG)).class.create(session);
    expect(row?.instructorId).toBe(BOSS);
  });

  it("does the same for a recurring template", async () => {
    const mat = await h.as(BOSS, ORG, at(ORG)).template.create(weekly);
    expect(mat?.instructorId).toBe(BOSS);
  });

  it("makes a class and a template soft", async () => {
    const mat = await h.as(BOSS, ORG, at(ORG)).class.create(session);
    const made = await h
      .as(BOSS, ORG, at(ORG))
      .template.create({ ...weekly, startsAtMinutes: 900 });
    expect([mat?.capacityPolicy, made?.capacityPolicy]).toEqual([
      "soft",
      "soft",
    ]);
  });
});
