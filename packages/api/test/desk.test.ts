import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { resetRateLimits } from "../src/rate-limit";
import {
  harness,
  memberId,
  rejectionCode,
  seedClasses,
  seedParticipations,
  storedBookingCount,
} from "./helpers";

const A = "academy_A";
const B = "academy_B";
const OWNER = "u_owner";
const MANAGER = "u_manager";
const COACH = "u_coach";
const ANA = "u_ana";
const BRUNO = "u_bruno";
const PENDING = "u_pending";
const SUSPENDED = "u_suspended";
const OTHER = "u_other";
const RUNNING = "dddddddd-0000-4000-8000-000000000001";
const LATER = "dddddddd-0000-4000-8000-000000000002";
const B_CLASS = "dddddddd-0000-4000-8000-000000000003";
const THIRD = "dddddddd-0000-4000-8000-000000000004";

let open: Harness | null = null;

beforeEach(() => resetRateLimits());

afterEach(async () => {
  await open?.close();
  open = null;
});

async function base(): Promise<Harness> {
  const h = await harness([
    {
      id: A,
      code: "100001",
      members: [
        { userId: OWNER, role: "owner", status: "active", name: "Olga Owner" },
        {
          userId: MANAGER,
          role: "manager",
          status: "active",
          name: "Mia Manager",
        },
        {
          userId: COACH,
          role: "instructor",
          status: "active",
          name: "Caio Coach",
        },
        { userId: ANA, role: "student", status: "active", name: "Ana Silva" },
        {
          userId: BRUNO,
          role: "student",
          status: "active",
          name: "Bruno Costa",
        },
        {
          userId: PENDING,
          role: "student",
          status: "pending",
          name: "Paulo Pending",
        },
        {
          userId: SUSPENDED,
          role: "student",
          status: "suspended",
          name: "Sara Suspended",
        },
      ],
    },
    {
      id: B,
      code: "100002",
      members: [
        { userId: OTHER, role: "owner", status: "active", name: "Otto Other" },
      ],
    },
  ]);
  await seedClasses(h.pg, [
    {
      id: RUNNING,
      academyId: A,
      instructorId: COACH,
      title: "Fundamentals",
      startsInMinutes: -10,
      durationMinutes: 60,
    },
    {
      id: LATER,
      academyId: A,
      instructorId: COACH,
      startsInMinutes: 30,
      durationMinutes: 60,
    },
    {
      id: THIRD,
      academyId: A,
      instructorId: COACH,
      startsInMinutes: 240,
      durationMinutes: 60,
    },
    {
      id: B_CLASS,
      academyId: B,
      instructorId: OTHER,
      startsInMinutes: -10,
      durationMinutes: 60,
    },
  ]);
  open = h;
  return h;
}

async function token(h: Harness): Promise<string> {
  return (await h.as(OWNER, A).desk.link()).token;
}

function desk(h: Harness) {
  return h.as("nobody", null).desk;
}

async function participation(h: Harness, classId: string, userId: string) {
  const res = await h.pg.query<{
    booking_status: string;
    attendance_status: string;
    check_in_source: string | null;
  }>(
    `SELECT booking_status, attendance_status, check_in_source
       FROM "class_participation" WHERE class_id = $1 AND student_id = $2`,
    [classId, userId],
  );
  return res.rows[0] ?? null;
}

describe("desk.link and desk.rotateLink", () => {
  it("gives owners and managers the same live link", async () => {
    const h = await base();
    const first = await h.as(OWNER, A).desk.link();
    const again = await h.as(MANAGER, A).desk.link();
    expect(again.token).toBe(first.token);
  });

  it("refuses instructors and students", async () => {
    const h = await base();
    expect(await rejectionCode(h.as(COACH, A).desk.link())).toBe("FORBIDDEN");
    expect(await rejectionCode(h.as(ANA, A).desk.link())).toBe("FORBIDDEN");
    expect(await rejectionCode(h.as(COACH, A).desk.rotateLink())).toBe(
      "FORBIDDEN",
    );
  });

  it("is separate from the drop-in link", async () => {
    const h = await base();
    const deskToken = await token(h);
    const dropIn = await h.as(OWNER, A).dropIn.link();
    expect(dropIn.token).not.toBe(deskToken);
    expect(await rejectionCode(desk(h).classes({ token: dropIn.token }))).toBe(
      "NOT_FOUND",
    );
  });

  it("stops the old token after a rotate", async () => {
    const h = await base();
    const old = await token(h);
    const fresh = await h.as(MANAGER, A).desk.rotateLink();
    expect(fresh.token).not.toBe(old);
    expect(await rejectionCode(desk(h).classes({ token: old }))).toBe(
      "NOT_FOUND",
    );
    await expect(desk(h).classes({ token: fresh.token })).resolves.toBeTruthy();
  });

  it("answers an unknown token like a revoked one", async () => {
    const h = await base();
    expect(await rejectionCode(desk(h).classes({ token: "nope" }))).toBe(
      "NOT_FOUND",
    );
  });
});

describe("desk.classes", () => {
  it("lists only this academy's classes and opens the running and the next one", async () => {
    const h = await base();
    const result = await desk(h).classes({ token: await token(h) });
    const ids = result.classes.map((c) => c.id);
    expect(ids).toContain(RUNNING);
    expect(ids).not.toContain(B_CLASS);
    expect(result.tomorrow).toBe(false);
    expect(result.defaultClassId).toBeNull();
    expect(result.classes.find((c) => c.id === RUNNING)?.open).toBe(true);
    expect(result.classes.find((c) => c.id === LATER)?.open).toBe(true);
    expect(result.classes.find((c) => c.id === THIRD)?.open).not.toBe(true);
  });
});

describe("desk.roster and desk.search", () => {
  it("shows booked active members with short names and nothing else", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: RUNNING, academyId: A, studentId: ANA },
    ]);
    const roster = await desk(h).roster({
      token: await token(h),
      classId: RUNNING,
    });
    expect(roster).toEqual([
      { memberId: memberId(A, ANA), name: "Ana S.", present: false },
    ]);
  });

  it("finds active members only, from this academy only", async () => {
    const h = await base();
    const t = await token(h);
    const hits = await desk(h).search({
      token: t,
      classId: RUNNING,
      query: "b",
    });
    expect(hits).toEqual([]);
    const bruno = await desk(h).search({
      token: t,
      classId: RUNNING,
      query: "bru",
    });
    expect(bruno.map((p) => p.name)).toEqual(["Bruno C."]);
    expect(
      await desk(h).search({ token: t, classId: RUNNING, query: "paulo" }),
    ).toEqual([]);
    expect(
      await desk(h).search({ token: t, classId: RUNNING, query: "otto" }),
    ).toEqual([]);
  });
});

describe("desk.checkIn", () => {
  it("marks a booked member present with the desk source", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: RUNNING, academyId: A, studentId: ANA },
    ]);
    const result = await desk(h).checkIn({
      token: await token(h),
      classId: RUNNING,
      memberId: memberId(A, ANA),
    });
    expect(result.booked).toBe(false);
    expect(await participation(h, RUNNING, ANA)).toEqual({
      booking_status: "booked",
      attendance_status: "present",
      check_in_source: "reception_self",
    });
  });

  it("books and marks a walk-in", async () => {
    const h = await base();
    const before = await storedBookingCount(h.pg, RUNNING);
    const result = await desk(h).checkIn({
      token: await token(h),
      classId: RUNNING,
      memberId: memberId(A, BRUNO),
    });
    expect(result.booked).toBe(true);
    expect(await participation(h, RUNNING, BRUNO)).toMatchObject({
      booking_status: "booked",
      attendance_status: "present",
    });
    expect(await storedBookingCount(h.pg, RUNNING)).toBe(before + 1);
  });

  it("is a no-op the second time", async () => {
    const h = await base();
    const t = await token(h);
    const input = { token: t, classId: RUNNING, memberId: memberId(A, BRUNO) };
    await desk(h).checkIn(input);
    const again = await desk(h).checkIn(input);
    expect(again.booked).toBe(false);
  });

  it("refuses pending and suspended members", async () => {
    const h = await base();
    const t = await token(h);
    for (const user of [PENDING, SUSPENDED]) {
      expect(
        await rejectionCode(
          desk(h).checkIn({
            token: t,
            classId: RUNNING,
            memberId: memberId(A, user),
          }),
        ),
      ).toBe("PRECONDITION_FAILED");
    }
  });

  it("checks in to the next class once the first has started", async () => {
    const h = await base();
    await desk(h).checkIn({
      token: await token(h),
      classId: LATER,
      memberId: memberId(A, ANA),
    });
    expect(await participation(h, LATER, ANA)).toMatchObject({
      attendance_status: "present",
    });
  });

  it("refuses a class that is not open yet", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        desk(h).checkIn({
          token: await token(h),
          classId: THIRD,
          memberId: memberId(A, ANA),
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("cannot reach another academy's member or class", async () => {
    const h = await base();
    const t = await token(h);
    expect(
      await rejectionCode(
        desk(h).checkIn({
          token: t,
          classId: RUNNING,
          memberId: memberId(B, OTHER),
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(
      await rejectionCode(
        desk(h).checkIn({
          token: t,
          classId: B_CLASS,
          memberId: memberId(A, ANA),
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });
});

describe("desk.undo", () => {
  it("removes a walk-in booking the tap created", async () => {
    const h = await base();
    const t = await token(h);
    const before = await storedBookingCount(h.pg, RUNNING);
    const done = await desk(h).checkIn({
      token: t,
      classId: RUNNING,
      memberId: memberId(A, BRUNO),
    });
    await desk(h).undo({ token: t, ...done });
    expect(await participation(h, RUNNING, BRUNO)).toEqual({
      booking_status: "cancelled",
      attendance_status: "unmarked",
      check_in_source: null,
    });
    expect(await storedBookingCount(h.pg, RUNNING)).toBe(before);
  });

  it("keeps an earlier booking and only clears attendance", async () => {
    const h = await base();
    await seedParticipations(h.pg, [
      { classId: RUNNING, academyId: A, studentId: ANA },
    ]);
    const t = await token(h);
    const done = await desk(h).checkIn({
      token: t,
      classId: RUNNING,
      memberId: memberId(A, ANA),
    });
    await desk(h).undo({ token: t, ...done });
    expect(await participation(h, RUNNING, ANA)).toMatchObject({
      booking_status: "booked",
      attendance_status: "unmarked",
    });
  });

  it("refuses an old check-in", async () => {
    const h = await base();
    const t = await token(h);
    const done = await desk(h).checkIn({
      token: t,
      classId: RUNNING,
      memberId: memberId(A, BRUNO),
    });
    await h.pg.query(
      `UPDATE "class_participation" SET attended_at = now() - interval '1 minute' WHERE id = $1`,
      [done.participationId],
    );
    expect(await rejectionCode(desk(h).undo({ token: t, ...done }))).toBe(
      "PRECONDITION_FAILED",
    );
  });

  it("refuses a row from another academy's desk", async () => {
    const h = await base();
    const t = await token(h);
    const done = await desk(h).checkIn({
      token: t,
      classId: RUNNING,
      memberId: memberId(A, BRUNO),
    });
    const otherToken = (await h.as(OTHER, B).desk.link()).token;
    expect(
      await rejectionCode(desk(h).undo({ token: otherToken, ...done })),
    ).toBe("PRECONDITION_FAILED");
  });
});
