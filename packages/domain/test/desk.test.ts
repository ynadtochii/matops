import { describe, expect, it } from "vitest";

import {
  canUndoDeskCheckIn,
  deskClasses,
  deskDefaultClass,
  deskNames,
  deskSearch,
  deskWindow,
} from "../src/desk";

const cls = (id: string, iso: string, over = {}) => ({
  id,
  startsAt: new Date(iso),
  durationMinutes: 60,
  status: "scheduled",
  ...over,
});

describe("deskWindow", () => {
  it("runs from local midnight today to the end of tomorrow", () => {
    const w = deskWindow(new Date("2026-08-15T12:00:00Z"), "Europe/Lisbon");
    expect(w.from.toISOString()).toBe("2026-08-14T23:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-08-16T23:00:00.000Z");
  });

  it("reaches back before midnight for a long class still running", () => {
    const w = deskWindow(new Date("2026-08-15T00:30:00Z"), "Europe/Lisbon");
    expect(w.from.toISOString()).toBe("2026-08-14T14:30:00.000Z");
  });
});

describe("deskClasses", () => {
  const now = new Date("2026-08-15T18:30:00Z");
  const tz = "Europe/Lisbon";

  it("drops ended and cancelled classes, sorts soonest first, and opens the next class once the first has started", () => {
    const r = deskClasses(
      [
        cls("late", "2026-08-15T21:00:00Z"),
        cls("ended", "2026-08-15T16:00:00Z"),
        cls("cancelled", "2026-08-15T19:00:00Z", { status: "cancelled" }),
        cls("running", "2026-08-15T18:00:00Z"),
        cls("tomorrow", "2026-08-16T10:00:00Z"),
      ],
      now,
      tz,
    );
    expect(r.tomorrow).toBe(false);
    expect(r.classes.map((c) => [c.id, c.open, c.opensAt])).toEqual([
      ["running", true, null],
      ["late", true, null],
    ]);
  });

  it("opens only the first class before it starts, however far away", () => {
    const morning = new Date("2026-08-15T07:00:00Z");
    const r = deskClasses(
      [
        cls("first", "2026-08-15T17:00:00Z"),
        cls("second", "2026-08-15T18:30:00Z"),
        cls("third", "2026-08-15T20:00:00Z"),
      ],
      morning,
      tz,
    );
    expect(
      r.classes.map((c) => [c.id, c.open, c.opensAt?.toISOString() ?? null]),
    ).toEqual([
      ["first", true, null],
      ["second", false, "2026-08-15T17:00:00.000Z"],
      ["third", false, "2026-08-15T18:30:00.000Z"],
    ]);
  });

  it("keeps the third class closed while the first runs", () => {
    const r = deskClasses(
      [
        cls("first", "2026-08-15T18:00:00Z"),
        cls("second", "2026-08-15T19:00:00Z"),
        cls("third", "2026-08-15T20:00:00Z"),
      ],
      now,
      tz,
    );
    expect(r.classes.map((c) => [c.id, c.open])).toEqual([
      ["first", true],
      ["second", true],
      ["third", false],
    ]);
  });

  it("treats classes that start together as one step", () => {
    const morning = new Date("2026-08-15T07:00:00Z");
    const r = deskClasses(
      [
        cls("mat1", "2026-08-15T17:00:00Z"),
        cls("mat2", "2026-08-15T17:00:00Z"),
        cls("next", "2026-08-15T18:30:00Z"),
      ],
      morning,
      tz,
    );
    expect(r.classes.map((c) => [c.id, c.open])).toEqual([
      ["mat1", true],
      ["mat2", true],
      ["next", false],
    ]);
  });

  it("shows tomorrow's classes when none are left today", () => {
    const r = deskClasses(
      [
        cls("ended", "2026-08-15T16:00:00Z"),
        cls("cancelled", "2026-08-15T20:00:00Z", { status: "cancelled" }),
        cls("t2", "2026-08-16T18:00:00Z"),
        cls("t1", "2026-08-16T08:00:00Z"),
        cls("later", "2026-08-17T08:00:00Z"),
      ],
      now,
      tz,
    );
    expect(r.tomorrow).toBe(true);
    expect(r.classes.map((c) => [c.id, c.open])).toEqual([
      ["t1", false],
      ["t2", false],
    ]);
    expect(r.classes[0]?.opensAt).toBeNull();
  });

  it("uses the academy's local day for tomorrow", () => {
    const late = new Date("2026-08-15T22:30:00Z");
    const r = deskClasses([cls("a", "2026-08-15T23:30:00Z")], late, tz);
    expect(r.tomorrow).toBe(true);
    expect(r.classes.map((c) => c.id)).toEqual(["a"]);
  });

  it("is empty with no classes today or tomorrow", () => {
    const r = deskClasses([cls("later", "2026-08-17T08:00:00Z")], now, tz);
    expect(r).toEqual({ tomorrow: false, classes: [] });
  });

  it("keeps a class at its last minute and drops it at its end", () => {
    const c = [cls("a", "2026-08-15T17:31:00Z")];
    expect(deskClasses(c, now, tz).classes).toHaveLength(1);
    expect(
      deskClasses(c, new Date("2026-08-15T18:31:00Z"), tz).classes,
    ).toHaveLength(0);
  });
});

describe("deskDefaultClass", () => {
  it("picks the one open class", () => {
    expect(
      deskDefaultClass([
        { id: "a", open: false },
        { id: "b", open: true },
      ])?.id,
    ).toBe("b");
  });

  it("picks the next class when none is open", () => {
    expect(
      deskDefaultClass([
        { id: "a", open: false },
        { id: "b", open: false },
      ])?.id,
    ).toBe("a");
  });

  it("asks when two classes are open", () => {
    expect(
      deskDefaultClass([
        { id: "a", open: true },
        { id: "b", open: true },
      ]),
    ).toBeNull();
  });

  it("is null with no classes", () => {
    expect(deskDefaultClass([])).toBeNull();
  });
});

describe("deskNames", () => {
  it("shows first name and last initial", () => {
    const names = deskNames([
      { id: "1", name: "Ana Maria  silva" },
      { id: "2", name: "Bruno" },
    ]);
    expect(names.get("1")).toBe("Ana S.");
    expect(names.get("2")).toBe("Bruno");
  });

  it("shows full names when short names clash", () => {
    const names = deskNames([
      { id: "1", name: "Ana Silva" },
      { id: "2", name: "ana Souza" },
      { id: "3", name: "Carla Mota" },
    ]);
    expect(names.get("1")).toBe("Ana Silva");
    expect(names.get("2")).toBe("ana Souza");
    expect(names.get("3")).toBe("Carla M.");
  });
});

describe("deskSearch", () => {
  const members = [
    { name: "João Silva" },
    { name: "Ana Souza" },
    { name: "Anabela Costa" },
  ];

  it("needs two letters", () => {
    expect(deskSearch(members, "a")).toEqual([]);
    expect(deskSearch(members, " ")).toEqual([]);
  });

  it("matches word starts, ignoring case and accents, name-ordered", () => {
    expect(deskSearch(members, "an").map((m) => m.name)).toEqual([
      "Ana Souza",
      "Anabela Costa",
    ]);
    expect(deskSearch(members, "joao").map((m) => m.name)).toEqual([
      "João Silva",
    ]);
  });

  it("needs every typed word to match", () => {
    expect(deskSearch(members, "ana so").map((m) => m.name)).toEqual([
      "Ana Souza",
    ]);
    expect(deskSearch(members, "ilva")).toEqual([]);
  });

  it("returns at most ten", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ name: `Ana ${i}` }));
    expect(deskSearch(many, "ana")).toHaveLength(10);
  });
});

describe("canUndoDeskCheckIn", () => {
  const now = new Date("2026-08-15T18:30:30Z");
  const row = {
    checkInSource: "reception_self",
    markedBy: null,
    attendanceStatus: "present",
    attendedAt: new Date("2026-08-15T18:30:10Z"),
  };

  it("allows a fresh desk check-in", () => {
    expect(canUndoDeskCheckIn(row, now)).toBe(true);
  });

  it("refuses after thirty seconds", () => {
    expect(canUndoDeskCheckIn(row, new Date("2026-08-15T18:30:40Z"))).toBe(
      false,
    );
  });

  it("refuses another source, a staff mark, or a row no longer present", () => {
    expect(canUndoDeskCheckIn({ ...row, checkInSource: "staff" }, now)).toBe(
      false,
    );
    expect(canUndoDeskCheckIn({ ...row, markedBy: "u1" }, now)).toBe(false);
    expect(
      canUndoDeskCheckIn({ ...row, attendanceStatus: "absent" }, now),
    ).toBe(false);
    expect(canUndoDeskCheckIn({ ...row, attendedAt: null }, now)).toBe(false);
  });
});
