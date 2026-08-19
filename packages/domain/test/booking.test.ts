import { describe, expect, it } from "vitest";

import {
  bookingTier,
  canBook,
  capacityDisplay,
  fillLabel,
  spotsLeftLabel,
} from "../src/booking";

describe("bookingTier", () => {
  it("an active member books confirmed (holds a spot)", () => {
    expect(bookingTier({ status: "active" })).toBe("confirmed");
  });

  it("a pending member books provisional (never counted)", () => {
    expect(bookingTier({ status: "pending" })).toBe("provisional");
  });

  it("any non-active status is provisional", () => {
    expect(bookingTier({ status: "suspended" })).toBe("provisional");
  });
});

describe("canBook", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  const future = new Date("2026-08-01T18:00:00Z");
  const past = new Date("2026-08-01T06:00:00Z");

  it("allows a scheduled, future, live class", () => {
    expect(
      canBook({ status: "scheduled", startsAt: future, deletedAt: null }, now),
    ).toEqual({ ok: true });
  });

  it("rejects a soft-deleted class", () => {
    expect(
      canBook(
        { status: "scheduled", startsAt: future, deletedAt: new Date() },
        now,
      ),
    ).toEqual({ ok: false, reason: "deleted" });
  });

  it("rejects a cancelled class", () => {
    expect(
      canBook({ status: "cancelled", startsAt: future, deletedAt: null }, now),
    ).toEqual({ ok: false, reason: "cancelled" });
  });

  it("rejects a class that has already started", () => {
    expect(
      canBook({ status: "scheduled", startsAt: past, deletedAt: null }, now),
    ).toEqual({ ok: false, reason: "past" });
  });

  it("treats the exact start instant as past (no booking at start)", () => {
    expect(
      canBook({ status: "scheduled", startsAt: now, deletedAt: null }, now),
    ).toEqual({ ok: false, reason: "past" });
  });
});

describe("capacityDisplay", () => {
  it("shows 'No limit' when capacity is 0", () => {
    expect(capacityDisplay(5, 0)).toEqual({ label: "No limit", isOver: false });
  });

  it("is under capacity below the limit", () => {
    expect(capacityDisplay(8, 12)).toEqual({ label: "8 / 12", isOver: false });
  });

  it("is over at exactly capacity (at/over is red, spec S5 §4)", () => {
    expect(capacityDisplay(20, 20)).toEqual({ label: "20 / 20", isOver: true });
  });

  it("is over above capacity", () => {
    expect(capacityDisplay(22, 20)).toEqual({ label: "22 / 20", isOver: true });
  });
});

describe("spotsLeftLabel", () => {
  it("reads Open when the gym set no cap", () => {
    expect(spotsLeftLabel(0, 12)).toBe("Open");
  });

  it("counts the spots that are left", () => {
    expect(spotsLeftLabel(20, 18)).toBe("2 spots left");
    expect(spotsLeftLabel(20, 19)).toBe("1 spot left");
  });

  it("reads Full at and over the cap", () => {
    expect(spotsLeftLabel(20, 20)).toBe("Full");
    expect(spotsLeftLabel(20, 22)).toBe("Full");
  });
});

describe("fillLabel", () => {
  it("shows the count alone when there is no cap", () => {
    expect(fillLabel(0, 12)).toBe("12 in");
  });

  it("shows count over capacity otherwise", () => {
    expect(fillLabel(20, 12)).toBe("12/20");
  });
});
