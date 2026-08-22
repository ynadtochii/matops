import { describe, expect, it } from "vitest";

import type { MarkedParticipation, Session } from "../src/stats";
import {
  classifyDrift,
  DRIFT_THRESHOLDS,
  gymInsights,
  lastClassLabel,
  monthBucket,
  nextClass,
  splitMyClasses,
  trainingStats,
} from "../src/stats";

const UTC = "UTC";

/** Build a session at a UTC instant with an optional discipline. */
const session = (iso: string, discipline: string | null = "bjj"): Session => ({
  startsAt: new Date(iso),
  discipline,
  title: "Class",
});

describe("trainingStats", () => {
  it("returns an all-empty summary for no sessions", () => {
    expect(trainingStats([], new Date("2024-06-01T12:00:00Z"), UTC)).toEqual({
      total: 0,
      thisMonth: 0,
      streakWeeks: 0,
      favoriteDiscipline: null,
      favoriteWeekday: null,
      daysSinceLastClass: null,
    });
  });

  it("counts total, this-month, favorite discipline/weekday and days since last", () => {
    // now = Wed 2024-06-12. Sessions across two months.
    const now = new Date("2024-06-12T20:00:00Z");
    const stats = trainingStats(
      [
        session("2024-05-06T18:00:00Z", "bjj"), // May — prior month
        session("2024-06-03T18:00:00Z", "bjj"), // Mon, June
        session("2024-06-10T18:00:00Z", "nogi"), // Mon, June (last = 2 days ago)
      ],
      now,
      UTC,
    );
    expect(stats.total).toBe(3);
    expect(stats.thisMonth).toBe(2);
    expect(stats.favoriteDiscipline).toBe("bjj"); // 2× bjj vs 1× nogi
    expect(stats.favoriteWeekday).toBe(1); // all three land on Monday (June ones) — Mon = 1
    expect(stats.daysSinceLastClass).toBe(2); // Jun 10 → Jun 12
  });

  it("ignores null/blank disciplines when picking a favorite", () => {
    const now = new Date("2024-06-12T20:00:00Z");
    const stats = trainingStats(
      [
        session("2024-06-03T18:00:00Z", null),
        session("2024-06-04T18:00:00Z", "  "),
        session("2024-06-05T18:00:00Z", "judo"),
      ],
      now,
      UTC,
    );
    expect(stats.favoriteDiscipline).toBe("judo");
  });

  it("streak: counts consecutive weeks ending this week, survives a mid-week gap", () => {
    // now = Wed 2024-06-12 (week of Sun Jun 9). One session each of the last
    // three Sunday-weeks → streak 3, even though weeks have single sessions.
    const now = new Date("2024-06-12T12:00:00Z");
    const stats = trainingStats(
      [
        session("2024-06-11T18:00:00Z"), // this week (Tue)
        session("2024-06-05T18:00:00Z"), // last week (Wed)
        session("2024-05-30T18:00:00Z"), // week before (Thu)
      ],
      now,
      UTC,
    );
    expect(stats.streakWeeks).toBe(3);
  });

  it("streak: stays alive when the latest attended week is LAST week", () => {
    const now = new Date("2024-06-12T12:00:00Z"); // week of Jun 9
    const stats = trainingStats(
      [
        session("2024-06-05T18:00:00Z"), // last week
        session("2024-05-30T18:00:00Z"), // week before
      ],
      now,
      UTC,
    );
    expect(stats.streakWeeks).toBe(2);
  });

  it("streak: breaks to 0 when the latest attended week is older than last week", () => {
    const now = new Date("2024-06-12T12:00:00Z");
    const stats = trainingStats(
      [session("2024-05-29T18:00:00Z")], // two+ weeks ago
      now,
      UTC,
    );
    expect(stats.streakWeeks).toBe(0);
  });

  it("streak: a gap week between attended weeks stops the count there", () => {
    // this week + week-before-last present, but LAST week missing → streak 1.
    const now = new Date("2024-06-12T12:00:00Z");
    const stats = trainingStats(
      [
        session("2024-06-11T18:00:00Z"), // this week
        session("2024-05-30T18:00:00Z"), // two weeks ago (last week empty)
      ],
      now,
      UTC,
    );
    expect(stats.streakWeeks).toBe(1);
  });

  it("computes month/week boundaries in the academy zone, not UTC", () => {
    // Session at 2024-06-01T02:00Z = 2024-05-31 21:00 in New York → prior month.
    const now = new Date("2024-06-15T12:00:00Z");
    const ny = trainingStats(
      [session("2024-06-01T02:00:00Z")],
      now,
      "America/New_York",
    );
    expect(ny.thisMonth).toBe(0); // May in NY
    const utc = trainingStats([session("2024-06-01T02:00:00Z")], now, UTC);
    expect(utc.thisMonth).toBe(1); // June in UTC
  });
});

describe("classifyDrift", () => {
  const now = new Date("2024-06-30T12:00:00Z");
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it("null last-date is dormant", () => {
    expect(classifyDrift(null, now)).toBe("dormant");
  });

  it("bands by whole days since the last session", () => {
    expect(classifyDrift(daysAgo(0), now)).toBe("active");
    expect(classifyDrift(daysAgo(7), now)).toBe("active"); // ≤7 active
    expect(classifyDrift(daysAgo(8), now)).toBe("cooling"); // 8 → cooling
    expect(classifyDrift(daysAgo(13), now)).toBe("cooling");
    expect(classifyDrift(daysAgo(14), now)).toBe("at_risk"); // 14 → at_risk
    expect(classifyDrift(daysAgo(27), now)).toBe("at_risk");
    expect(classifyDrift(daysAgo(28), now)).toBe("dormant"); // 28+ dormant
    expect(classifyDrift(daysAgo(90), now)).toBe("dormant");
  });

  it("exposes the thresholds as constants", () => {
    expect(DRIFT_THRESHOLDS).toEqual({ cooling: 8, at_risk: 14, dormant: 28 });
  });
});

describe("gymInsights", () => {
  const marked = (
    iso: string,
    status: "present" | "absent",
    title = "BJJ Fundamentals",
    discipline: string | null = "bjj",
  ): MarkedParticipation => ({
    startsAt: new Date(iso),
    title,
    discipline,
    status,
  });

  it("returns zeros and a null rate for no data", () => {
    expect(gymInsights([], new Date("2024-06-12T12:00:00Z"), UTC)).toEqual({
      visitsThisWeek: 0,
      visitsLastWeek: 0,
      visitsThisMonth: 0,
      attendanceRate: null,
      busiest: [],
      byWeekday: [0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("counts present visits this week / month and ranks busiest classes", () => {
    const now = new Date("2024-06-12T12:00:00Z"); // week of Sun Jun 9
    const insights = gymInsights(
      [
        marked("2024-06-10T18:00:00Z", "present", "BJJ"), // this week, June
        marked("2024-06-11T18:00:00Z", "present", "BJJ"), // this week, June
        marked("2024-06-03T18:00:00Z", "present", "NoGi"), // last week, June
        marked("2024-05-20T18:00:00Z", "present", "BJJ"), // May
      ],
      now,
      UTC,
    );
    expect(insights.visitsThisWeek).toBe(2);
    expect(insights.visitsLastWeek).toBe(1); // the Jun 3 NoGi
    expect(insights.visitsThisMonth).toBe(3); // three June presents
    expect(insights.busiest).toEqual([
      { title: "BJJ", discipline: "bjj", count: 3 },
      { title: "NoGi", discipline: "bjj", count: 1 },
    ]);
  });

  it("rate is null without absent marks, a fraction with them", () => {
    const now = new Date("2024-06-12T12:00:00Z");
    const noAbsent = gymInsights(
      [marked("2024-06-10T18:00:00Z", "present")],
      now,
      UTC,
    );
    expect(noAbsent.attendanceRate).toBeNull();

    const withAbsent = gymInsights(
      [
        marked("2024-06-10T18:00:00Z", "present"),
        marked("2024-06-10T18:00:00Z", "present"),
        marked("2024-06-10T18:00:00Z", "present"),
        marked("2024-06-10T18:00:00Z", "absent"),
      ],
      now,
      UTC,
    );
    expect(withAbsent.attendanceRate).toBe(0.75); // 3 / (3 + 1)
  });

  it("absent marks never count as visits or busiest", () => {
    const now = new Date("2024-06-12T12:00:00Z");
    const insights = gymInsights(
      [marked("2024-06-10T18:00:00Z", "absent", "BJJ")],
      now,
      UTC,
    );
    expect(insights.visitsThisWeek).toBe(0);
    expect(insights.busiest).toEqual([]);
    expect(insights.byWeekday).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("splitMyClasses", () => {
  const row = (
    iso: string,
    bookingStatus: string,
    attendanceStatus: string,
  ) => ({ startsAt: new Date(iso), bookingStatus, attendanceStatus, id: iso });
  const now = new Date("2024-06-12T12:00:00Z");

  it("upcoming = booked and not yet started (ascending)", () => {
    const { upcoming } = splitMyClasses(
      [
        row("2024-06-20T18:00:00Z", "booked", "unmarked"),
        row("2024-06-14T18:00:00Z", "booked", "unmarked"),
        row("2024-06-10T18:00:00Z", "booked", "present"), // past → not upcoming
        row("2024-06-15T18:00:00Z", "cancelled", "unmarked"), // cancelled → out
      ],
      now,
    );
    expect(upcoming.map((r) => r.id)).toEqual([
      "2024-06-14T18:00:00Z",
      "2024-06-20T18:00:00Z",
    ]);
  });

  it("past = attended and already started (most recent first)", () => {
    const { past } = splitMyClasses(
      [
        row("2024-06-01T18:00:00Z", "booked", "present"),
        row("2024-06-08T18:00:00Z", "none", "present"), // walk-in still counts
        row("2024-06-05T18:00:00Z", "booked", "absent"), // absent → not past
        row("2024-06-11T18:00:00Z", "booked", "unmarked"), // no present → out
      ],
      now,
    );
    expect(past.map((r) => r.id)).toEqual([
      "2024-06-08T18:00:00Z",
      "2024-06-01T18:00:00Z",
    ]);
  });

  it("a class exactly at now is upcoming, not past", () => {
    const { upcoming, past } = splitMyClasses(
      [row("2024-06-12T12:00:00Z", "booked", "present")],
      now,
    );
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });
});

describe("nextClass", () => {
  const now = new Date("2024-06-12T12:00:00Z");
  it("returns the earliest upcoming class", () => {
    const next = nextClass(
      [
        { startsAt: new Date("2024-06-20T18:00:00Z"), id: "b" },
        { startsAt: new Date("2024-06-14T18:00:00Z"), id: "a" },
      ],
      now,
    );
    expect(next?.id).toBe("a");
  });

  it("returns null when nothing is upcoming", () => {
    expect(nextClass([], now)).toBeNull();
    expect(
      nextClass([{ startsAt: new Date("2024-06-01T18:00:00Z") }], now),
    ).toBeNull();
  });
});

describe("monthBucket", () => {
  it("gives consecutive months consecutive numbers", () => {
    const jun = monthBucket(new Date("2024-06-12T12:00:00Z"), UTC);
    const jul = monthBucket(new Date("2024-07-01T00:00:00Z"), UTC);
    expect(jul - jun).toBe(1);
  });

  it("crosses the year boundary by one", () => {
    const dec = monthBucket(new Date("2024-12-31T23:00:00Z"), UTC);
    const jan = monthBucket(new Date("2025-01-01T01:00:00Z"), UTC);
    expect(jan - dec).toBe(1);
  });

  it("reads the month in the academy zone, not UTC", () => {
    // 23:30 on Jun 30 UTC is already Jul 1 in Kyiv (UTC+3).
    const instant = new Date("2024-06-30T23:30:00Z");
    expect(monthBucket(instant, "Europe/Kyiv")).toBe(
      monthBucket(instant, UTC) + 1,
    );
  });
});

describe("gymInsights — the last-week baseline is a like-for-like slice", () => {
  const at = (iso: string): MarkedParticipation => ({
    startsAt: new Date(iso),
    title: "BJJ",
    discipline: "bjj",
    status: "present",
  });
  // Wed Jun 12 2024, noon. This week = Sun Jun 9 onward; last week = Jun 2-8.
  const now = new Date("2024-06-12T12:00:00Z");

  it("counts last week only as far in as this week has got", () => {
    const insights = gymInsights(
      [
        at("2024-06-03T18:00:00Z"), // Mon, before last Wed noon — counts
        at("2024-06-05T09:00:00Z"), // Wed morning, before the cutoff — counts
        at("2024-06-05T18:00:00Z"), // Wed evening, past the cutoff — does not
        at("2024-06-07T18:00:00Z"), // Fri, this week has not reached it — does not
      ],
      now,
      UTC,
    );
    expect(insights.visitsLastWeek).toBe(2);
  });

  it("does not report a collapse mid-week when both weeks match", () => {
    const insights = gymInsights(
      [
        at("2024-06-10T18:00:00Z"), // this Mon
        at("2024-06-11T18:00:00Z"), // this Tue
        at("2024-06-03T18:00:00Z"), // last Mon
        at("2024-06-04T18:00:00Z"), // last Tue
        at("2024-06-07T18:00:00Z"), // last Fri — outside the matched slice
      ],
      now,
      UTC,
    );
    expect(insights.visitsThisWeek).toBe(2);
    expect(insights.visitsLastWeek).toBe(2);
  });
});

describe("lastClassLabel", () => {
  it("names today, yesterday, then counts days", () => {
    expect(lastClassLabel(0)).toBe("Today");
    expect(lastClassLabel(-1)).toBe("Today");
    expect(lastClassLabel(1)).toBe("Yesterday");
    expect(lastClassLabel(5)).toBe("5 days ago");
  });
});
