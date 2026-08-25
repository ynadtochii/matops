import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const ACAD = "acad_checkin";
const OWNER = "u_checkin_owner";
const STUDENT = "u_checkin_student";
const LIVE = "aaaaaaaa-0000-4000-8000-000000000501";
const LAST_WEEK = "aaaaaaaa-0000-4000-8000-000000000502";
const TOMORROW = "aaaaaaaa-0000-4000-8000-000000000503";
const LONG_RUNNING = "aaaaaaaa-0000-4000-8000-000000000504";

let h: Harness;

beforeAll(async () => {
  h = await harness();
  await seedAcademies(h.pg, [
    {
      id: ACAD,
      code: "700060",
      members: [
        { userId: OWNER, role: "owner", status: "active" },
        { userId: STUDENT, role: "student", status: "active" },
      ],
    },
  ]);
  await seedClasses(h.pg, [
    { id: LIVE, academyId: ACAD, instructorId: OWNER, startsInMinutes: -10 },
    {
      id: LAST_WEEK,
      academyId: ACAD,
      instructorId: OWNER,
      startsInMinutes: -7 * 24 * 60,
    },
    {
      id: TOMORROW,
      academyId: ACAD,
      instructorId: OWNER,
      startsInMinutes: 24 * 60,
    },
    {
      id: LONG_RUNNING,
      academyId: ACAD,
      instructorId: OWNER,
      startsInMinutes: -300,
      durationMinutes: 600,
    },
  ]);
});

afterAll(() => h.close());

describe("checkin.checkIn is bounded by the check-in window", () => {
  it("accepts the class running now", async () => {
    await expect(
      h.as(STUDENT, ACAD).checkin.checkIn({ classId: LIVE }),
    ).resolves.toBeDefined();
  });

  it("refuses a class from last week", async () => {
    expect(
      await rejectionCode(
        h.as(STUDENT, ACAD).checkin.checkIn({ classId: LAST_WEEK }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("refuses a class whose doors have not opened", async () => {
    expect(
      await rejectionCode(
        h.as(STUDENT, ACAD).checkin.checkIn({ classId: TOMORROW }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("accepts a long class that is still running", async () => {
    await expect(
      h.as(STUDENT, ACAD).checkin.checkIn({ classId: LONG_RUNNING }),
    ).resolves.toBeDefined();
  });
});

describe("checkin.today", () => {
  it("finds a long class that started hours ago and is still on", async () => {
    const rows = await h.as(STUDENT, ACAD).checkin.today();
    expect(rows.map((r) => r.id)).toContain(LONG_RUNNING);
  });

  it("leaves out the class from last week and the one tomorrow", async () => {
    const ids = (await h.as(STUDENT, ACAD).checkin.today()).map((r) => r.id);
    expect(ids).not.toContain(LAST_WEEK);
    expect(ids).not.toContain(TOMORROW);
  });
});
