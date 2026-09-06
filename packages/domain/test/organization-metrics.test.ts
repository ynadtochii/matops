import { describe, expect, it } from "vitest";

import type { EntityMetricInput } from "../src/organization-metrics";
import { organizationMetrics } from "../src/organization-metrics";

const WINDOW = {
  from: new Date("2026-09-01T00:00:00Z"),
  to: new Date("2026-10-01T00:00:00Z"),
};
const OLD = new Date("2025-01-01T00:00:00Z");
const INSIDE = new Date("2026-09-10T00:00:00Z");

const branch = (
  over: Partial<EntityMetricInput> & { entityId: string },
): EntityMetricInput => ({
  entityName: over.entityId === "e_gym" ? "The Gym" : "The Mat",
  activated: true,
  members: [],
  eligibleUserIds: [],
  attendedUserIds: [],
  visits: 0,
  sessions: [],
  ...over,
});

const student = (userId: string, joinedAt = OLD) => ({
  userId,
  role: "student",
  status: "active",
  joinedAt,
});

const NO_PAYMENT = { paid: 0, withinGrace: 0, blocked: 0 };

describe("organizationMetrics", () => {
  it("counts a person once however many branches they train at", () => {
    const m = organizationMetrics(
      [
        branch({ entityId: "e_mat", members: [student("u_alex")] }),
        branch({ entityId: "e_gym", members: [student("u_alex")] }),
      ],
      NO_PAYMENT,
      WINDOW,
    );
    expect(m.enrolledMembers).toBe(1);
    // And the branch figures still say two, labelled as enrolments.
    expect(m.enrolmentsByBranch.map((b) => b.count)).toEqual([1, 1]);
  });

  it("leaves staff and unapproved people out of the member count", () => {
    const m = organizationMetrics(
      [
        branch({
          entityId: "e_mat",
          members: [
            student("u_alex"),
            {
              userId: "u_coach",
              role: "instructor",
              status: "active",
              joinedAt: OLD,
            },
            {
              userId: "u_wait",
              role: "student",
              status: "pending",
              joinedAt: OLD,
            },
            {
              userId: "u_gone",
              role: "student",
              status: "archived",
              joinedAt: OLD,
            },
          ],
        }),
      ],
      NO_PAYMENT,
      WINDOW,
    );
    expect(m.enrolledMembers).toBe(1);
  });

  it("does not sum branch access totals into the people total", () => {
    const m = organizationMetrics(
      [
        branch({ entityId: "e_mat", eligibleUserIds: ["u_alex"] }),
        branch({ entityId: "e_gym", eligibleUserIds: ["u_alex", "u_bea"] }),
      ],
      NO_PAYMENT,
      WINDOW,
    );
    expect(m.membersWithAccess).toBe(2);
  });

  it("counts attendance as people once and as visits per branch", () => {
    const m = organizationMetrics(
      [
        branch({
          entityId: "e_mat",
          attendedUserIds: ["u_alex"],
          visits: 4,
        }),
        branch({
          entityId: "e_gym",
          attendedUserIds: ["u_alex", "u_bea"],
          visits: 3,
        }),
      ],
      NO_PAYMENT,
      WINDOW,
    );
    expect(m.membersAttended).toBe(2);
    expect(m.attendanceByBranch.map((b) => b.count)).toEqual([4, 3]);
  });

  it("calls somebody new only when their FIRST place anywhere is in the window", () => {
    // Alex joined the mat long ago and the gym this month: not new.
    // Bea joined only this month: new.
    const m = organizationMetrics(
      [
        branch({
          entityId: "e_mat",
          members: [student("u_alex", OLD)],
        }),
        branch({
          entityId: "e_gym",
          members: [student("u_alex", INSIDE), student("u_bea", INSIDE)],
        }),
      ],
      NO_PAYMENT,
      WINDOW,
    );
    expect(m.newMembers).toBe(1);
  });

  it("leaves an unlimited session out of the use ratio", () => {
    const m = organizationMetrics(
      [
        branch({
          entityId: "e_gym",
          sessions: [
            { capacity: 10, reserved: 4 },
            { capacity: 0, reserved: 30 },
          ],
        }),
      ],
      NO_PAYMENT,
      WINDOW,
    );
    expect(m.sessionUse[0]).toEqual({
      entityId: "e_gym",
      entityName: "The Gym",
      reserved: 4,
      places: 10,
    });
  });

  it("passes the payment tally through, counted once per membership", () => {
    const m = organizationMetrics(
      [],
      { paid: 3, withinGrace: 1, blocked: 2 },
      WINDOW,
    );
    expect(m.payment).toEqual({ paid: 3, withinGrace: 1, blocked: 2 });
  });

  it("has sensible answers for an organization with nothing in it", () => {
    const m = organizationMetrics([], NO_PAYMENT, WINDOW);
    expect([
      m.enrolledMembers,
      m.membersWithAccess,
      m.membersAttended,
      m.newMembers,
    ]).toEqual([0, 0, 0, 0]);
    expect(m.attendanceByBranch).toEqual([]);
  });
});
