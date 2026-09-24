import { describe, expect, it } from "vitest";

import {
  defaultReceptionClass,
  RECEPTION_LOOKAHEAD_DAYS,
  receptionClassAction,
  receptionClasses,
  receptionClassWindow,
  receptionSearchText,
} from "../src/reception";

const LISBON = { timeZone: "Europe/Lisbon", bookingWindowDays: 7 };

function cls(
  id: string,
  startsAt: string,
  extra: Partial<{
    durationMinutes: number;
    status: string;
    deletedAt: Date | null;
  }> = {},
) {
  return {
    id,
    title: id,
    startsAt: new Date(startsAt),
    durationMinutes: 60,
    status: "scheduled",
    deletedAt: null,
    ...extra,
  };
}

describe("reception name search", () => {
  it("matches accented names and surrounding whitespace", () => {
    expect(receptionSearchText("  JOÃO Ávila  ")).toBe("joao avila");
    expect(receptionSearchText("José")).toBe("jose");
  });
});

describe("reception class window", () => {
  it("covers today and the days ahead in the branch zone", () => {
    const window = receptionClassWindow(
      new Date("2026-09-12T15:00:00Z"),
      "Europe/Lisbon",
    );
    expect(RECEPTION_LOOKAHEAD_DAYS).toBe(3);
    expect(window.from.toISOString()).toBe("2026-09-11T23:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-15T23:00:00.000Z");
  });

  it("narrows to the days a caller asks for", () => {
    const window = receptionClassWindow(
      new Date("2026-09-12T15:00:00Z"),
      "Europe/Lisbon",
      1,
    );
    expect(window.to.toISOString()).toBe("2026-09-13T23:00:00.000Z");
  });

  it("uses the branch day, not the UTC day", () => {
    const window = receptionClassWindow(
      new Date("2026-09-12T23:30:00Z"),
      "Europe/Lisbon",
    );
    expect(window.from.toISOString()).toBe("2026-09-12T23:00:00.000Z");
  });

  it("handles the day daylight saving time ends", () => {
    const window = receptionClassWindow(
      new Date("2026-10-25T00:30:00Z"),
      "Europe/Lisbon",
      1,
    );
    expect(window.from.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-10-27T00:00:00.000Z");
  });
});

describe("reception class action", () => {
  const now = new Date("2026-09-12T10:00:00Z");

  it("books a class more than an hour away", () => {
    expect(
      receptionClassAction(cls("a", "2026-09-12T18:00:00Z"), now, LISBON),
    ).toBe("book");
  });

  it("checks in from exactly sixty minutes before the start", () => {
    expect(
      receptionClassAction(cls("a", "2026-09-12T11:00:00Z"), now, LISBON),
    ).toBe("check-in");
    expect(
      receptionClassAction(cls("a", "2026-09-12T11:00:01Z"), now, LISBON),
    ).toBe("book");
  });

  it("keeps checking in while the class runs", () => {
    expect(
      receptionClassAction(cls("a", "2026-09-12T09:30:00Z"), now, LISBON),
    ).toBe("check-in");
  });

  it("closes a class the branch booking window does not reach", () => {
    expect(
      receptionClassAction(cls("a", "2026-09-13T18:00:00Z"), now, {
        timeZone: "Europe/Lisbon",
        bookingWindowDays: 1,
      }),
    ).toBe("closed");
  });
});

describe("reception class list", () => {
  const now = new Date("2026-09-12T10:00:00Z");

  it("numbers each local day from today and orders by start", () => {
    const rows = receptionClasses(
      [
        cls("day-three", "2026-09-15T18:00:00Z"),
        cls("tomorrow", "2026-09-13T18:00:00Z"),
        cls("later-today", "2026-09-12T19:00:00Z"),
        cls("running", "2026-09-12T09:30:00Z"),
      ],
      now,
      LISBON,
    );
    expect(rows.map((r) => [r.id, r.dayOffset, r.action])).toEqual([
      ["running", 0, "check-in"],
      ["later-today", 0, "book"],
      ["tomorrow", 1, "book"],
      ["day-three", 3, "book"],
    ]);
  });

  it("stops at the last day on offer", () => {
    const rows = receptionClasses(
      [
        cls("day-three", "2026-09-15T18:00:00Z"),
        cls("day-four", "2026-09-16T18:00:00Z"),
      ],
      now,
      LISBON,
    );
    expect(rows.map((r) => r.id)).toEqual(["day-three"]);
  });

  it("honours a caller that asks for fewer days", () => {
    const rows = receptionClasses(
      [
        cls("tomorrow", "2026-09-13T18:00:00Z"),
        cls("day-two", "2026-09-14T18:00:00Z"),
      ],
      now,
      { ...LISBON, daysAhead: 1 },
    );
    expect(rows.map((r) => r.id)).toEqual(["tomorrow"]);
  });

  it("keeps a running class until its exact end and drops it after", () => {
    const running = cls("running", "2026-09-12T09:00:00Z");
    expect(
      receptionClasses([running], new Date("2026-09-12T09:59:59Z"), LISBON),
    ).toHaveLength(1);
    expect(
      receptionClasses([running], new Date("2026-09-12T10:00:00Z"), LISBON),
    ).toEqual([]);
  });

  it("never lists cancelled, deleted, or a class past the window", () => {
    const rows = receptionClasses(
      [
        cls("cancelled", "2026-09-12T18:00:00Z", { status: "cancelled" }),
        cls("deleted", "2026-09-12T18:00:00Z", { deletedAt: new Date() }),
        cls("past-the-window", "2026-09-16T18:00:00Z"),
      ],
      now,
      LISBON,
    );
    expect(rows).toEqual([]);
  });

  it("reports the end of each class it lists", () => {
    const [row] = receptionClasses(
      [cls("a", "2026-09-12T18:00:00Z", { durationMinutes: 90 })],
      now,
      LISBON,
    );
    expect(row?.endsAt.toISOString()).toBe("2026-09-12T19:30:00.000Z");
  });
});

describe("the class reception offers without being asked", () => {
  const card = (id: string, action: "check-in" | "book" | "closed") => ({
    id,
    action,
  });

  it("prefers the class that is running over a later one", () => {
    expect(
      defaultReceptionClass([
        card("running", "check-in"),
        card("later", "book"),
      ])?.id,
    ).toBe("running");
  });

  it("falls back to the soonest bookable class", () => {
    expect(
      defaultReceptionClass([card("soonest", "book"), card("after", "book")])
        ?.id,
    ).toBe("soonest");
  });

  it("skips a class the booking window has closed", () => {
    expect(
      defaultReceptionClass([card("far", "closed"), card("soon", "book")])?.id,
    ).toBe("soon");
  });

  it("asks rather than guess between two classes open at once", () => {
    expect(
      defaultReceptionClass([
        card("mat-one", "check-in"),
        card("mat-two", "check-in"),
        card("later", "book"),
      ]),
    ).toBeNull();
  });

  it("offers nothing when there is nothing to offer", () => {
    expect(defaultReceptionClass([])).toBeNull();
    expect(defaultReceptionClass([card("far", "closed")])).toBeNull();
  });
});
