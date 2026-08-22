import { describe, expect, it } from "vitest";

import { parseCheckInLink, resolveCheckInClass } from "../src/checkin";

const cls = (id: string, iso: string, over = {}) => ({
  id,
  startsAt: new Date(iso),
  durationMinutes: 60,
  status: "scheduled",
  ...over,
});

describe("resolveCheckInClass", () => {
  const now = new Date("2026-08-15T18:30:00Z");

  it("returns an in-progress class", () => {
    const r = resolveCheckInClass([cls("a", "2026-08-15T18:00:00Z")], now);
    expect(r.map((c) => c.id)).toEqual(["a"]);
  });

  it("returns a class starting within the early window", () => {
    // now 18:30, class 19:00 → 30 min early, inside the 60-min window
    const r = resolveCheckInClass([cls("a", "2026-08-15T19:00:00Z")], now);
    expect(r.map((c) => c.id)).toEqual(["a"]);
  });

  it("excludes a class too far in the future", () => {
    const r = resolveCheckInClass([cls("a", "2026-08-15T20:00:00Z")], now);
    expect(r).toEqual([]);
  });

  it("excludes a class that already ended", () => {
    const r = resolveCheckInClass([cls("a", "2026-08-15T17:00:00Z")], now);
    expect(r).toEqual([]);
  });

  it("excludes a cancelled class in the window", () => {
    const r = resolveCheckInClass(
      [cls("a", "2026-08-15T18:00:00Z", { status: "cancelled" })],
      now,
    );
    expect(r).toEqual([]);
  });

  it("returns both overlapping classes, soonest first (caller picks)", () => {
    const r = resolveCheckInClass(
      [cls("b", "2026-08-15T18:15:00Z"), cls("a", "2026-08-15T18:00:00Z")],
      now,
    );
    expect(r.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("parseCheckInLink", () => {
  it("reads the academy id out of the poster URL", () => {
    expect(
      parseCheckInLink("https://matops.example.com/checkin/org_abc123"),
    ).toBe("org_abc123");
  });

  it("reads it out of the custom-scheme deep link", () => {
    expect(parseCheckInLink("matops://checkin/org_abc123")).toBe("org_abc123");
  });

  it("tolerates a trailing slash, a query string and surrounding space", () => {
    expect(
      parseCheckInLink("  http://localhost:3004/checkin/org_abc123/  "),
    ).toBe("org_abc123");
    expect(
      parseCheckInLink("https://x.dev/checkin/org_abc123?src=poster"),
    ).toBe("org_abc123");
  });

  it("rejects another matops link", () => {
    expect(parseCheckInLink("https://x.dev/join/tok_abc123")).toBeNull();
    expect(parseCheckInLink("matops://join/tok_abc123")).toBeNull();
  });

  it("rejects a random code and an empty id", () => {
    expect(parseCheckInLink("WIFI:S:gym;T:WPA;P:pass;;")).toBeNull();
    expect(parseCheckInLink("https://x.dev/checkin/")).toBeNull();
  });
});
