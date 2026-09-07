import { describe, expect, it } from "vitest";

import type { Membership } from "../src/access";
import {
  canEnroll,
  isActiveMember,
  isArchived,
  isManager,
  isOnRoster,
  isOwner,
  isStaff,
  isStaffRole,
  isStudentMember,
  isSuspended,
  runsBranch,
  runsOrganization,
} from "../src/access";

const m = (role: string, status: string): Membership => ({ role, status });

describe("access predicates", () => {
  it("canEnroll: only pending and active may use the view-only tier", () => {
    for (const role of ["owner", "instructor", "student"]) {
      expect(canEnroll(m(role, "pending"))).toBe(true);
      expect(canEnroll(m(role, "active"))).toBe(true);
      // Suspended / removed keep a row for history but have no access.
      expect(canEnroll(m(role, "suspended"))).toBe(false);
      expect(canEnroll(m(role, "removed"))).toBe(false);
      expect(canEnroll(m(role, "archived"))).toBe(false);
    }
  });

  it("isArchived: only the members who left", () => {
    expect(isArchived(m("student", "archived"))).toBe(true);
    for (const status of ["pending", "active", "suspended", "removed"]) {
      expect(isArchived(m("student", status))).toBe(false);
    }
  });

  it("isOnRoster: archived and declined drop off, suspended stays", () => {
    for (const status of ["pending", "active", "suspended"]) {
      expect(isOnRoster(m("student", status))).toBe(true);
    }
    expect(isOnRoster(m("student", "archived"))).toBe(false);
    expect(isOnRoster(m("student", "removed"))).toBe(false);
  });

  it("an archived member is not suspended (restore covers both, the copy differs)", () => {
    expect(isSuspended(m("student", "archived"))).toBe(false);
    expect(isArchived(m("student", "suspended"))).toBe(false);
  });

  it("pending members are never active/staff/owner (view-only)", () => {
    for (const role of ["owner", "instructor", "student"]) {
      const pending = m(role, "pending");
      expect(isActiveMember(pending)).toBe(false);
      expect(isStaff(pending)).toBe(false);
      expect(isOwner(pending)).toBe(false);
    }
  });

  it("active student is a member but not staff/owner", () => {
    const s = m("student", "active");
    expect(isActiveMember(s)).toBe(true);
    expect(isStaff(s)).toBe(false);
    expect(isOwner(s)).toBe(false);
  });

  it("active instructor is staff but not owner", () => {
    const i = m("instructor", "active");
    expect(isStaff(i)).toBe(true);
    expect(isOwner(i)).toBe(false);
  });

  it("active owner is staff and owner", () => {
    const o = m("owner", "active");
    expect(isStaff(o)).toBe(true);
    expect(isOwner(o)).toBe(true);
  });

  it("isSuspended is true only for suspended rows (drives restore)", () => {
    for (const role of ["owner", "instructor", "student"]) {
      expect(isSuspended(m(role, "suspended"))).toBe(true);
      expect(isSuspended(m(role, "active"))).toBe(false);
      expect(isSuspended(m(role, "pending"))).toBe(false);
      expect(isSuspended(m(role, "removed"))).toBe(false);
    }
  });
});

describe("the gym manager", () => {
  it("runs the gym, like an owner does", () => {
    expect(runsOrganization({ role: "manager", status: "active" })).toBe(true);
    expect(runsOrganization({ role: "owner", status: "active" })).toBe(true);
  });

  it("is not an owner, which is what keeps the destructive half away", () => {
    expect(isOwner({ role: "manager", status: "active" })).toBe(false);
  });

  it("runs nothing until their membership is active", () => {
    expect(isManager({ role: "manager", status: "pending" })).toBe(false);
    expect(runsOrganization({ role: "manager", status: "suspended" })).toBe(
      false,
    );
  });

  it("leaves instructors and students where they were", () => {
    for (const role of ["instructor", "student"]) {
      expect([role, runsOrganization({ role, status: "active" })]).toEqual([
        role,
        false,
      ]);
    }
  });
});

describe("running one branch", () => {
  it("takes an owner or a manager", () => {
    expect(runsBranch({ role: "owner", status: "active" })).toBe(true);
    expect(runsBranch({ role: "manager", status: "active" })).toBe(true);
  });

  it("leaves the coach and the student out", () => {
    for (const role of ["instructor", "student"]) {
      expect([role, runsBranch({ role, status: "active" })]).toEqual([
        role,
        false,
      ]);
    }
  });

  it("counts a manager as staff, so the register opens", () => {
    expect(isStaff({ role: "manager", status: "active" })).toBe(true);
    expect(isStaff({ role: "manager", status: "pending" })).toBe(false);
  });
});

describe("roster classification", () => {
  it("keeps staff separate regardless of relationship status", () => {
    for (const role of ["owner", "manager", "instructor"]) {
      for (const status of [
        "active",
        "pending",
        "suspended",
        "archived",
        "removed",
      ]) {
        expect(isStaffRole(m(role, status))).toBe(true);
        expect(isStudentMember(m(role, status))).toBe(false);
      }
    }
  });

  it("classifies an instructor invitation as staff before approval", () => {
    const pending = {
      role: "student",
      status: "pending",
      invitedRole: "instructor",
    };
    expect(isStaffRole(pending)).toBe(true);
    expect(isStudentMember(pending)).toBe(false);
    expect(isStaff(pending)).toBe(false);
  });

  it("keeps a person's student role at another branch", () => {
    expect(isStudentMember(m("instructor", "active"))).toBe(false);
    expect(isStudentMember(m("student", "active"))).toBe(true);
  });
});

it("ignores an old coach invitation after a student transition", () => {
  const student = {
    role: "student",
    status: "active",
    invitedRole: "instructor",
  };
  expect(isStudentMember(student)).toBe(true);
  expect(isStaffRole(student)).toBe(false);
});

it("keeps unapproved student invitations in Members", () => {
  expect(
    isStudentMember({ role: "member", status: "pending", invitedRole: null }),
  ).toBe(true);
  expect(
    isStudentMember({
      role: "member",
      status: "pending",
      invitedRole: "student",
    }),
  ).toBe(true);
  expect(
    isStudentMember({
      role: "member",
      status: "pending",
      invitedRole: "instructor",
    }),
  ).toBe(false);
  expect(
    isStudentMember({
      role: "member",
      status: "active",
      invitedRole: "student",
    }),
  ).toBe(false);
});
