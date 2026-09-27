import { describe, expect, it } from "vitest";

import type { MemberRow } from "../src/membership";
import {
  activeOwnerCount,
  approveMembership,
  canApprove,
  canDecideSeat,
  canRemoveOrDemote,
  isPendingCoach,
  isStudentLensMembership,
  wouldLeaveOwnerless,
} from "../src/membership";

const rm = (id: string, role: string, status: string): MemberRow => ({
  id,
  role,
  status,
});

describe("approval transition", () => {
  it("grants the invited role and activates a pending member", () => {
    expect(
      approveMembership({ status: "pending", invitedRole: "student" }),
    ).toEqual({ role: "student", status: "active" });
    expect(
      approveMembership({ status: "pending", invitedRole: "instructor" }),
    ).toEqual({ role: "instructor", status: "active" });
  });

  it("falls back to student when no invited role was recorded", () => {
    expect(approveMembership({ status: "pending", invitedRole: null })).toEqual(
      {
        role: "student",
        status: "active",
      },
    );
  });

  it("only pending members can be approved", () => {
    expect(canApprove({ status: "pending" })).toBe(true);
    expect(canApprove({ status: "active" })).toBe(false);
    expect(canApprove({ status: "suspended" })).toBe(false);
  });
});

describe("never ownerless", () => {
  it("counts only ACTIVE owners", () => {
    const members = [
      rm("a", "owner", "active"),
      rm("b", "owner", "pending"), // pending owner does not count
      rm("c", "instructor", "active"),
    ];
    expect(activeOwnerCount(members)).toBe(1);
  });

  it("blocks removing/demoting the last active owner", () => {
    const members = [rm("a", "owner", "active"), rm("b", "student", "active")];
    expect(wouldLeaveOwnerless(members, "a")).toBe(true);
    expect(canRemoveOrDemote(members, "a")).toBe(false);
  });

  it("allows dropping an owner when a co-owner remains", () => {
    const members = [
      rm("a", "owner", "active"),
      rm("b", "owner", "active"),
      rm("c", "student", "active"),
    ];
    expect(canRemoveOrDemote(members, "a")).toBe(true);
    expect(canRemoveOrDemote(members, "b")).toBe(true);
  });

  it("removing a non-owner is always allowed", () => {
    const members = [rm("a", "owner", "active"), rm("b", "student", "active")];
    expect(canRemoveOrDemote(members, "b")).toBe(true);
  });

  it("an unknown target never blocks (nothing to leave ownerless)", () => {
    const members = [rm("a", "owner", "active")];
    expect(canRemoveOrDemote(members, "zzz")).toBe(true);
  });
});

describe("owner step-down (demote → instructor)", () => {
  // Demote reuses `canRemoveOrDemote`: stepping an owner down to instructor is
  // only allowed while a co-owner remains, so the gym is never left ownerless.
  it("blocks stepping down the only active owner", () => {
    const members = [
      rm("a", "owner", "active"),
      rm("b", "instructor", "active"),
    ];
    expect(canRemoveOrDemote(members, "a")).toBe(false);
  });

  it("allows stepping down an owner when a co-owner remains", () => {
    const members = [
      rm("a", "owner", "active"),
      rm("b", "owner", "active"),
      rm("c", "instructor", "active"),
    ];
    expect(canRemoveOrDemote(members, "a")).toBe(true);
  });
});

describe("student lens (docs/issues/18)", () => {
  it("includes active students and pending students", () => {
    expect(isStudentLensMembership({ role: "student" })).toBe(true);
    expect(
      isStudentLensMembership({ role: "member", invitedRole: "student" }),
    ).toBe(true);
  });

  it("excludes owners, instructors, and pending instructors", () => {
    expect(isStudentLensMembership({ role: "owner" })).toBe(false);
    expect(isStudentLensMembership({ role: "instructor" })).toBe(false);
    expect(
      isStudentLensMembership({ role: "member", invitedRole: "instructor" }),
    ).toBe(false);
  });
});

describe("pending coach requests", () => {
  it("is a pending member invited as an instructor", () => {
    expect(
      isPendingCoach({ status: "pending", invitedRole: "instructor" }),
    ).toBe(true);
  });

  it("is not a pending student, nor an approved instructor", () => {
    expect(isPendingCoach({ status: "pending", invitedRole: "student" })).toBe(
      false,
    );
    expect(isPendingCoach({ status: "pending", invitedRole: null })).toBe(
      false,
    );
    expect(
      isPendingCoach({ status: "active", invitedRole: "instructor" }),
    ).toBe(false);
  });
});

describe("who may decide a pending seat", () => {
  const owner = { role: "owner", status: "active" };
  const coach = { role: "instructor", status: "active" };
  const coachSeat = { status: "pending", invitedRole: "instructor" };
  const studentSeat = { status: "pending", invitedRole: "student" };

  it("lets an instructor clear the student queue", () => {
    expect(canDecideSeat(coach, studentSeat)).toBe(true);
    expect(canDecideSeat(owner, studentSeat)).toBe(true);
  });

  it("keeps the coach queue owner-only, so staff cannot mint instructors", () => {
    expect(canDecideSeat(coach, coachSeat)).toBe(false);
    expect(canDecideSeat(owner, coachSeat)).toBe(true);
  });

  it("does not gate a seat that carries no invited role", () => {
    expect(canDecideSeat(coach, { status: "pending", invitedRole: null })).toBe(
      true,
    );
  });
});
