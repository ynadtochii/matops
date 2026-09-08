import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, eq } from "@matops/db";
import { classParticipation, member } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, seedAcademies, seedClasses } from "./helpers";

const ORG = "acad_review";
const BOSS = "u_review_owner";
const ALEX = "u_review_alex";
const NEXT_WEEK = "cccccccc-0000-4000-8000-000000000101";

describe("bookings that need a review, not a cancellation", () => {
  let h: Harness;
  let plan: string;
  let held: string;

  const owner = () => h.as(BOSS, ORG);

  const bookingStatus = async () => {
    const [row] = await h.exec
      .select({ status: classParticipation.bookingStatus })
      .from(classParticipation)
      .where(
        and(
          eq(classParticipation.classId, NEXT_WEEK),
          eq(classParticipation.studentId, ALEX),
        ),
      );
    return row?.status;
  };

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700094",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: ALEX, role: "student", status: "active" },
          { userId: "review_coach", role: "instructor", status: "active" },
          { userId: "review_manager", role: "student", status: "suspended" },
        ],
      },
    ]);
    await owner().accessPlan.setPolicy({
      graceDays: 7,
      calendarTimeZone: "UTC",
      bankDetails: "IBAN",
    });
    plan = (
      await owner().accessPlan.create({
        name: "Mat",
        entityIds: [ORG],
        priceMinor: 5000,
        currency: "EUR",
      })
    ).id;
    held = (await owner().accessPlan.assign({ userId: ALEX, planId: plan })).id;

    await seedClasses(h.pg, [
      {
        id: NEXT_WEEK,
        academyId: ORG,
        instructorId: BOSS,
        startsInMinutes: 60 * 24 * 7,
      },
    ]);
    await h.as(ALEX, ORG).booking.book({ classId: NEXT_WEEK });
  });

  afterAll(() => h.close());

  it("has nothing to review while the membership covers them", async () => {
    const seen = await owner().accessPlan.bookingsToReview({ limit: 50 });
    expect(seen.items).toEqual([]);
  });

  it("keeps the booking when the membership ends", async () => {
    await owner().accessPlan.cancel({ id: held });
    expect(await bookingStatus()).toBe("booked");
  });

  it("names the booking instead, with the reason", async () => {
    const seen = await owner().accessPlan.bookingsToReview({ limit: 50 });
    expect(seen.items.map((b) => [b.userId, b.classId, b.reason])).toEqual([
      [ALEX, NEXT_WEEK, "membership-inactive"],
    ]);
  });

  it("drops the item again when coverage comes back, with no second write", async () => {
    await owner().accessPlan.assign({ userId: ALEX, planId: plan });
    const seen = await owner().accessPlan.bookingsToReview({ limit: 50 });
    expect(seen.items).toEqual([]);
    expect(await bookingStatus()).toBe("booked");
  });

  it("excludes an active instructor booking without coverage", async () => {
    await h.exec.insert(classParticipation).values({
      academyId: ORG,
      classId: NEXT_WEEK,
      studentId: "review_coach",
      bookingStatus: "booked",
      bookingTier: "confirmed",
    });
    const seen = await owner().accessPlan.bookingsToReview({
      limit: 50,
      userId: "review_coach",
    });
    expect(seen.items).toEqual([]);
  });

  it("inherits manager access despite a suspended local relationship", async () => {
    await h.exec
      .update(member)
      .set({ role: "manager" })
      .where(
        and(
          eq(member.userId, "review_manager"),
          eq(member.organizationId, ORG),
        ),
      );
    await h.exec.insert(classParticipation).values({
      academyId: ORG,
      classId: NEXT_WEEK,
      studentId: "review_manager",
      bookingStatus: "booked",
      bookingTier: "confirmed",
    });
    const seen = await owner().accessPlan.bookingsToReview({
      limit: 50,
      userId: "review_manager",
    });
    expect(seen.items).toEqual([]);
  });
});
