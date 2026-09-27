import { describe, expect, it } from "vitest";

import type { BranchHealthFacts, SetupFacts } from "../src/organization-setup";
import {
  branchLaunchIssues,
  organizationSetup,
  setupProgress,
} from "../src/organization-setup";

const nothing: SetupFacts = {
  branches: 0,
  branchesLocated: 0,
  branchesScheduled: 0,
  invites: 0,
  activeStudents: 0,
  bookings: 0,
  paymentsOn: false,
  bankDetails: false,
  paidPlans: 0,
  plans: 0,
  assignments: 0,
  uncoveredMembers: 0,
};

const keys = (facts: SetupFacts) => organizationSetup(facts).map((i) => i.key);
const done = (facts: SetupFacts, key: string) =>
  organizationSetup(facts).find((i) => i.key === key)?.done;
const blocked = (facts: SetupFacts, key: string) =>
  organizationSetup(facts).find((i) => i.key === key)?.blocked;

describe("organizationSetup", () => {
  it("runs from the academy to the first booking, with no payment step", () => {
    expect(keys(nothing)).toEqual([
      "branch",
      "location",
      "schedule",
      "invite",
      "approve",
      "booking",
    ]);
  });

  it("has no separate instructor step, so a solo owner can finish", () => {
    const solo = {
      ...nothing,
      branches: 1,
      branchesLocated: 1,
      branchesScheduled: 1,
      invites: 1,
      activeStudents: 1,
      bookings: 1,
    };
    expect(setupProgress(organizationSetup(solo))).toEqual({
      done: 6,
      total: 6,
      complete: true,
    });
  });

  it("blocks everything that needs an academy until one exists", () => {
    const stuck = organizationSetup(nothing)
      .filter((i) => i.blocked)
      .map((i) => i.key);
    expect(stuck).toEqual([
      "location",
      "schedule",
      "invite",
      "approve",
      "booking",
    ]);
  });

  it("blocks the first booking until there is a class and a student", () => {
    const one = { ...nothing, branches: 1 };
    expect(blocked(one, "booking")).toBe(true);
    expect(blocked({ ...one, branchesScheduled: 1 }, "booking")).toBe(true);
    expect(
      blocked({ ...one, branchesScheduled: 1, activeStudents: 1 }, "booking"),
    ).toBe(false);
  });

  it("wants the place and zone on EVERY branch, not just one", () => {
    expect(
      done({ ...nothing, branches: 2, branchesLocated: 1 }, "location"),
    ).toBe(false);
    expect(
      done({ ...nothing, branches: 2, branchesLocated: 2 }, "location"),
    ).toBe(true);
  });

  it("wants a schedule at every branch too", () => {
    expect(
      done({ ...nothing, branches: 2, branchesScheduled: 1 }, "schedule"),
    ).toBe(false);
    expect(
      done({ ...nothing, branches: 2, branchesScheduled: 2 }, "schedule"),
    ).toBe(true);
  });

  it("adds the plan steps only while a branch requires payment", () => {
    const paying = { ...nothing, branches: 1, paymentsOn: true };
    expect(keys(paying)).toEqual([
      "branch",
      "location",
      "schedule",
      "invite",
      "approve",
      "booking",
      "plan",
      "assign",
      "ready",
    ]);
    expect(keys({ ...paying, plans: 1, paidPlans: 1 })).toContain("bank");
    expect(
      done({ ...paying, plans: 1, paidPlans: 1, bankDetails: true }, "bank"),
    ).toBe(true);
  });

  it("blocks assignment until a plan exists", () => {
    const paying = { ...nothing, branches: 1, paymentsOn: true };
    expect(blocked(paying, "assign")).toBe(true);
    expect(blocked({ ...paying, plans: 1 }, "assign")).toBe(false);
  });

  it("is ready when somebody is assigned and nobody is uncovered", () => {
    const covered = {
      ...nothing,
      branches: 1,
      paymentsOn: true,
      plans: 1,
      assignments: 3,
    };
    expect(done(covered, "ready")).toBe(true);
    expect(done({ ...covered, uncoveredMembers: 1 }, "ready")).toBe(false);
  });
});

describe("setupProgress", () => {
  it("counts nothing done for a gym that has just been made", () => {
    expect(setupProgress(organizationSetup(nothing))).toEqual({
      done: 0,
      total: 6,
      complete: false,
    });
  });
});

const ready: BranchHealthFacts = {
  scheduled: true,
  staffed: true,
  enforced: true,
  uncovered: 0,
  planCovers: true,
};

describe("branchLaunchIssues", () => {
  it("says nothing about a branch that is ready", () => {
    expect(branchLaunchIssues(ready)).toEqual([]);
  });

  it("names a missing schedule and a missing instructor", () => {
    expect(
      branchLaunchIssues({ ...ready, scheduled: false, staffed: false }),
    ).toEqual(["schedule", "staff"]);
  });

  it("asks about memberships only where the branch runs on them", () => {
    expect(
      branchLaunchIssues({ ...ready, planCovers: false, uncovered: 4 }),
    ).toEqual(["membership", "covered"]);
    expect(
      branchLaunchIssues({
        ...ready,
        enforced: false,
        planCovers: false,
        uncovered: 4,
      }),
    ).toEqual([]);
  });
});
