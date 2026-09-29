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

async function seedVisit(
  pg: PGlite,
  opts: {
    academyId: string;
    classId: string;
    phone: string;
    firstName?: string;
  },
) {
  const { academyId, classId, phone, firstName = "Visitor" } = opts;
  await pg.query(
    `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, consent, source)
       VALUES ($1, $2, '', $3, false, 'staff')
       ON CONFLICT (academy_id, phone) DO UPDATE SET last_visit_at = now()`,
    [academyId, firstName, phone],
  );
  await pg.query(
    `INSERT INTO "drop_in_visit" (academy_id, drop_in_id, class_id, booking_status, attendance_status, attended_at)
       SELECT $1, d.id, $2, 'none', 'present', now()
         FROM "drop_in" d WHERE d.phone = $3 AND d.academy_id = $1
       ON CONFLICT (drop_in_id, class_id) DO NOTHING`,
    [academyId, classId, phone],
  );
}

const A = "academy_A";
const OWNER = "u_owner";
const MANAGER = "u_manager";
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
        { userId: MANAGER, role: "manager", status: "active" },
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
      personId: ANA,
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
        .attendance.mark({ classId: YESTERDAY, personId: ANA, status });

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
          personId: ANA,
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
          .attendance.mark({ classId, personId: ANA, status: "present" }),
      );

    expect(await attempt(LONG_AGO)).toBe("PRECONDITION_FAILED");
    expect(await attempt(NEXT_WEEK)).toBe("PRECONDITION_FAILED");
  });

  it("lets an owner correct old attendance with an audit reason", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: LONG_AGO, academyId: A, studentId: ANA },
    ]);

    expect(
      await rejectionCode(
        h.as(OWNER, A).attendance.mark({
          classId: LONG_AGO,
          personId: ANA,
          status: "present",
        }),
      ),
    ).toBe("PRECONDITION_FAILED");

    await h.as(OWNER, A).attendance.mark({
      classId: LONG_AGO,
      personId: ANA,
      status: "present",
      reason: "The paper register was entered late",
    });

    const result = await h.pg.query<{
      reason: string;
      before_value: string | null;
      after_value: string | null;
      actor_id: string | null;
    }>(
      `SELECT reason, before_value, after_value, actor_id
       FROM attendance_correction WHERE class_id = $1`,
      [LONG_AGO],
    );
    expect(result.rows).toEqual([
      {
        reason: "The paper register was entered late",
        before_value: "unmarked",
        after_value: "present",
        actor_id: OWNER,
      },
    ]);
  });

  it("lets a manager correct old attendance with an audit reason", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: LONG_AGO, academyId: A, studentId: ANA },
    ]);

    await h.as(MANAGER, A).attendance.mark({
      classId: LONG_AGO,
      personId: ANA,
      status: "absent",
      reason: "The manager checked the signed register",
    });

    const audit = await h.pg.query<{ actor_id: string | null }>(
      `SELECT actor_id FROM attendance_correction WHERE class_id = $1`,
      [LONG_AGO],
    );
    expect(audit.rows).toEqual([{ actor_id: MANAGER }]);
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
          personId: ANA,
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
      .attendance.addWalkIn({ classId: YESTERDAY, personId: ANA });

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
      .attendance.addWalkIn({ classId: YESTERDAY, personId: ANA });

    expect(await marks(h.pg, YESTERDAY)).toEqual([
      { student_id: ANA, attendance_status: "present" },
    ]);
  });
});

describe("attendance review", () => {
  it("returns the reviewer identity and time to another staff member", async () => {
    const h = await base();
    await h.pg.query('UPDATE "user" SET name = $1 WHERE id = $2', [
      "Coach Mira",
      COACH,
    ]);
    const coach = h.as(COACH, A).attendance;
    const before = await coach.list({ id: YESTERDAY });
    expect(before.review.reviewer).toBeNull();
    await coach.finish({
      id: YESTERDAY,
      fingerprint: before.review.fingerprint,
      nobodyAttended: true,
    });
    const after = await h.as(OWNER, A).attendance.list({ id: YESTERDAY });
    expect(after.review.reviewed).toBe(true);
    expect(after.review.reviewedAt).toBeInstanceOf(Date);
    expect(after.review.reviewer).toEqual({ id: COACH, name: "Coach Mira" });
  });

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
    await seedVisit(h.pg, {
      academyId: A,
      classId: YESTERDAY,
      phone: "+351911111111",
      firstName: "Visitor",
    });
    const yesterday = await caller.list({ id: YESTERDAY });
    const today = await caller.list({ id: TODAY });
    const people = await h.pg.query<{ id: string; account_user_id: string }>(
      `SELECT id, account_user_id FROM "person" WHERE account_user_id IN ($1, $2)`,
      [ANA, BO],
    );
    const personId = new Map(
      people.rows.map((row) => [row.account_user_id, row.id]),
    );
    expect(yesterday.rows.map((row) => row.studentId)).toEqual([
      personId.get(ANA),
    ]);
    expect(yesterday.dropIns).toHaveLength(1);
    expect(yesterday.review).toMatchObject({
      present: 2,
      absent: 0,
      unmarked: 0,
      total: 2,
    });
    expect(today.rows.map((row) => row.studentId)).toEqual([personId.get(BO)]);
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
      personId: ANA,
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
    await caller.mark({ classId: YESTERDAY, personId: BO, status: "absent" });
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
    await seedVisit(h.pg, {
      academyId: A,
      classId: YESTERDAY,
      phone: "+351911111111",
      firstName: "Visitor",
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
