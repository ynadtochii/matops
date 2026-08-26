import { describe, expect, it } from "vitest";

import type { Aggregate } from "../src/invalidation";
import { invalidatedBy } from "../src/invalidation";

const ALL: Aggregate[] = [
  "booking",
  "attendance",
  "payment",
  "membership",
  "schedule",
];

describe("invalidatedBy", () => {
  it("refreshes the gym's figures after anything that moves them", () => {
    for (const aggregate of ALL) {
      expect(invalidatedBy(aggregate)).toContain("stats");
    }
  });

  it("refreshes the spots-left count and the student's own list on a booking", () => {
    expect(invalidatedBy("booking")).toEqual(["class", "booking", "stats"]);
  });

  it("refreshes the roster a register was taken on", () => {
    expect(invalidatedBy("attendance")).toContain("attendance");
    expect(invalidatedBy("attendance")).toContain("class");
  });

  it("refreshes who is overdue after a payment is handled", () => {
    expect(invalidatedBy("payment")).toContain("payments");
    expect(invalidatedBy("payment")).toContain("membership");
  });

  it("refreshes the bookings a schedule edit can cancel", () => {
    expect(invalidatedBy("schedule")).toContain("booking");
    expect(invalidatedBy("schedule")).toContain("template");
  });

  it("never returns an empty rule or a duplicate path", () => {
    for (const aggregate of ALL) {
      const paths = invalidatedBy(aggregate);
      expect(paths.length).toBeGreaterThan(0);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });
});
