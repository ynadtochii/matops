import { describe, expect, it } from "vitest";

import type { BranchHealthFacts, SetupFacts } from "../src/organization-setup";
import {
  branchLaunchIssues,
  matchPeopleByEmail,
  organizationSetup,
  parseEmailList,
  setupProgress,
} from "../src/organization-setup";

const nothing: SetupFacts = {
  gymNamed: false,
  branches: 0,
  branchesLocated: 0,
  branchesScheduled: 0,
  instructors: 0,
  bankDetails: false,
  plans: 0,
  assignments: 0,
  uncoveredMembers: 0,
  invites: 0,
};

const done = (facts: SetupFacts, key: string) =>
  organizationSetup(facts).find((i) => i.key === key)?.done;
const blocked = (facts: SetupFacts, key: string) =>
  organizationSetup(facts).find((i) => i.key === key)?.blocked;

describe("organizationSetup", () => {
  it("gives ten items in the order the work happens", () => {
    expect(organizationSetup(nothing).map((i) => i.key)).toEqual([
      "gym",
      "branch",
      "location",
      "schedule",
      "staff",
      "bank",
      "plan",
      "assign",
      "ready",
      "invite",
    ]);
  });

  it("blocks everything that needs a branch until one exists", () => {
    const items = organizationSetup(nothing);
    const stuck = items.filter((i) => i.blocked).map((i) => i.key);
    expect(stuck).toEqual([
      "location",
      "schedule",
      "staff",
      "plan",
      "assign",
      "ready",
      "invite",
    ]);
  });

  it("unblocks branch work as soon as there is a branch", () => {
    const one = { ...nothing, branches: 1 };
    expect(blocked(one, "schedule")).toBe(false);
    expect(blocked(one, "staff")).toBe(false);
    expect(blocked(one, "invite")).toBe(false);
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

  it("keeps bank details free of the branch, since the gym is paid once", () => {
    expect(blocked(nothing, "bank")).toBe(false);
    expect(done({ ...nothing, bankDetails: true }, "bank")).toBe(true);
  });

  it("blocks assignment until a plan exists", () => {
    expect(blocked({ ...nothing, branches: 1 }, "assign")).toBe(true);
    expect(blocked({ ...nothing, branches: 1, plans: 1 }, "assign")).toBe(
      false,
    );
  });

  it("does not call an empty gym ready", () => {
    const empty = { ...nothing, branches: 1, plans: 1 };
    expect(done(empty, "ready")).toBe(false);
    expect(blocked(empty, "ready")).toBe(true);
  });

  it("is ready when somebody is assigned and nobody is uncovered", () => {
    const covered = { ...nothing, branches: 1, plans: 1, assignments: 3 };
    expect(done(covered, "ready")).toBe(true);
    expect(done({ ...covered, uncoveredMembers: 1 }, "ready")).toBe(false);
  });
});

describe("setupProgress", () => {
  it("counts nothing done for a gym that has just been made", () => {
    expect(setupProgress(organizationSetup(nothing))).toEqual({
      done: 0,
      total: 10,
      complete: false,
    });
  });

  it("is complete only when every item is done", () => {
    const all: SetupFacts = {
      gymNamed: true,
      branches: 1,
      branchesLocated: 1,
      branchesScheduled: 1,
      instructors: 1,
      bankDetails: true,
      plans: 1,
      assignments: 2,
      uncoveredMembers: 0,
      invites: 1,
    };
    expect(setupProgress(organizationSetup(all))).toEqual({
      done: 10,
      total: 10,
      complete: true,
    });
    expect(
      setupProgress(organizationSetup({ ...all, invites: 0 })).complete,
    ).toBe(false);
  });
});

const ready: BranchHealthFacts = {
  scheduled: true,
  staffed: true,
  enforced: true,
  uncovered: 0,
  planCovers: true,
  bjj: true,
  publicBookingEnabled: false,
  publicClasses: 0,
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

  it("flags public booking that is on with nothing shared, and nothing else", () => {
    expect(
      branchLaunchIssues({ ...ready, publicBookingEnabled: true }),
    ).toEqual(["public"]);
    // Off is a decision, not a gap: an academy that never wanted a public page
    // is not missing anything.
    expect(
      branchLaunchIssues({ ...ready, publicBookingEnabled: false }),
    ).toEqual([]);
    expect(
      branchLaunchIssues({
        ...ready,
        publicBookingEnabled: true,
        publicClasses: 2,
      }),
    ).toEqual([]);
  });

  it("never asks a general space about public classes", () => {
    expect(
      branchLaunchIssues({
        ...ready,
        bjj: false,
        publicBookingEnabled: true,
        publicClasses: 0,
      }),
    ).toEqual([]);
  });
});

describe("parseEmailList", () => {
  it("takes whatever a spreadsheet hands over", () => {
    expect(
      parseEmailList('email\nana@x.com, bea@x.com;"cy@x.com"\n\n'),
    ).toEqual(["ana@x.com", "bea@x.com", "cy@x.com"]);
  });

  it("lower-cases and drops repeats, so one person is one line", () => {
    expect(parseEmailList("Ana@X.com ana@x.com")).toEqual(["ana@x.com"]);
  });

  it("ignores words that are not addresses, like a header row", () => {
    expect(parseEmailList("name email\nana@x.com")).toEqual(["ana@x.com"]);
  });

  it("has nothing to say about an empty paste", () => {
    expect(parseEmailList("   \n ")).toEqual([]);
  });
});

describe("matchPeopleByEmail", () => {
  const people = [
    { userId: "u_ana", email: "Ana@x.com" },
    { userId: "u_bea", email: "bea@x.com" },
  ];

  it("finds people whatever case the paste used", () => {
    expect(matchPeopleByEmail(people, ["ana@x.com"])).toEqual({
      matched: ["u_ana"],
      unmatched: [],
    });
  });

  it("names what it could not find rather than dropping it", () => {
    expect(matchPeopleByEmail(people, ["bea@x.com", "nobody@x.com"])).toEqual({
      matched: ["u_bea"],
      unmatched: ["nobody@x.com"],
    });
  });
});
