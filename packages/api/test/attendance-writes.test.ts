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
const TODAY = "aaaaaaaa-0000-4000-8000-000000000004";

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
      id: TODAY,
      academyId: A,
      instructorId: COACH,
      startsInMinutes: -60,
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

    await h.as(COACH, A).attendance.mark({
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
      class_id: string;
      attendance_status: string;
    }>(
      `SELECT d.first_name, d.consent, v.class_id, v.attendance_status
         FROM "drop_in" d JOIN "drop_in_visit" v ON v.drop_in_id = d.id`,
    );
    expect(rows.rows[0]).toMatchObject({
      first_name: "Dee",
      consent: false,
      class_id: YESTERDAY,
      attendance_status: "present",
    });
  });

  it("keeps the first class's register when the visitor returns on another day", async () => {
    const h = await base();
    const visitor = {
      firstName: "Dee",
      lastName: "Reis",
      phone: "+351911111111",
    };
    await h
      .as(COACH, A)
      .attendance.addVisitor({ classId: YESTERDAY, ...visitor });
    await h.as(COACH, A).attendance.addVisitor({ classId: TODAY, ...visitor });

    const rows = await h.pg.query<{ class_id: string }>(
      `SELECT class_id FROM "drop_in_visit" ORDER BY class_id`,
    );
    expect(rows.rows.map((r) => r.class_id).sort()).toEqual(
      [YESTERDAY, TODAY].sort(),
    );
  });

  it("marks a booked visitor absent, so a no-show is not read as present", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor({
      classId: YESTERDAY,
      firstName: "Dee",
      lastName: "Reis",
      phone: "+351911111111",
    });
    const roster = await h.as(COACH, A).attendance.list({ id: YESTERDAY });
    const visitId = roster.dropIns[0]?.id ?? "";
    await h.as(COACH, A).attendance.markVisitor({
      classId: YESTERDAY,
      visitId,
      status: "absent",
    });

    const rows = await h.pg.query<{ attendance_status: string }>(
      `SELECT attendance_status FROM "drop_in_visit"`,
    );
    expect(rows.rows[0]?.attendance_status).toBe("absent");
  });

  it("stores the phone the visitor typed, country code and all", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor({
      classId: YESTERDAY,
      firstName: "Dee",
      lastName: "Reis",
      phone: "+351 911 111 111",
    });

    const rows = await h.pg.query<{ phone: string }>(
      `SELECT phone FROM "drop_in"`,
    );
    expect(rows.rows[0]?.phone).toBe("+351911111111");
  });

  it("refuses to mark a visitor who cancelled their booking", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor({
      classId: YESTERDAY,
      firstName: "Dee",
      lastName: "Reis",
      phone: "+351911111111",
    });
    const roster = await h.as(COACH, A).attendance.list({ id: YESTERDAY });
    const visitId = roster.dropIns[0]?.id ?? "";
    await h.pg.query(
      `UPDATE "drop_in_visit" SET booking_status = 'cancelled', attendance_status = 'unmarked'`,
    );

    expect(
      await rejectionCode(
        h.as(COACH, A).attendance.markVisitor({
          classId: YESTERDAY,
          visitId,
          status: "present",
        }),
      ),
    ).toBe("NOT_FOUND");
    const rows = await h.pg.query<{ attendance_status: string }>(
      `SELECT attendance_status FROM "drop_in_visit"`,
    );
    expect(rows.rows[0]?.attendance_status).toBe("unmarked");
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

describe("attendance review", () => {
  it("loads member and visitor rosters and keeps review counts on their class", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      {
        classId: YESTERDAY,
        academyId: A,
        studentId: ANA,
        attendanceStatus: "present",
      },
      {
        classId: TODAY,
        academyId: A,
        studentId: BO,
        attendanceStatus: "absent",
      },
    ]);
    const caller = h.as(OWNER, A).attendance;
    await caller.addVisitor({
      classId: YESTERDAY,
      firstName: "Visitor",
      lastName: "",
      phone: "+351911111111",
    });
    const yesterday = await caller.list({ id: YESTERDAY });
    const today = await caller.list({ id: TODAY });
    expect(yesterday.rows.map((row) => row.studentId)).toEqual([ANA]);
    expect(yesterday.dropIns).toHaveLength(1);
    expect(yesterday.review).toMatchObject({
      present: 2,
      absent: 0,
      unmarked: 0,
      total: 2,
    });
    expect(today.rows.map((row) => row.studentId)).toEqual([BO]);
    expect(today.dropIns).toHaveLength(0);
    expect(today.review).toMatchObject({
      present: 0,
      absent: 1,
      unmarked: 0,
      total: 1,
    });
    expect(yesterday.review.fingerprint).not.toBe(today.review.fingerprint);
  });

  it("keeps the existing editing limit when finishing older attendance", async () => {
    const h = await base();
    const caller = h.as(OWNER, A).attendance;
    const roster = await caller.list({ id: LONG_AGO });
    expect(
      await rejectionCode(
        caller.finish({
          id: LONG_AGO,
          fingerprint: roster.review.fingerprint,
          nobodyAttended: true,
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("includes empty and old classes until someone reviews them", async () => {
    const h = await base();
    const caller = h.as(OWNER, A).attendance;
    const queue = await caller.reviewQueue({});
    expect(queue.rows[0]?.id).toBe(LONG_AGO);
    expect(queue.rows.map((row) => row.id)).toContain(YESTERDAY);
    expect(queue.rows.map((row) => row.id)).not.toContain(NEXT_WEEK);
    const roster = await caller.list({ id: YESTERDAY });
    expect(
      await rejectionCode(
        caller.finish({
          id: YESTERDAY,
          fingerprint: roster.review.fingerprint,
        }),
      ),
    ).toBe("CONFLICT");
    await caller.finish({
      id: YESTERDAY,
      fingerprint: roster.review.fingerprint,
      nobodyAttended: true,
    });
    expect(
      (await caller.reviewQueue({})).rows.map((row) => row.id),
    ).not.toContain(YESTERDAY);
    expect((await caller.list({ id: YESTERDAY })).review.reviewed).toBe(true);
  });

  it("refuses partial attendance and reopens after changes or deletion", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: YESTERDAY, academyId: A, studentId: ANA },
      { classId: YESTERDAY, academyId: A, studentId: BO },
    ]);
    const caller = h.as(OWNER, A).attendance;
    await caller.mark({
      classId: YESTERDAY,
      studentId: ANA,
      status: "present",
    });
    const partial = await caller.list({ id: YESTERDAY });
    expect(partial.review.unmarked).toBe(1);
    expect(
      await rejectionCode(
        caller.finish({
          id: YESTERDAY,
          fingerprint: partial.review.fingerprint,
        }),
      ),
    ).toBe("CONFLICT");
    await caller.mark({ classId: YESTERDAY, studentId: BO, status: "absent" });
    expect(
      await rejectionCode(
        caller.finish({
          id: YESTERDAY,
          fingerprint: partial.review.fingerprint,
        }),
      ),
    ).toBe("CONFLICT");
    const complete = await caller.list({ id: YESTERDAY });
    await caller.finish({
      id: YESTERDAY,
      fingerprint: complete.review.fingerprint,
    });
    expect((await caller.list({ id: YESTERDAY })).review.reviewed).toBe(true);
    await h.pg.query(
      "DELETE FROM class_participation WHERE class_id = $1 AND student_id = $2",
      [YESTERDAY, BO],
    );
    expect((await caller.list({ id: YESTERDAY })).review.reviewed).toBe(false);
  });

  it("filters inclusive branch dates without narrowing the all-time count", async () => {
    const h = await base();
    await h.pg.query("UPDATE entity SET time_zone = $1 WHERE id = $2", [
      "America/Los_Angeles",
      A,
    ]);
    await h.pg.query('UPDATE "class" SET starts_at = $1 WHERE id = $2', [
      "2020-01-02T01:00:00Z",
      YESTERDAY,
    ]);
    const caller = h.as(OWNER, A).attendance;
    const all = await caller.reviewQueue({});
    const day = await caller.reviewQueue({
      from: "2020-01-01",
      to: "2020-01-01",
    });
    expect(day.rows.map((row) => row.id)).toEqual([YESTERDAY]);
    expect(day.total).toBe(1);
    expect(day.needsReview).toBe(all.needsReview);
    expect(
      (await caller.reviewQueue({ from: "2020-01-02", to: "2020-01-02" }))
        .total,
    ).toBe(0);
  });

  it("includes visitor marks and invalidates a review after a visitor change", async () => {
    const h = await base();
    const caller = h.as(OWNER, A).attendance;
    await caller.addVisitor({
      classId: YESTERDAY,
      firstName: "Visitor",
      lastName: "",
      phone: "+351911111111",
    });
    const roster = await caller.list({ id: YESTERDAY });
    expect(roster.review.present).toBe(1);
    const visitor = roster.dropIns[0];
    if (!visitor) throw new Error("Visitor missing");
    await caller.finish({
      id: YESTERDAY,
      fingerprint: roster.review.fingerprint,
    });
    await caller.markVisitor({
      classId: YESTERDAY,
      visitId: visitor.id,
      status: "unmarked",
    });
    const changed = await caller.list({ id: YESTERDAY });
    expect(changed.review.reviewed).toBe(false);
    expect(changed.review.unmarked).toBe(1);
    expect(
      await rejectionCode(
        caller.finish({
          id: YESTERDAY,
          fingerprint: changed.review.fingerprint,
          nobodyAttended: true,
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("excludes cancelled classes and refuses students and foreign classes", async () => {
    const h = await base();
    await h.pg.query('UPDATE "class" SET status = $1 WHERE id = $2', [
      "cancelled",
      YESTERDAY,
    ]);
    const caller = h.as(OWNER, A).attendance;
    expect(
      (await caller.reviewQueue({})).rows.map((row) => row.id),
    ).not.toContain(YESTERDAY);
    const roster = await caller.list({ id: YESTERDAY });
    expect(
      await rejectionCode(
        caller.finish({
          id: YESTERDAY,
          fingerprint: roster.review.fingerprint,
          nobodyAttended: true,
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(await rejectionCode(h.as(ANA, A).attendance.reviewQueue({}))).toBe(
      "FORBIDDEN",
    );
    expect(
      await rejectionCode(
        h.as(ANA, A).attendance.finish({
          id: LONG_AGO,
          fingerprint: roster.review.fingerprint,
          nobodyAttended: true,
        }),
      ),
    ).toBe("FORBIDDEN");
    await seedAcademies(h.pg, [
      {
        id: "academy_B",
        code: "100002",
        members: [{ userId: "u_other", role: "owner", status: "active" }],
      },
    ]);
    const foreign = h.as("u_other", "academy_B").attendance;
    expect((await foreign.reviewQueue({})).needsReview).toBe(0);
    expect(
      await rejectionCode(
        foreign.finish({
          id: LONG_AGO,
          fingerprint: roster.review.fingerprint,
          nobodyAttended: true,
        }),
      ),
    ).toBe("NOT_FOUND");
  });
});
