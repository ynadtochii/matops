import type { PGlite } from "@electric-sql/pglite";
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
const CY = "u_cy";

const YESTERDAY = "aaaaaaaa-0000-4000-8000-000000000001";
const LONG_AGO = "aaaaaaaa-0000-4000-8000-000000000002";
const NEXT_WEEK = "aaaaaaaa-0000-4000-8000-000000000003";

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
        { userId: CY, role: "student", status: "active", name: "Cy" },
      ],
    },
  ]);
  await seedClasses(h.pg, [
    {
      id: YESTERDAY,
      academyId: A,
      instructorId: COACH,
      startsInMinutes: -1440,
    },
    {
      id: LONG_AGO,
      academyId: A,
      instructorId: COACH,
      startsInMinutes: -30 * 1440,
    },
    {
      id: NEXT_WEEK,
      academyId: A,
      instructorId: COACH,
      startsInMinutes: 7 * 1440,
    },
  ]);
  return h;
}

async function marks(
  pg: PGlite,
  classId: string,
): Promise<{ student_id: string; attendance_status: string }[]> {
  const res = await pg.query<{
    student_id: string;
    attendance_status: string;
  }>(
    `SELECT student_id, attendance_status FROM "class_participation"
      WHERE class_id = $1 ORDER BY student_id`,
    [classId],
  );
  return res.rows;
}

describe("attendance.mark", () => {
  it("marks a booked student present and records who did it", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: YESTERDAY, academyId: A, studentId: ANA },
    ]);

    await h
      .as(COACH, A)
      .attendance.mark({
        classId: YESTERDAY,
        studentId: ANA,
        status: "present",
      });

    const res = await h.pg.query<{
      attendance_status: string;
      marked_by: string | null;
      attended_at: Date | null;
    }>(
      `SELECT attendance_status, marked_by, attended_at FROM "class_participation"
        WHERE class_id = $1 AND student_id = $2`,
      [YESTERDAY, ANA],
    );
    expect(res.rows[0]?.attendance_status).toBe("present");
    expect(res.rows[0]?.marked_by).toBe(COACH);
    expect(res.rows[0]?.attended_at).not.toBeNull();
  });

  it("clears the attended time when the mark is changed to absent", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: YESTERDAY, academyId: A, studentId: ANA },
    ]);
    const mark = (status: "present" | "absent") =>
      h
        .as(COACH, A)
        .attendance.mark({ classId: YESTERDAY, studentId: ANA, status });

    await mark("present");
    await mark("absent");

    const res = await h.pg.query<{ attended_at: Date | null }>(
      `SELECT attended_at FROM "class_participation"
        WHERE class_id = $1 AND student_id = $2`,
      [YESTERDAY, ANA],
    );
    expect(res.rows[0]?.attended_at).toBeNull();
  });

  it("refuses someone who never booked, and says to add a walk-in", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as(COACH, A).attendance.mark({
          classId: YESTERDAY,
          studentId: ANA,
          status: "present",
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("refuses a class outside the fourteen-day backfill window", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: LONG_AGO, academyId: A, studentId: ANA },
      { classId: NEXT_WEEK, academyId: A, studentId: ANA },
    ]);
    const attempt = (classId: string) =>
      rejectionCode(
        h
          .as(COACH, A)
          .attendance.mark({ classId, studentId: ANA, status: "present" }),
      );

    expect(await attempt(LONG_AGO)).toBe("PRECONDITION_FAILED");
    expect(await attempt(NEXT_WEEK)).toBe("PRECONDITION_FAILED");
  });

  it("refuses a student marking anyone, including themselves", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: YESTERDAY, academyId: A, studentId: ANA },
    ]);
    expect(
      await rejectionCode(
        h.as(ANA, A).attendance.mark({
          classId: YESTERDAY,
          studentId: ANA,
          status: "present",
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("attendance.markAll", () => {
  it("marks every unmarked booking present and leaves the rest alone", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: YESTERDAY, academyId: A, studentId: ANA },
      { classId: YESTERDAY, academyId: A, studentId: BO },
      {
        classId: YESTERDAY,
        academyId: A,
        studentId: CY,
        attendanceStatus: "absent",
      },
    ]);

    const res = await h.as(COACH, A).attendance.markAll({ id: YESTERDAY });

    expect(res.marked).toBe(2);
    expect(await marks(h.pg, YESTERDAY)).toEqual([
      { student_id: ANA, attendance_status: "present" },
      { student_id: BO, attendance_status: "present" },
      { student_id: CY, attendance_status: "absent" },
    ]);
  });

  it("does not mark someone who cancelled their booking", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: YESTERDAY, academyId: A, studentId: ANA },
      {
        classId: YESTERDAY,
        academyId: A,
        studentId: BO,
        bookingStatus: "cancelled",
      },
    ]);

    const res = await h.as(COACH, A).attendance.markAll({ id: YESTERDAY });

    expect(res.marked).toBe(1);
    expect(await marks(h.pg, YESTERDAY)).toEqual([
      { student_id: ANA, attendance_status: "present" },
      { student_id: BO, attendance_status: "unmarked" },
    ]);
  });

  it("is a no-op on an empty class rather than an error", async () => {
    const h = await base();
    await expect(
      h.as(COACH, A).attendance.markAll({ id: YESTERDAY }),
    ).resolves.toEqual({ marked: 0 });
  });

  it("refuses a class outside the backfill window", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: LONG_AGO, academyId: A, studentId: ANA },
    ]);
    expect(
      await rejectionCode(h.as(COACH, A).attendance.markAll({ id: LONG_AGO })),
    ).toBe("PRECONDITION_FAILED");
  });
});

describe("attendance.addWalkIn", () => {
  it("marks a member present who never booked, without taking a seat", async () => {
    const h = await base();
    await h
      .as(COACH, A)
      .attendance.addWalkIn({ classId: YESTERDAY, studentId: ANA });

    const res = await h.pg.query<{
      booking_status: string;
      attendance_status: string;
    }>(
      `SELECT booking_status, attendance_status FROM "class_participation"
        WHERE class_id = $1 AND student_id = $2`,
      [YESTERDAY, ANA],
    );
    expect(res.rows[0]).toMatchObject({
      booking_status: "none",
      attendance_status: "present",
    });

    const cls = await h.pg.query<{ booking_count: number }>(
      `SELECT booking_count FROM "class" WHERE id = $1`,
      [YESTERDAY],
    );
    expect(cls.rows[0]?.booking_count).toBe(0);
  });

  it("just marks them present when they had already booked", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: YESTERDAY, academyId: A, studentId: ANA },
    ]);
    await h
      .as(COACH, A)
      .attendance.addWalkIn({ classId: YESTERDAY, studentId: ANA });

    expect(await marks(h.pg, YESTERDAY)).toEqual([
      { student_id: ANA, attendance_status: "present" },
    ]);
  });
});

describe("attendance.addVisitor", () => {
  it("records a non-member against the class as a lead", async () => {
    const h = await base();
    const res = await h.as(COACH, A).attendance.addVisitor({
      classId: YESTERDAY,
      firstName: "Dee",
      lastName: "Reis",
      phone: "+351911111111",
    });

    expect(res).toEqual({ firstVisit: true, visitCount: 1 });
    const rows = await h.pg.query<{
      first_name: string;
      consent: boolean;
      class_id: string | null;
    }>(`SELECT first_name, consent, class_id FROM "drop_in"`);
    expect(rows.rows[0]).toMatchObject({
      first_name: "Dee",
      consent: false,
      class_id: YESTERDAY,
    });
  });

  it("refuses a class outside the backfill window", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as(COACH, A).attendance.addVisitor({
          classId: LONG_AGO,
          firstName: "Dee",
          lastName: "Reis",
          phone: "+351911111111",
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("refuses a student", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as(ANA, A).attendance.addVisitor({
          classId: YESTERDAY,
          firstName: "Dee",
          lastName: "Reis",
          phone: "+351911111111",
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});
