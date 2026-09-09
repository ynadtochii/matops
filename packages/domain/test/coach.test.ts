import { describe, expect, it } from "vitest";

import type { ClassMark, CoachClass, DateRange } from "../src/coach";
import {
  canReassignCoach,
  coachBreakdown,
  coachWindowRange,
  coachWorkload,
  coachWorkloadFor,
} from "../src/coach";

const UTC = "UTC";
const KYIV = "Europe/Kyiv";
const ANA = "coach_ana";
const BRUNO = "coach_bruno";
const GONE = "coach_gone";
const NOW = new Date("2026-08-20T12:00:00Z");
const AUGUST: DateRange = {
  from: new Date("2026-08-01T00:00:00Z"),
  to: new Date("2026-09-01T00:00:00Z"),
};

interface ClassOverrides {
  id: string;
  startsAt: string;
  instructorId?: string;
  durationMinutes?: number;
  title?: string;
  discipline?: string | null;
  cancelled?: boolean;
  reviewed?: boolean;
}

const cls = (o: ClassOverrides): CoachClass => ({
  id: o.id,
  instructorId: o.instructorId ?? ANA,
  startsAt: new Date(o.startsAt),
  durationMinutes: o.durationMinutes ?? 60,
  title: o.title ?? "Gi Fundamentals",
  discipline: o.discipline === undefined ? "bjj" : o.discipline,
  cancelled: o.cancelled ?? false,
  reviewed: o.reviewed ?? true,
});

const mark = (
  classId: string,
  studentId: string,
  status: "present" | "absent" = "present",
): ClassMark => ({ classId, studentId, status });

const roster = (classes: CoachClass[], marks: ClassMark[] = []) =>
  coachWorkload({
    classes,
    marks,
    instructorIds: [ANA, BRUNO],
    now: NOW,
    range: AUGUST,
  });

const forAna = (classes: CoachClass[], marks: ClassMark[] = []) =>
  coachBreakdown({
    classes,
    marks,
    instructorId: ANA,
    now: NOW,
    range: AUGUST,
    timeZone: UTC,
  });

describe("coachWindowRange", () => {
  it("resolves the current calendar month in UTC", () => {
    expect(
      coachWindowRange({ kind: "month", monthsBack: 0 }, NOW, UTC),
    ).toEqual(AUGUST);
  });

  it("resolves a calendar month at the academy's offset, not UTC's", () => {
    const range = coachWindowRange({ kind: "month", monthsBack: 0 }, NOW, KYIV);
    expect(range.from.toISOString()).toBe("2026-07-31T21:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });

  it("rolls back across a year boundary", () => {
    const range = coachWindowRange({ kind: "month", monthsBack: 8 }, NOW, UTC);
    expect(range.from.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("resolves rolling days as a plain subtraction ending now", () => {
    const range = coachWindowRange({ kind: "rollingDays", days: 90 }, NOW, UTC);
    expect(range.to).toEqual(NOW);
    expect(range.from.toISOString()).toBe("2026-05-22T12:00:00.000Z");
  });
});

describe("coachWorkload", () => {
  it("returns a zero row for every rostered coach with no classes", () => {
    expect(roster([])).toEqual([
      {
        instructorId: ANA,
        classesLed: 0,
        unresolvedEnded: 0,
        minutesLed: 0,
        markedClasses: 0,
        visitsTaught: 0,
        distinctStudents: 0,
        avgHeadcount: null,
        markedRate: null,
        cancelled: 0,
      },
      {
        instructorId: BRUNO,
        classesLed: 0,
        unresolvedEnded: 0,
        minutesLed: 0,
        markedClasses: 0,
        visitsTaught: 0,
        distinctStudents: 0,
        avgHeadcount: null,
        markedRate: null,
        cancelled: 0,
      },
    ]);
  });

  it("counts finished classes and their minutes per coach", () => {
    const rows = roster([
      cls({ id: "c1", startsAt: "2026-08-03T18:00:00Z", durationMinutes: 60 }),
      cls({ id: "c2", startsAt: "2026-08-05T18:00:00Z", durationMinutes: 90 }),
      cls({
        id: "c3",
        startsAt: "2026-08-06T18:00:00Z",
        instructorId: BRUNO,
      }),
    ]);
    expect(rows[0]?.classesLed).toBe(2);
    expect(rows[0]?.minutesLed).toBe(150);
    expect(rows[1]?.classesLed).toBe(1);
    expect(rows[1]?.minutesLed).toBe(60);
  });

  it("does not credit a class that has not finished yet", () => {
    const rows = roster([
      cls({
        id: "running",
        startsAt: "2026-08-20T11:30:00Z",
        durationMinutes: 60,
      }),
      cls({ id: "later", startsAt: "2026-08-24T18:00:00Z" }),
    ]);
    expect(rows[0]?.classesLed).toBe(0);
  });

  it("keeps an ended class unresolved until its current review is complete", () => {
    const rows = roster([
      cls({
        id: "unresolved",
        startsAt: "2026-08-03T18:00:00Z",
        reviewed: false,
      }),
    ]);
    expect(rows[0]).toMatchObject({ classesLed: 0, unresolvedEnded: 1 });
  });

  it("credits a class the moment its last minute passes", () => {
    const rows = roster([
      cls({
        id: "just_done",
        startsAt: "2026-08-20T11:00:00Z",
        durationMinutes: 60,
      }),
    ]);
    expect(rows[0]?.classesLed).toBe(1);
  });

  it("ignores classes outside the window", () => {
    const rows = roster([
      cls({ id: "july", startsAt: "2026-07-30T18:00:00Z" }),
      cls({ id: "august", startsAt: "2026-08-03T18:00:00Z" }),
    ]);
    expect(rows[0]?.classesLed).toBe(1);
  });

  it("counts a cancelled past class as cancelled, never as led", () => {
    const rows = roster([
      cls({ id: "off", startsAt: "2026-08-03T18:00:00Z", cancelled: true }),
    ]);
    expect(rows[0]?.classesLed).toBe(0);
    expect(rows[0]?.cancelled).toBe(1);
  });

  it("does not count a cancellation whose slot has not passed", () => {
    const rows = roster([
      cls({ id: "off", startsAt: "2026-08-25T18:00:00Z", cancelled: true }),
    ]);
    expect(rows[0]?.cancelled).toBe(0);
  });

  it("averages headcount over marked classes only", () => {
    const rows = roster(
      [
        cls({ id: "c1", startsAt: "2026-08-03T18:00:00Z" }),
        cls({ id: "c2", startsAt: "2026-08-05T18:00:00Z" }),
        cls({ id: "c3", startsAt: "2026-08-10T18:00:00Z" }),
      ],
      [mark("c1", "s1"), mark("c1", "s2"), mark("c2", "s1")],
    );
    expect(rows[0]?.classesLed).toBe(3);
    expect(rows[0]?.markedClasses).toBe(2);
    expect(rows[0]?.visitsTaught).toBe(3);
    expect(rows[0]?.avgHeadcount).toBe(1.5);
    expect(rows[0]?.markedRate).toBeCloseTo(2 / 3);
  });

  it("treats an all-absent class as marked but adds no visits", () => {
    const rows = roster(
      [cls({ id: "c1", startsAt: "2026-08-03T18:00:00Z" })],
      [mark("c1", "s1", "absent")],
    );
    expect(rows[0]?.markedClasses).toBe(1);
    expect(rows[0]?.visitsTaught).toBe(0);
    expect(rows[0]?.avgHeadcount).toBe(0);
    expect(rows[0]?.markedRate).toBe(1);
  });

  it("counts a student once however many classes they attended", () => {
    const rows = roster(
      [
        cls({ id: "c1", startsAt: "2026-08-03T18:00:00Z" }),
        cls({ id: "c2", startsAt: "2026-08-05T18:00:00Z" }),
      ],
      [mark("c1", "s1"), mark("c2", "s1"), mark("c2", "s2")],
    );
    expect(rows[0]?.visitsTaught).toBe(3);
    expect(rows[0]?.distinctStudents).toBe(2);
  });

  it("keeps a coach who left the roster, listed after the current staff", () => {
    const rows = roster([
      cls({ id: "c1", startsAt: "2026-08-03T18:00:00Z", instructorId: GONE }),
    ]);
    expect(rows.map((r) => r.instructorId)).toEqual([ANA, BRUNO, GONE]);
    expect(rows[2]?.classesLed).toBe(1);
  });
});

describe("coachWorkloadFor", () => {
  it("matches the roster row for the same coach", () => {
    const classes = [
      cls({ id: "c1", startsAt: "2026-08-03T18:00:00Z" }),
      cls({ id: "c2", startsAt: "2026-08-05T18:00:00Z", instructorId: BRUNO }),
    ];
    const marks = [mark("c1", "s1")];
    const rows = roster(classes, marks);
    expect(
      coachWorkloadFor({ classes, marks, now: NOW, range: AUGUST }, ANA),
    ).toEqual(rows[0]);
  });

  it("returns a zero row for a coach with nothing in the window", () => {
    expect(
      coachWorkloadFor(
        { classes: [], marks: [], now: NOW, range: AUGUST },
        ANA,
      ),
    ).toMatchObject({
      instructorId: ANA,
      classesLed: 0,
      avgHeadcount: null,
      markedRate: null,
    });
  });
});

describe("coachBreakdown", () => {
  const classes = [
    cls({ id: "c1", startsAt: "2026-08-03T18:00:00Z", title: "Gi" }),
    cls({ id: "c2", startsAt: "2026-08-05T18:00:00Z", title: "No-Gi" }),
    cls({ id: "c3", startsAt: "2026-08-10T18:00:00Z", title: "Gi" }),
    cls({ id: "c4", startsAt: "2026-08-17T18:00:00Z", title: "Gi" }),
  ];

  it("groups by title, most-taught first", () => {
    const out = forAna(classes, [mark("c1", "s1"), mark("c3", "s1")]);
    expect(out.byClass.map((g) => [g.title, g.classesLed])).toEqual([
      ["Gi", 3],
      ["No-Gi", 1],
    ]);
    expect(out.byClass[0]?.markedClasses).toBe(2);
    expect(out.byClass[0]?.avgHeadcount).toBe(1);
    expect(out.byClass[1]?.avgHeadcount).toBeNull();
  });

  it("keeps the first discipline seen for a title", () => {
    const out = forAna([
      cls({ id: "a", startsAt: "2026-08-17T18:00:00Z", title: "Gi" }),
      cls({
        id: "b",
        startsAt: "2026-08-03T18:00:00Z",
        title: "Gi",
        discipline: "judo",
      }),
    ]);
    expect(out.byClass[0]?.discipline).toBe("bjj");
  });

  it("counts classes led per weekday", () => {
    const out = forAna(classes);
    expect(out.byWeekday).toEqual([0, 3, 0, 1, 0, 0, 0]);
  });

  it("returns a contiguous week series that stops at now", () => {
    const out = forAna(classes);
    expect(out.byWeek.map((w) => w.classesLed)).toEqual([0, 2, 1, 1]);
    const buckets = out.byWeek.map((w) => w.weekBucket);
    const steps = buckets.slice(1).map((b, i) => b - (buckets[i] ?? 0));
    expect(steps).toEqual([1, 1, 1]);
  });

  it("stops the week series at the last week inside a finished month", () => {
    const february: DateRange = {
      from: new Date("2026-02-01T00:00:00Z"),
      to: new Date("2026-03-01T00:00:00Z"),
    };
    const out = coachBreakdown({
      classes: [cls({ id: "f1", startsAt: "2026-02-03T18:00:00Z" })],
      marks: [],
      instructorId: ANA,
      now: new Date("2026-03-10T12:00:00Z"),
      range: february,
      timeZone: UTC,
    });
    expect(out.byWeek).toHaveLength(4);
    expect(out.byWeek.map((w) => w.classesLed)).toEqual([1, 0, 0, 0]);
  });

  it("lists led classes most recent first with their headcount", () => {
    const out = forAna(classes, [mark("c3", "s1"), mark("c3", "s2")]);
    expect(out.recent.map((r) => r.classId)).toEqual(["c4", "c3", "c2", "c1"]);
    expect(out.recent[1]).toMatchObject({
      classId: "c3",
      headcount: 2,
      marked: true,
    });
    expect(out.recent[0]).toMatchObject({ headcount: 0, marked: false });
  });

  it("ignores another coach's classes", () => {
    const out = forAna([
      cls({ id: "mine", startsAt: "2026-08-03T18:00:00Z" }),
      cls({
        id: "theirs",
        startsAt: "2026-08-04T18:00:00Z",
        instructorId: BRUNO,
      }),
    ]);
    expect(out.recent.map((r) => r.classId)).toEqual(["mine"]);
  });
});
describe("canReassignCoach", () => {
  const owner = { role: "owner", status: "active" };
  const instructor = { role: "instructor", status: "active" };
  const student = { role: "student", status: "active" };
  const pendingInstructor = { role: "instructor", status: "pending" };
  const upcoming = new Date("2026-08-25T18:00:00Z");
  const past = new Date("2026-08-03T18:00:00Z");

  it("lets any staff member set the coach on an upcoming class", () => {
    expect(canReassignCoach(instructor, upcoming, NOW)).toBe(true);
    expect(canReassignCoach(owner, upcoming, NOW)).toBe(true);
  });

  it("lets only an owner change the coach on a class that already started", () => {
    expect(canReassignCoach(instructor, past, NOW)).toBe(false);
    expect(canReassignCoach(owner, past, NOW)).toBe(true);
  });

  it("treats a class starting exactly now as history", () => {
    expect(canReassignCoach(instructor, NOW, NOW)).toBe(false);
  });

  it("refuses students and staff who are not approved yet", () => {
    expect(canReassignCoach(student, upcoming, NOW)).toBe(false);
    expect(canReassignCoach(pendingInstructor, upcoming, NOW)).toBe(false);
  });
});
