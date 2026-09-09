import { describe, expect, it } from "vitest";

import { canEnroll, isStaff } from "../src/access";
import { canReadCoachFigures } from "../src/coach";

const owner = { role: "owner", status: "active" };
const instructor = { role: "instructor", status: "active" };
const student = { role: "student", status: "active" };
describe("canReadCoachFigures", () => {
  it("lets anyone open their own", () => {
    expect(canReadCoachFigures(instructor, "u2", "u2")).toBe(true);
  });

  it("lets an owner open someone else's", () => {
    expect(canReadCoachFigures(owner, "u2", "u1")).toBe(true);
  });

  it("refuses an instructor reading another coach", () => {
    expect(canReadCoachFigures(instructor, "u1", "u2")).toBe(false);
  });
});

describe("the predicates the routers filter with", () => {
  it("canEnroll admits pending and active, nothing else", () => {
    expect(canEnroll({ ...student, status: "pending" })).toBe(true);
    expect(canEnroll(student)).toBe(true);
    expect(canEnroll({ ...student, status: "suspended" })).toBe(false);
    expect(canEnroll({ ...student, status: "archived" })).toBe(false);
    expect(canEnroll({ ...student, status: "removed" })).toBe(false);
  });

  it("isStaff is owner or instructor, and only while active", () => {
    expect(isStaff(owner)).toBe(true);
    expect(isStaff(instructor)).toBe(true);
    expect(isStaff(student)).toBe(false);
    expect(isStaff({ ...owner, status: "suspended" })).toBe(false);
  });
});
