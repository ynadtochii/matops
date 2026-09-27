import { describe, expect, it } from "vitest";

import type { MemberRow } from "@matops/db";

import { nameByUser } from "../src/members";

const row = (memberId: string, userId: string, name: string): MemberRow => ({
  memberId,
  personId: `person_${userId}`,
  userId,
  accountUserId: userId,
  role: "member",
  status: "active",
  invitedRole: null,
  name,
  email: `${userId}@example.test`,
  phone: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
});

const roster = [row("mem_1", "usr_1", "Ana"), row("mem_2", "usr_2", "Bruno")];

describe("name maps", () => {
  it("keys by user id, not member id", () => {
    const byUser = nameByUser(roster);
    expect(byUser.get("usr_1")).toBe("Ana");
    expect(byUser.get("mem_1")).toBeUndefined();
  });

  it("returns an empty map for an empty roster", () => {
    expect(nameByUser([]).size).toBe(0);
  });
});
