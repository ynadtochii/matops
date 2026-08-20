import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import {
  harness,
  rejectionCode,
  seedAcademies,
  seedClasses,
  seedParticipations,
} from "./helpers";

const ACAD = "acad_coach";
const OTHER = "acad_coach_other";
const OWNER = "u_coach_owner";
const ANA = "u_coach_ana";
const BRUNO = "u_coach_bruno";
const STUDENT_A = "u_coach_student_a";
const STUDENT_B = "u_coach_student_b";
const OTHER_OWNER = "u_coach_other_owner";

const WINDOW = { window: "last_90_days" } as const;

describe("O10 coach stats", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACAD,
        code: "700061",
        members: [
          { userId: OWNER, role: "owner", status: "active", name: "Owner" },
          { userId: ANA, role: "instructor", status: "active", name: "Ana" },
          {
            userId: BRUNO,
            role: "instructor",
            status: "active",
            name: "Bruno",
          },
          { userId: STUDENT_A, role: "student", status: "active" },
          { userId: STUDENT_B, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "700062",
        members: [{ userId: OTHER_OWNER, role: "owner", status: "active" }],
      },
    ]);
    await seedClasses(h.pg, [
      {
        id: "11111111-1111-4111-8111-000000000001",
        academyId: ACAD,
        instructorId: ANA,
        title: "Gi",
        startsInMinutes: -180,
      },
      {
        id: "11111111-1111-4111-8111-000000000002",
        academyId: ACAD,
        instructorId: ANA,
        title: "No-Gi",
        startsInMinutes: -300,
        durationMinutes: 90,
      },
      {
        id: "11111111-1111-4111-8111-000000000003",
        academyId: ACAD,
        instructorId: ANA,
        title: "Gi",
        startsInMinutes: 600,
      },
      {
        id: "11111111-1111-4111-8111-000000000004",
        academyId: ACAD,
        instructorId: BRUNO,
        title: "Gi",
        startsInMinutes: -240,
        status: "cancelled",
      },
      {
        id: "11111111-1111-4111-8111-000000000005",
        academyId: OTHER,
        instructorId: OTHER_OWNER,
        title: "Gi",
        startsInMinutes: -180,
      },
    ]);
    await seedParticipations(h.pg, [
      {
        academyId: ACAD,
        classId: "11111111-1111-4111-8111-000000000001",
        studentId: STUDENT_A,
        attendanceStatus: "present",
      },
      {
        academyId: ACAD,
        classId: "11111111-1111-4111-8111-000000000001",
        studentId: STUDENT_B,
        attendanceStatus: "absent",
      },
      {
        academyId: ACAD,
        classId: "11111111-1111-4111-8111-000000000002",
        studentId: STUDENT_A,
        attendanceStatus: "unmarked",
      },
    ]);
  });

  afterAll(() => h.close());

  it("credits finished classes to their instructor", async () => {
    const res = await h.as(OWNER, ACAD).stats.coaches(WINDOW);
    const ana = res.coaches.find((c) => c.instructorId === ANA);
    expect(ana).toMatchObject({
      name: "Ana",
      classesLed: 2,
      minutesLed: 150,
      markedClasses: 1,
      visitsTaught: 1,
      distinctStudents: 1,
      avgHeadcount: 1,
      cancelled: 0,
      onStaff: true,
    });
    expect(ana?.markedRate).toBeCloseTo(0.5);
  });

  it("counts a cancelled class as cancelled, not as led", async () => {
    const res = await h.as(OWNER, ACAD).stats.coaches(WINDOW);
    const bruno = res.coaches.find((c) => c.instructorId === BRUNO);
    expect(bruno).toMatchObject({ classesLed: 0, cancelled: 1 });
  });

  it("gives every active coach a row and no one else", async () => {
    const res = await h.as(OWNER, ACAD).stats.coaches(WINDOW);
    expect(res.coaches.map((c) => c.instructorId)).toEqual([ANA, BRUNO, OWNER]);
  });

  it("never counts another academy's classes", async () => {
    const res = await h.as(OTHER_OWNER, OTHER).stats.coaches(WINDOW);
    expect(res.coaches.map((c) => c.classesLed)).toEqual([1]);
  });

  it("refuses the roster to an instructor", async () => {
    expect(await rejectionCode(h.as(ANA, ACAD).stats.coaches(WINDOW))).toBe(
      "FORBIDDEN",
    );
  });

  it("gives a coach their own card without naming themselves", async () => {
    const res = await h.as(ANA, ACAD).stats.coach(WINDOW);
    expect(res.instructorId).toBe(ANA);
    expect(res.workload.classesLed).toBe(2);
    expect(res.breakdown.byClass.map((g) => [g.title, g.classesLed])).toEqual([
      ["Gi", 1],
      ["No-Gi", 1],
    ]);
  });

  it("refuses one instructor reading another's figures", async () => {
    expect(
      await rejectionCode(
        h.as(BRUNO, ACAD).stats.coach({ ...WINDOW, instructorId: ANA }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("lets an owner read any coach", async () => {
    const res = await h
      .as(OWNER, ACAD)
      .stats.coach({ ...WINDOW, instructorId: ANA });
    expect(res).toMatchObject({ instructorId: ANA, name: "Ana" });
  });
});
