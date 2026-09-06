import { describe, expect, it } from "vitest";

import type { DirectoryEntry } from "../src/member-directory";
import {
  combineDirectory,
  matchesDirectoryFilter,
  pendingCoachCount,
  staffRows,
} from "../src/member-directory";

const entry = (
  over: Partial<DirectoryEntry> & { entityId: string; userId: string },
): DirectoryEntry => ({
  entityName: over.entityId === "e_gym" ? "The Gym" : "The Mat",
  memberId: `mem_${over.entityId}_${over.userId}`,
  name: "Alex",
  email: "alex@test.local",
  status: "active",
  role: "student",
  invitedRole: null,
  covered: true,
  planNames: ["Mat + Gym"],
  verdict: "ok",
  recentVisits: 0,
  ...over,
});

describe("combineDirectory", () => {
  it("gives one row to a person who trains at two branches", () => {
    const rows = combineDirectory([
      entry({ entityId: "e_mat", userId: "u_alex", recentVisits: 3 }),
      entry({ entityId: "e_gym", userId: "u_alex", recentVisits: 2 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.branches.map((b) => b.entityName)).toEqual([
      "The Gym",
      "The Mat",
    ]);
  });

  it("adds attendance into the person's own total, keeping the branch figures", () => {
    const rows = combineDirectory([
      entry({ entityId: "e_mat", userId: "u_alex", recentVisits: 3 }),
      entry({ entityId: "e_gym", userId: "u_alex", recentVisits: 2 }),
    ]);
    expect(rows[0]?.recentVisits).toBe(5);
    expect(rows[0]?.branches.map((b) => b.recentVisits)).toEqual([2, 3]);
  });

  it("never merges two people who share a name", () => {
    const rows = combineDirectory([
      entry({ entityId: "e_mat", userId: "u_one", name: "Ana Silva" }),
      entry({ entityId: "e_gym", userId: "u_two", name: "Ana Silva" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.userId).sort()).toEqual(["u_one", "u_two"]);
  });

  it("deduplicates the plans covering them anywhere", () => {
    const rows = combineDirectory([
      entry({ entityId: "e_mat", userId: "u_alex", planNames: ["Mat + Gym"] }),
      entry({
        entityId: "e_gym",
        userId: "u_alex",
        planNames: ["Mat + Gym", "Sauna"],
      }),
    ]);
    expect(rows[0]?.planNames).toEqual(["Mat + Gym", "Sauna"]);
  });

  it("orders people by name and keeps their branches ordered too", () => {
    const rows = combineDirectory([
      entry({ entityId: "e_mat", userId: "u_z", name: "Zoe" }),
      entry({ entityId: "e_gym", userId: "u_a", name: "Ana" }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Ana", "Zoe"]);
  });

  it("has nothing to say about nobody", () => {
    expect(combineDirectory([])).toEqual([]);
  });
});

describe("matchesDirectoryFilter", () => {
  const [row] = combineDirectory([
    entry({ entityId: "e_mat", userId: "u_alex", status: "active" }),
    entry({
      entityId: "e_gym",
      userId: "u_alex",
      status: "suspended",
      planNames: ["Sauna"],
    }),
  ]);
  if (!row) throw new Error("expected a directory row");

  it("keeps everybody when nothing is set", () => {
    expect(matchesDirectoryFilter(row, {})).toBe(true);
  });

  it("filters by a branch they belong to", () => {
    expect(matchesDirectoryFilter(row, { entityId: "e_gym" })).toBe(true);
    expect(matchesDirectoryFilter(row, { entityId: "e_other" })).toBe(false);
  });

  it("filters by a plan covering them anywhere", () => {
    expect(matchesDirectoryFilter(row, { planName: "Sauna" })).toBe(true);
    expect(matchesDirectoryFilter(row, { planName: "Nothing" })).toBe(false);
  });

  it("filters by a status they hold at any branch", () => {
    expect(matchesDirectoryFilter(row, { status: "suspended" })).toBe(true);
    expect(matchesDirectoryFilter(row, { status: "pending" })).toBe(false);
  });

  it("requires every filter set to match, not just one", () => {
    expect(
      matchesDirectoryFilter(row, { entityId: "e_mat", status: "pending" }),
    ).toBe(false);
  });
});

describe("staffRows", () => {
  const rows = () =>
    combineDirectory([
      entry({ entityId: "e_mat", userId: "u_boss", role: "owner" }),
      entry({ entityId: "e_gym", userId: "u_boss", role: "student" }),
      entry({ entityId: "e_mat", userId: "u_sam", role: "student" }),
      entry({
        entityId: "e_gym",
        userId: "u_lee",
        role: "student",
        status: "pending",
        invitedRole: "instructor",
      }),
      entry({
        entityId: "e_mat",
        userId: "u_kim",
        role: "student",
        status: "pending",
        invitedRole: "student",
      }),
    ]);

  it("keeps an owner at one branch and a student at another", () => {
    const staff = staffRows(rows());
    expect(staff.map((r) => r.userId)).toContain("u_boss");
  });

  it("drops somebody who is only ever a student", () => {
    expect(staffRows(rows()).map((r) => r.userId)).not.toContain("u_sam");
  });

  it("keeps a pending coach request", () => {
    expect(staffRows(rows()).map((r) => r.userId)).toContain("u_lee");
  });

  it("drops a pending student", () => {
    expect(staffRows(rows()).map((r) => r.userId)).not.toContain("u_kim");
  });

  it("gives one row two branch badges for one person", () => {
    const boss = staffRows(rows()).find((r) => r.userId === "u_boss");
    expect(boss?.branches).toHaveLength(2);
  });

  it("counts one badge per waiting branch, not per person", () => {
    const waiting = combineDirectory([
      entry({
        entityId: "e_mat",
        userId: "u_lee",
        status: "pending",
        invitedRole: "instructor",
      }),
      entry({
        entityId: "e_gym",
        userId: "u_lee",
        status: "pending",
        invitedRole: "instructor",
      }),
    ]);
    expect(pendingCoachCount(waiting)).toBe(2);
  });

  it("counts the coach seats and never the student ones", () => {
    expect(pendingCoachCount(rows())).toBe(1);
  });
});

it("keeps suspended and archived instructors in Staff", () => {
  const rows = combineDirectory([
    entry({
      entityId: "e_mat",
      userId: "suspended",
      role: "instructor",
      status: "suspended",
    }),
    entry({
      entityId: "e_mat",
      userId: "archived",
      role: "instructor",
      status: "archived",
    }),
  ]);
  expect(staffRows(rows)).toHaveLength(2);
});

it("represents an organization manager without a branch membership", () => {
  const rows = combineDirectory([
    entry({
      entityId: "e_mat",
      userId: "manager",
      role: "manager",
      memberId: null,
    }),
  ]);
  expect(staffRows(rows)[0]?.branches[0]?.memberId).toBeNull();
});
