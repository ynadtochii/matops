import { describe, expect, it } from "vitest";

import {
  attendanceWindow,
  classQueryWindow,
  scheduleWeekWindow,
  studentWeekWindow,
  utcDayStart,
} from "../src/query-window";

describe("utcDayStart", () => {
  it("floors to the UTC day, not the runtime's local day", () => {
    expect(
      new Date(utcDayStart(new Date("2026-08-24T13:47:11Z"))).toISOString(),
    ).toBe("2026-08-24T00:00:00.000Z");
    expect(
      new Date(utcDayStart(new Date("2026-08-24T23:59:59Z"))).toISOString(),
    ).toBe("2026-08-24T00:00:00.000Z");
    expect(
      new Date(utcDayStart(new Date("2026-08-25T00:00:00Z"))).toISOString(),
    ).toBe("2026-08-25T00:00:00.000Z");
  });
});

describe("classQueryWindow", () => {
  const opts = { backDays: 9, forwardDays: 8 };

  it("is identical for any two clocks inside the same UTC day", () => {
    const a = classQueryWindow(new Date("2026-08-24T00:00:00.001Z"), opts);
    const b = classQueryWindow(new Date("2026-08-24T13:47:11.482Z"), opts);
    const c = classQueryWindow(new Date("2026-08-24T23:59:59.999Z"), opts);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("puts the window on UTC midnight boundaries", () => {
    expect(classQueryWindow(new Date("2026-08-24T13:47:11Z"), opts)).toEqual({
      from: "2026-08-15T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
    });
  });

  it("moves to the next window once UTC midnight passes", () => {
    const before = classQueryWindow(new Date("2026-08-24T23:59:59Z"), opts);
    const after = classQueryWindow(new Date("2026-08-25T00:00:00Z"), opts);
    expect(after.from).not.toBe(before.from);
    expect(
      new Date(after.from).getTime() - new Date(before.from).getTime(),
    ).toBe(86_400_000);
  });

  it("survives a DST change, because UTC has none", () => {
    const beforeDst = classQueryWindow(new Date("2026-10-24T12:00:00Z"), opts);
    const afterDst = classQueryWindow(new Date("2026-10-26T12:00:00Z"), opts);
    expect(
      new Date(afterDst.from).getTime() - new Date(beforeDst.from).getTime(),
    ).toBe(2 * 86_400_000);
  });

  it("spans exactly the days asked for", () => {
    const w = classQueryWindow(new Date("2026-08-24T13:47:11Z"), {
      backDays: 1,
      forwardDays: 8,
    });
    expect(new Date(w.to).getTime() - new Date(w.from).getTime()).toBe(
      9 * 86_400_000,
    );
  });

  it("accepts a zero-length back window", () => {
    const w = classQueryWindow(new Date("2026-08-24T13:47:11Z"), {
      backDays: 0,
      forwardDays: 1,
    });
    expect(w.from).toBe("2026-08-24T00:00:00.000Z");
    expect(w.to).toBe("2026-08-25T00:00:00.000Z");
  });
});

describe("named windows", () => {
  it("attendanceWindow covers the full backfill range plus a day of slack", () => {
    const w = attendanceWindow(new Date("2026-08-24T13:00:00Z"));
    expect(w.from).toBe("2026-08-09T00:00:00.000Z");
    expect(w.to).toBe("2026-08-26T00:00:00.000Z");
  });

  it("studentWeekWindow covers today plus seven local days either way", () => {
    const w = studentWeekWindow(new Date("2026-08-24T13:00:00Z"));
    expect(w.from).toBe("2026-08-23T00:00:00.000Z");
    expect(w.to).toBe("2026-09-01T00:00:00.000Z");
  });

  it("scheduleWeekWindow aligns to the UTC Monday, padded a day each side", () => {
    // 2026-08-26 is a Wednesday; its UTC Monday is the 24th.
    expect(scheduleWeekWindow(new Date("2026-08-26T15:00:00Z"), 0)).toEqual({
      from: "2026-08-23T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
    });
  });

  it("scheduleWeekWindow is the same for every day of one UTC week", () => {
    const mon = scheduleWeekWindow(new Date("2026-08-24T00:00:01Z"), 0);
    const sun = scheduleWeekWindow(new Date("2026-08-30T23:59:59Z"), 0);
    expect(mon).toEqual(sun);
  });

  it("scheduleWeekWindow steps exactly seven days per offset", () => {
    const a = scheduleWeekWindow(new Date("2026-08-26T15:00:00Z"), 0);
    const b = scheduleWeekWindow(new Date("2026-08-26T15:00:00Z"), 1);
    const c = scheduleWeekWindow(new Date("2026-08-26T15:00:00Z"), -1);
    expect(new Date(b.from).getTime() - new Date(a.from).getTime()).toBe(
      7 * 86_400_000,
    );
    expect(new Date(a.from).getTime() - new Date(c.from).getTime()).toBe(
      7 * 86_400_000,
    );
  });
});
