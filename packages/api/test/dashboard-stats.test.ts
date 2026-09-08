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

describe("stats.dashboard", () => {
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
