import { describe, expect, it } from "vitest";

import type { Membership } from "../src/access";
import {
  canEnroll,
  isActiveMember,
  isArchived,
  isOnRoster,
  isOwner,
  isStaff,
  isSuspended,
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
