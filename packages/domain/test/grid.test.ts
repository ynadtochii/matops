import { describe, expect, it } from "vitest";

import { busyHours, hourSlots } from "../src/grid";

describe("busyHours", () => {
  it("marks every hour a class touches", () => {
    expect([
      ...busyHours([{ startMinutes: 570, durationMinutes: 90 }]),
    ]).toEqual([9, 10]);
  });

  it("marks the start hour even for a zero-length class", () => {
    expect([...busyHours([{ startMinutes: 600, durationMinutes: 0 }])]).toEqual(
      [10],
    );
  });

  it("does not spill into the next hour for a class ending on the hour", () => {
    expect([
      ...busyHours([{ startMinutes: 600, durationMinutes: 60 }]),
    ]).toEqual([10]);
  });
});

describe("hourSlots", () => {
  it("draws one hour row per hour when nothing is free", () => {
    expect(hourSlots(new Set([9, 10]), 9, 11)).toEqual([
      { kind: "hour", from: 9, to: 10 },
      { kind: "hour", from: 10, to: 11 },
    ]);
  });

  it("keeps a single free hour as its own row", () => {
    expect(hourSlots(new Set([9, 11]), 9, 12)).toEqual([
      { kind: "hour", from: 9, to: 10 },
      { kind: "hour", from: 10, to: 11 },
      { kind: "hour", from: 11, to: 12 },
    ]);
  });

  it("collapses two or more free hours into one gap", () => {
    expect(hourSlots(new Set([9, 13]), 9, 14)).toEqual([
      { kind: "hour", from: 9, to: 10 },
      { kind: "gap", from: 10, to: 13 },
      { kind: "hour", from: 13, to: 14 },
    ]);
  });

  it("returns nothing for an empty range", () => {
    expect(hourSlots(new Set(), 9, 9)).toEqual([]);
  });
});
