import { describe, expect, it } from "vitest";

import {
  calendarWeekStart,
  dayWindow,
  GRID_WEEK_STARTS_ON,
  onSameLocalDay,
  startOfDay,
} from "../src/calendar";

const at = (iso: string) => new Date(iso);
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

describe("startOfDay", () => {
  it("keeps the calendar day and drops the clock", () => {
    const d = startOfDay(at("2026-08-25T18:42:13.500"));
    expect(ymd(d)).toBe("2026-08-25");
    expect(d.getHours()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it("does not mutate what it was given", () => {
    const now = at("2026-08-25T18:42:00");
    startOfDay(now);
    expect(now.getHours()).toBe(18);
  });
});

describe("dayWindow", () => {
  it("runs from midnight today to midnight N days ahead", () => {
    const { from, to } = dayWindow(at("2026-08-25T18:00:00"), { aheadDays: 7 });
    expect(ymd(from)).toBe("2026-08-25");
    expect(ymd(to)).toBe("2026-09-01");
    expect(from.getHours()).toBe(0);
  });

  it("reaches back when asked", () => {
    const { from, to } = dayWindow(at("2026-08-25T18:00:00"), {
      backDays: 14,
      aheadDays: 1,
    });
    expect(ymd(from)).toBe("2026-08-11");
    expect(ymd(to)).toBe("2026-08-26");
  });

  it("crosses a month boundary by calendar days, not by 24-hour steps", () => {
    const { from } = dayWindow(at("2026-03-02T12:00:00"), {
      backDays: 3,
      aheadDays: 1,
    });
    expect(ymd(from)).toBe("2026-02-27");
  });
});

describe("calendarWeekStart", () => {
  it("finds Monday of the current week", () => {
    expect(ymd(calendarWeekStart(at("2026-08-25T18:00:00"), 0, 1))).toBe(
      "2026-08-24",
    );
  });

  it("treats Sunday as the last day of a Monday-first week", () => {
    expect(ymd(calendarWeekStart(at("2026-08-30T18:00:00"), 0, 1))).toBe(
      "2026-08-24",
    );
  });

  it("finds Sunday when the week starts on Sunday", () => {
    expect(ymd(calendarWeekStart(at("2026-08-25T18:00:00"), 0, 0))).toBe(
      "2026-08-23",
    );
  });

  it("pages forward and back a whole week at a time", () => {
    const base = at("2026-08-25T18:00:00");
    expect(ymd(calendarWeekStart(base, 1, 1))).toBe("2026-08-31");
    expect(ymd(calendarWeekStart(base, -1, 1))).toBe("2026-08-17");
  });

  it("is already Monday-first on a Monday", () => {
    expect(ymd(calendarWeekStart(at("2026-08-24T00:30:00"), 0, 1))).toBe(
      "2026-08-24",
    );
  });

  it("uses Monday for the owner's grid", () => {
    expect(GRID_WEEK_STARTS_ON).toBe(1);
  });
});

describe("onSameLocalDay", () => {
  it("compares the calendar day, not the elapsed hours", () => {
    expect(
      onSameLocalDay(at("2026-08-25T23:59:00"), at("2026-08-25T00:01:00")),
    ).toBe(true);
    expect(
      onSameLocalDay(at("2026-08-25T23:59:00"), at("2026-08-26T00:01:00")),
    ).toBe(false);
  });

  it("does not confuse the same day of a different month or year", () => {
    expect(
      onSameLocalDay(at("2026-08-25T10:00:00"), at("2026-09-25T10:00:00")),
    ).toBe(false);
    expect(
      onSameLocalDay(at("2026-08-25T10:00:00"), at("2025-08-25T10:00:00")),
    ).toBe(false);
  });
});
