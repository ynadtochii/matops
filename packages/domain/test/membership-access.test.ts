import { describe, expect, it } from "vitest";

import type { ApplicableAssignment } from "../src/membership-access";
import {
  accessAdmits,
  accessReason,
  coveringAssignments,
  membershipAccess,
} from "../src/membership-access";

const MAT = "e_mat";
const GYM = "e_gym";
const NOW = new Date("2026-09-03T10:00:00Z");
const LATER = new Date("2026-09-20T10:00:00Z");
const DEADLINE = new Date("2026-09-08T00:00:00Z");

const holding = (
  over: Partial<ApplicableAssignment> & { id: string },
): ApplicableAssignment => ({
  status: "active",
  entityIds: [MAT],
  paid: false,
  deadline: DEADLINE,
  ...over,
});

const ask = (over: Partial<Parameters<typeof membershipAccess>[0]> = {}) =>
  membershipAccess({
    entityId: MAT,
    membership: { status: "active" },
    assignments: [holding({ id: "a1" })],
    at: NOW,
    ...over,
  });

describe("membershipAccess", () => {
  it("lets an approved, covered member in while the month is still open", () => {
    expect(ask()).toBe("ok");
  });

  it("lets a paid member in whatever the clock says", () => {
    expect(
      ask({ assignments: [holding({ id: "a1", paid: true })], at: LATER }),
    ).toBe("ok");
  });

  it("calls it expired once the deadline has passed", () => {
    expect(ask({ at: LATER })).toBe("expired");
  });

  it("keeps a branch suspension above everything else", () => {
    // Paid, covered, well inside the month, and still refused: the mat said no.
    expect(
      ask({
        membership: { status: "suspended" },
        assignments: [holding({ id: "a1", paid: true })],
      }),
    ).toBe("suspended");
  });

  it("treats archived and removed as the branch saying no too", () => {
    for (const status of ["archived", "removed"]) {
      expect([status, ask({ membership: { status } })]).toEqual([
        status,
        "suspended",
      ]);
    }
  });

  it("says pending approval before it says anything about money", () => {
    expect(ask({ membership: { status: "pending" }, at: LATER })).toBe(
      "pending-approval",
    );
  });

  it("says not covered when nothing of theirs names this branch", () => {
    expect(ask({ entityId: GYM })).toBe("not-covered");
    expect(ask({ assignments: [] })).toBe("not-covered");
  });

  it("ignores a suspended or cancelled membership entirely", () => {
    for (const status of ["suspended", "cancelled"] as const) {
      expect([
        status,
        ask({ assignments: [holding({ id: "a1", status, paid: true })] }),
      ]).toEqual([status, "not-covered"]);
    }
  });

  it("combines two memberships, so a second valid one keeps access", () => {
    const verdict = ask({
      at: LATER,
      assignments: [
        holding({ id: "expired-one" }),
        holding({ id: "good-one", paid: true }),
      ],
    });
    expect(verdict).toBe("ok");
  });

  it("does not let an expired third membership take access away", () => {
    const verdict = ask({
      at: LATER,
      assignments: [
        holding({ id: "good-one", paid: true, entityIds: [MAT, GYM] }),
        holding({ id: "dead-one", entityIds: [MAT] }),
      ],
    });
    expect(verdict).toBe("ok");
  });

  it("separates a month that ran out from a branch never covered", () => {
    expect(ask({ at: LATER })).toBe("expired");
    expect(ask({ at: LATER, entityId: GYM })).toBe("not-covered");
  });

  it("lets an owner with no membership row through on coverage alone", () => {
    expect(ask({ membership: null })).toBe("ok");
  });

  it("treats the deadline as the first moment too late", () => {
    expect(ask({ at: new Date(DEADLINE.getTime() - 1) })).toBe("ok");
    expect(ask({ at: DEADLINE })).toBe("expired");
  });
});

describe("coveringAssignments", () => {
  it("keeps only the active ones naming this branch", () => {
    const found = coveringAssignments({
      entityId: MAT,
      assignments: [
        holding({ id: "a1" }),
        holding({ id: "a2", status: "cancelled" }),
        holding({ id: "a3", entityIds: [GYM] }),
      ],
    });
    expect(found.map((a) => a.id)).toEqual(["a1"]);
  });
});

describe("accessAdmits and accessReason", () => {
  it("admits only ok", () => {
    expect(accessAdmits("ok")).toBe(true);
    for (const v of [
      "expired",
      "not-covered",
      "pending-approval",
      "suspended",
    ] as const) {
      expect([v, accessAdmits(v)]).toEqual([v, false]);
    }
  });

  it("says nothing for ok and something useful for the rest", () => {
    expect(accessReason("ok", "The Gym")).toBe("");
    for (const v of [
      "expired",
      "not-covered",
      "pending-approval",
      "suspended",
    ] as const) {
      expect(accessReason(v, "The Gym").length).toBeGreaterThan(10);
    }
  });

  it("names the branch where the branch is the problem", () => {
    expect(accessReason("not-covered", "The Gym")).toContain("The Gym");
    expect(accessReason("suspended", "The Gym")).toContain("The Gym");
  });
});
