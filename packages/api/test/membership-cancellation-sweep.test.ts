import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, createEntity, eq } from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";

import type { Harness } from "./helpers";
import {
  runMembershipCancellationSweep,
  runMembershipReminderSweep,
} from "../src/membership-sweep";
import { harness, seedAcademies, seedClasses } from "./helpers";

const ORG = "acad_sweep";
const BOSS = "u_sweep_owner";
const ALEX = "u_sweep_alex";
const BEA = "u_sweep_bea";

const MAT_CLASS = "cccccccc-0000-4000-8000-000000000001";
const GYM_CLASS = "cccccccc-0000-4000-8000-000000000002";
const PAST_CLASS = "cccccccc-0000-4000-8000-000000000003";

/** A moment well past September's grace window, in any sane zone. */
const LATE_SEPTEMBER = new Date("2026-09-25T12:00:00Z");

describe("the membership cancellation sweep", () => {
  let h: Harness;
  let gym: string;
  let matOnly: string;
  let both: string;

  const owner = () => h.as(BOSS, ORG);

  const bookingStatus = async (
    classId: string,
    userId: string,
  ): Promise<string | undefined> => {
    const rows = await h.exec
      .select({ status: classParticipation.bookingStatus })
      .from(classParticipation)
      .where(
        and(
          eq(classParticipation.classId, classId),
          eq(classParticipation.studentId, userId),
        ),
      );
    return rows[0]?.status;
  };

  const bookingCount = async (classId: string): Promise<number> => {
    const rows = await h.exec
      .select({ n: classInstance.bookingCount })
      .from(classInstance)
      .where(eq(classInstance.id, classId));
    return rows[0]?.n ?? -1;
  };

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700086",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: ALEX, role: "student", status: "active" },
          { userId: BEA, role: "student", status: "active" },
        ],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "general_space",
        name: "The Gym",
        ownerUserId: BOSS,
      },
      h.exec,
    );
    gym = made.entityId;

    // Two plans: one covering the mat only, one covering both branches.
    matOnly = (
      await owner().accessPlan.create({ name: "Mat only", entityIds: [ORG] })
    ).id;
    both = (
      await owner().accessPlan.create({
        name: "Mat + Gym",
        entityIds: [ORG, gym],
      })
    ).id;

    const future = 60 * 24 * 40; // well past LATE_SEPTEMBER, still "future"
    await seedClasses(h.pg, [
      {
        id: MAT_CLASS,
        academyId: ORG,
        instructorId: BOSS,
        startsInMinutes: future,
      },
      {
        id: GYM_CLASS,
        academyId: gym,
        instructorId: BOSS,
        startsInMinutes: future,
      },
      {
        id: PAST_CLASS,
        academyId: ORG,
        instructorId: BOSS,
        startsInMinutes: -600,
      },
    ]);
  });

  afterAll(() => h.close());

  it("leaves a paid membership completely alone", async () => {
    const held = await owner().accessPlan.assign({
      userId: ALEX,
      planId: matOnly,
    });
    await owner().accessPlan.markMonth({
      assignmentId: held.id,
      month: "2026-09-01",
      paid: true,
    });

    const result = await runMembershipCancellationSweep(h.exec, {
      now: LATE_SEPTEMBER,
    });
    expect(result.blocked).toBe(0);
    expect(result.cancelled).toBe(0);
  });

  it("cancels a future booking once the month is unpaid past grace", async () => {
    await h.exec.insert(classParticipation).values({
      academyId: ORG,
      classId: MAT_CLASS,
      studentId: BEA,
      bookingStatus: "booked",
      bookingTier: "confirmed",
    });
    await h.exec
      .update(classInstance)
      .set({ bookingCount: 1 })
      .where(eq(classInstance.id, MAT_CLASS));

    await owner().accessPlan.assign({ userId: BEA, planId: matOnly });

    const result = await runMembershipCancellationSweep(h.exec, {
      now: LATE_SEPTEMBER,
    });
    expect(result.cancelled).toBe(1);
    expect(await bookingStatus(MAT_CLASS, BEA)).toBe("cancelled");
    expect(await bookingCount(MAT_CLASS)).toBe(0);
  });

  it("changes nothing at all when it runs again", async () => {
    const result = await runMembershipCancellationSweep(h.exec, {
      now: LATE_SEPTEMBER,
    });
    expect(result.cancelled).toBe(0);
    // The place was released once, not twice.
    expect(await bookingCount(MAT_CLASS)).toBe(0);
  });

  it("never touches a class that has already happened", async () => {
    await h.exec.insert(classParticipation).values({
      academyId: ORG,
      classId: PAST_CLASS,
      studentId: BEA,
      bookingStatus: "booked",
      bookingTier: "confirmed",
    });

    await runMembershipCancellationSweep(h.exec, { now: LATE_SEPTEMBER });
    expect(await bookingStatus(PAST_CLASS, BEA)).toBe("booked");
  });

  it("leaves a branch a second valid membership still covers", async () => {
    // Alex holds the paid Mat + Gym plan as well as an unpaid mat-only one, so
    // the mat stays reachable and the booking survives.
    const second = await owner().accessPlan.assign({
      userId: ALEX,
      planId: both,
    });
    await owner().accessPlan.markMonth({
      assignmentId: second.id,
      month: "2026-09-01",
      paid: true,
    });
    await h.exec.insert(classParticipation).values({
      academyId: gym,
      classId: GYM_CLASS,
      studentId: ALEX,
      bookingStatus: "booked",
      bookingTier: "confirmed",
    });

    await runMembershipCancellationSweep(h.exec, { now: LATE_SEPTEMBER });
    expect(await bookingStatus(GYM_CLASS, ALEX)).toBe("booked");
  });

  it("does not cancel when the month is paid between the scan and the write", async () => {
    // Marking it paid is exactly the race the in-transaction re-read defends.
    const held = await owner().accessPlan.forUser({ userId: BEA });
    const assignment = held[0];
    if (!assignment) throw new Error("expected a membership");

    await h.exec.insert(classParticipation).values({
      academyId: ORG,
      classId: GYM_CLASS,
      studentId: BEA,
      bookingStatus: "booked",
      bookingTier: "confirmed",
    });
    await owner().accessPlan.markMonth({
      assignmentId: assignment.id,
      month: "2026-09-01",
      paid: true,
    });

    const result = await runMembershipCancellationSweep(h.exec, {
      now: LATE_SEPTEMBER,
    });
    expect(result.cancelled).toBe(0);
  });
});

describe("the membership reminder sweep", () => {
  const ORG2 = "acad_warn";
  const BOSS = "u_warn_owner";
  const SAM = "u_warn_sam";
  let h: Harness;
  let gym: string;
  let plan: string;

  // Inside September's grace with the default seven days, and comfortably
  // after the 1st so a first-of-month join is already in its window.
  const EARLY_SEPTEMBER = new Date("2026-09-03T09:00:00Z");
  const owner = () => h.as(BOSS, ORG2);

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG2,
        code: "700087",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: SAM, role: "student", status: "active" },
        ],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG2,
        type: "general_space",
        name: "The Gym",
        ownerUserId: BOSS,
      },
      h.exec,
    );
    gym = made.entityId;
    plan = (
      await owner().accessPlan.create({
        name: "Mat + Gym",
        entityIds: [ORG2, gym],
      })
    ).id;
    await owner().accessPlan.assign({
      userId: SAM,
      planId: plan,
      assigningEntityId: ORG2,
      startMonth: "2026-09-01",
    });
  });

  afterAll(() => h.close());

  const inboxCount = async (): Promise<number> => {
    const res = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "notification" WHERE kind = 'membership_due'`,
    );
    return res.rows[0]?.n ?? -1;
  };

  it("warns once, and files it against ONE branch though the plan covers two", async () => {
    const sent: unknown[] = [];
    const result = await runMembershipReminderSweep(h.exec, {
      now: EARLY_SEPTEMBER,
      send: (messages) => {
        sent.push(...messages);
        return Promise.resolve({ sent: messages.length, invalidTokens: [] });
      },
    });
    expect(result.sent).toBe(1);
    expect(await inboxCount()).toBe(1);
  });

  it("tells nobody twice, however often it runs", async () => {
    const again = await runMembershipReminderSweep(h.exec, {
      now: EARLY_SEPTEMBER,
    });
    expect(again.sent).toBe(0);
    expect(await inboxCount()).toBe(1);
  });

  it("leaves the month unpaid after claiming it", async () => {
    const res = await h.pg.query<{ paid: boolean; reminded: string | null }>(
      `SELECT paid, reminded_at AS reminded FROM "membership_month"`,
    );
    expect(res.rows[0]?.paid).toBe(false);
    expect(res.rows[0]?.reminded).toBeTruthy();
  });

  it("says nothing about a month that is already paid", async () => {
    const held = await owner().accessPlan.forUser({ userId: SAM });
    const assignment = held[0];
    if (!assignment) throw new Error("expected a membership");
    await owner().accessPlan.markMonth({
      assignmentId: assignment.id,
      month: "2026-10-01",
      paid: true,
    });

    const result = await runMembershipReminderSweep(h.exec, {
      now: new Date("2026-10-03T09:00:00Z"),
    });
    expect(result.sent).toBe(0);
  });

  it("says nothing once the deadline has passed, where the warning is moot", async () => {
    const result = await runMembershipReminderSweep(h.exec, {
      now: new Date("2026-11-25T09:00:00Z"),
    });
    expect(result.sent).toBe(0);
  });
});
