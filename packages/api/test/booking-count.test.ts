import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import {
  confirmedBookings,
  harness,
  seedAcademies,
  seedClasses,
  storedBookingCount,
} from "./helpers";

const ACAD = "acad_book";
const OWNER = "u_owner_book";
const STUDENT = "u_student_book";
const PENDING = "u_pending_book";
const CLASS = "aaaaaaaa-0000-4000-8000-000000000001";

describe("class.booking_count invariant", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACAD,
        code: "700001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          {
            userId: PENDING,
            role: "member",
            status: "pending",
            invitedRole: "student",
          },
        ],
      },
    ]);
    await seedClasses(h.pg, [
      { id: CLASS, academyId: ACAD, instructorId: OWNER, startsInMinutes: 30 },
    ]);
  });

  afterAll(() => h.close());

  beforeEach(async () => {
    await h.pg.exec(`DELETE FROM "class_participation";`);
    await h.pg.exec(`UPDATE "class" SET booking_count = 0;`);
  });

  const agree = async () => {
    const stored = await storedBookingCount(h.pg, CLASS);
    const actual = await confirmedBookings(h.pg, CLASS);
    expect(stored).toBe(actual);
    return stored;
  };

  it("a single booking counts once", async () => {
    await h.as(STUDENT, ACAD).booking.book({ classId: CLASS });
    expect(await agree()).toBe(1);
  });

  it("booking twice does not double-count", async () => {
    const student = h.as(STUDENT, ACAD);
    await student.booking.book({ classId: CLASS });
    await student.booking.book({ classId: CLASS });
    expect(await agree()).toBe(1);
  });

  it("cancel releases the spot", async () => {
    const student = h.as(STUDENT, ACAD);
    await student.booking.book({ classId: CLASS });
    await student.booking.cancel({ classId: CLASS });
    expect(await agree()).toBe(0);
  });

  it("cancelling twice does not underflow", async () => {
    const student = h.as(STUDENT, ACAD);
    await student.booking.book({ classId: CLASS });
    await student.booking.cancel({ classId: CLASS });
    await student.booking.cancel({ classId: CLASS });
    expect(await agree()).toBe(0);
  });

  it("re-booking after cancel reclaims exactly one spot", async () => {
    const student = h.as(STUDENT, ACAD);
    await student.booking.book({ classId: CLASS });
    await student.booking.cancel({ classId: CLASS });
    await student.booking.book({ classId: CLASS });
    expect(await agree()).toBe(1);
  });

  it("a pending member books provisionally and is never counted", async () => {
    const res = await h.as(PENDING, ACAD).booking.book({ classId: CLASS });
    expect(res.tier).toBe("provisional");
    expect(await storedBookingCount(h.pg, CLASS)).toBe(0);
    expect(await confirmedBookings(h.pg, CLASS)).toBe(0);
    const mine = await h.as(PENDING, ACAD).booking.mine();
    expect(mine).toHaveLength(1);
  });

  it("check-in books and counts once", async () => {
    const res = await h.as(STUDENT, ACAD).checkin.checkIn({ classId: CLASS });
    expect(res.booked).toBe(true);
    expect(await agree()).toBe(1);
  });

  it("check-in after booking does not count again", async () => {
    const student = h.as(STUDENT, ACAD);
    await student.booking.book({ classId: CLASS });
    const res = await student.checkin.checkIn({ classId: CLASS });
    expect(res.booked).toBe(false);
    expect(await agree()).toBe(1);
  });

  it("checking in twice does not count again", async () => {
    const student = h.as(STUDENT, ACAD);
    await student.checkin.checkIn({ classId: CLASS });
    await student.checkin.checkIn({ classId: CLASS });
    expect(await agree()).toBe(1);
  });

  it("check-in after cancelling reclaims exactly one spot", async () => {
    const student = h.as(STUDENT, ACAD);
    await student.booking.book({ classId: CLASS });
    await student.booking.cancel({ classId: CLASS });
    await student.checkin.checkIn({ classId: CLASS });
    expect(await agree()).toBe(1);
  });

  it("a staff walk-in never moves the count", async () => {
    await h
      .as(OWNER, ACAD)
      .attendance.addWalkIn({ classId: CLASS, studentId: STUDENT });
    expect(await storedBookingCount(h.pg, CLASS)).toBe(0);
    expect(await confirmedBookings(h.pg, CLASS)).toBe(0);
  });

  it("the count the schedule reads matches the participations", async () => {
    await h.as(STUDENT, ACAD).booking.book({ classId: CLASS });
    await h.as(PENDING, ACAD).booking.book({ classId: CLASS });
    const [row] = await h.as(STUDENT, ACAD).class.mine({
      from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(row?.bookingCount).toBe(await confirmedBookings(h.pg, CLASS));
    expect(row?.bookingCount).toBe(1);
  });
});
