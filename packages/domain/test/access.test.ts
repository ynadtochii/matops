import { describe, expect, it } from "vitest";

import type { Membership } from "../src/access";
import { isActiveMember, isOwner, isStaff } from "../src/access";

const m = (role: string, status: string): Membership => ({ role, status });

describe("access predicates", () => {
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
});
