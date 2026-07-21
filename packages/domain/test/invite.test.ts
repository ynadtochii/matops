import { describe, expect, it } from "vitest";

import { isInvitableRole } from "../src/invite";

describe("invitable roles", () => {
  it("allows student and instructor", () => {
    expect(isInvitableRole("student")).toBe(true);
    expect(isInvitableRole("instructor")).toBe(true);
  });

  it("never allows owner via a link (co-owners are promoted)", () => {
    expect(isInvitableRole("owner")).toBe(false);
  });

  it("rejects unknown roles", () => {
    expect(isInvitableRole("member")).toBe(false);
    expect(isInvitableRole("")).toBe(false);
    expect(isInvitableRole("admin")).toBe(false);
  });
});
