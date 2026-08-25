import { describe, expect, it } from "vitest";

import {
  classEndsAt,
  dayPlan,
  daysSince,
  isFirstRun,
  newLeadCount,
  rosterSummary,
  upcomingClassCount,
} from "../src/dashboard";

const at = (iso: string) => new Date(iso);

const cls = (
  iso: string,
  opts: Partial<{ status: string; mins: number }> = {},
) => ({
  startsAt: at(iso),
  durationMinutes: opts.mins ?? 60,
  status: opts.status ?? "scheduled",
});

const TODAY = at("2026-08-25T00:00:00");
const TOMORROW = at("2026-08-26T00:00:00");

describe("classEndsAt", () => {
  it("adds the duration to the start", () => {
    expect(classEndsAt(cls("2026-08-25T18:00:00", { mins: 90 }))).toBe(
      at("2026-08-25T19:30:00").getTime(),
    );
  });
});

describe("dayPlan", () => {
  const morning = cls("2026-08-25T09:00:00");
  const evening = cls("2026-08-25T19:00:00");
  const tomorrowClass = cls("2026-08-26T19:00:00");

  it("shows today, sorted, while today still has a class to come", () => {
    const plan = dayPlan(
      [evening, morning, tomorrowClass],
      TODAY,
      TOMORROW,
      at("2026-08-25T12:00:00"),
    );
    expect(plan.showTomorrow).toBe(false);
    expect(plan.list).toEqual([morning, evening]);
  });

  it("puts the now-line after the classes that already started", () => {
    const plan = dayPlan(
      [morning, evening],
      TODAY,
      TOMORROW,
      at("2026-08-25T12:00:00"),
    );
    expect(plan.nowIndex).toBe(1);
  });

  it("rolls forward once today's last class has ended", () => {
    const plan = dayPlan(
      [morning, evening, tomorrowClass],
      TODAY,
      TOMORROW,
      at("2026-08-25T23:00:00"),
    );
    expect(plan.showTomorrow).toBe(true);
    expect(plan.list).toEqual([tomorrowClass]);
    expect(plan.nowIndex).toBeNull();
  });

  it("stays on today when tomorrow is empty, even after the last class", () => {
    const plan = dayPlan(
      [morning, evening],
      TODAY,
      TOMORROW,
      at("2026-08-25T23:00:00"),
    );
    expect(plan.showTomorrow).toBe(false);
    expect(plan.nowIndex).toBe(2);
  });

  it("rolls forward on an empty today, because every() is true of nothing", () => {
    const plan = dayPlan(
      [tomorrowClass],
      TODAY,
      TOMORROW,
      at("2026-08-25T12:00:00"),
    );
    expect(plan.showTomorrow).toBe(true);
  });

  it("leaves cancelled classes out of both days", () => {
    const plan = dayPlan(
      [cls("2026-08-25T19:00:00", { status: "cancelled" }), morning],
      TODAY,
      TOMORROW,
      at("2026-08-25T12:00:00"),
    );
    expect(plan.list).toEqual([morning]);
  });

  it("counts a class that ends exactly now as over", () => {
    const plan = dayPlan(
      [cls("2026-08-25T18:00:00"), tomorrowClass],
      TODAY,
      TOMORROW,
      at("2026-08-25T19:00:00"),
    );
    expect(plan.showTomorrow).toBe(true);
  });
});

describe("rosterSummary", () => {
  const roster = [
    { status: "active", invitedRole: null, dues: { status: "paid" } },
    { status: "active", invitedRole: null, dues: { status: "overdue" } },
    { status: "pending", invitedRole: null },
    { status: "pending", invitedRole: "instructor" },
    { status: "archived", invitedRole: null },
  ];

  it("keeps the coach queue out of the student count", () => {
    const s = rosterSummary(roster);
    expect(s.pendingStudents).toBe(1);
    expect(s.pendingCoaches).toBe(1);
  });

  it("counts the active members and lists the overdue ones", () => {
    const s = rosterSummary(roster);
    expect(s.active).toBe(2);
    expect(s.overdue).toHaveLength(1);
  });

  it("handles a member with no dues row", () => {
    expect(
      rosterSummary([{ status: "active", invitedRole: null }]).overdue,
    ).toEqual([]);
  });
});

describe("upcomingClassCount", () => {
  it("counts from the cutoff and skips cancelled", () => {
    expect(
      upcomingClassCount(
        [
          cls("2026-08-24T19:00:00"),
          cls("2026-08-25T19:00:00"),
          cls("2026-08-26T19:00:00", { status: "cancelled" }),
          cls("2026-08-27T19:00:00"),
        ],
        TODAY,
      ),
    ).toBe(2);
  });
});

describe("newLeadCount", () => {
  it("counts only the leads inside the window", () => {
    expect(
      newLeadCount(
        [
          { lastVisitAt: at("2026-08-24T10:00:00") },
          { lastVisitAt: at("2026-08-10T10:00:00") },
        ],
        at("2026-08-19T00:00:00"),
      ),
    ).toBe(1);
  });
});

describe("isFirstRun", () => {
  it("is true only for a gym with nobody and nothing", () => {
    expect(isFirstRun(0, 0)).toBe(true);
    expect(isFirstRun(1, 0)).toBe(false);
    expect(isFirstRun(0, 1)).toBe(false);
  });
});

describe("daysSince", () => {
  it("floors to whole days", () => {
    expect(
      daysSince(at("2026-08-20T23:00:00"), at("2026-08-25T01:00:00")),
    ).toBe(4);
  });

  it("has no answer for someone who never attended", () => {
    expect(daysSince(null, TODAY)).toBeNull();
  });
});
