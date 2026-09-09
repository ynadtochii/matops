import { describe, expect, it } from "vitest";

import type { Placement } from "../src/curriculum";
import {
  addDays,
  canonicalCategory,
  categoryNames,
  daysBetween,
  editableFloor,
  firstEditableIndex,
  groupByCategory,
  insertPlacement,
  isoWeek,
  mondayOf,
  movePlacement,
  nextStart,
  placementForDate,
  placementState,
  removePlacement,
  rippleFrom,
} from "../src/curriculum";

const at = (id: string, startsOn: string, weeks: number): Placement => ({
  id,
  startsOn,
  endsOn: addDays(startsOn, weeks * 7 - 1),
  weeks,
});

const plan = (): Placement[] => [
  at("a", "2026-08-11", 2),
  at("b", "2026-08-25", 2),
  at("c", "2026-09-08", 2),
  at("d", "2026-09-22", 2),
];

const TODAY = "2026-08-28";

const contiguous = (out: Placement[]) =>
  out
    .slice(1)
    .every((p, i) => daysBetween(out[i]?.endsOn ?? "", p.startsOn) === 1);

describe("canonicalCategory", () => {
  it("reuses the spelling a gym already has", () => {
    expect(canonicalCategory("guard", ["Guard", "Passing"])).toBe("Guard");
    expect(canonicalCategory("  GUARD ", ["Guard"])).toBe("Guard");
  });

  it("keeps a genuinely new name as typed", () => {
    expect(canonicalCategory("Leg locks", ["Guard"])).toBe("Leg locks");
  });

  it("treats blank as no category", () => {
    expect(canonicalCategory("   ", ["Guard"])).toBeNull();
    expect(canonicalCategory(null, [])).toBeNull();
    expect(canonicalCategory(undefined, [])).toBeNull();
  });
});

describe("categoryNames", () => {
  it("lists each category once, in order", () => {
    expect(
      categoryNames([
        { category: "Passing", theme: "a" },
        { category: "Guard", theme: "b" },
        { category: "Passing", theme: "c" },
        { category: null, theme: "d" },
      ]),
    ).toEqual(["Guard", "Passing"]);
  });

  it("keeps the first spelling when two differ only in case", () => {
    expect(
      categoryNames([
        { category: "Guard", theme: "a" },
        { category: "guard", theme: "b" },
      ]),
    ).toEqual(["Guard"]);
  });
});

describe("groupByCategory", () => {
  it("sorts the groups and the blocks inside them", () => {
    const out = groupByCategory([
      { category: "Passing", theme: "Knee slice" },
      { category: "Guard", theme: "Retention" },
      { category: "Guard", theme: "Closed guard" },
    ]);
    expect(out.map((g) => g.category)).toEqual(["Guard", "Passing"]);
    expect(out[0]?.blocks.map((b) => b.theme)).toEqual([
      "Closed guard",
      "Retention",
    ]);
  });

  it("puts the blocks with no category last", () => {
    const out = groupByCategory([
      { category: null, theme: "Loose" },
      { category: "Guard", theme: "Retention" },
    ]);
    expect(out.map((g) => g.category)).toEqual(["Guard", null]);
  });

  it("returns nothing for an empty library", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("rippleFrom", () => {
  it("extends a placement and pushes every later one back", () => {
    expect(
      rippleFrom(plan(), 1, 3).map((p) => [p.startsOn, p.endsOn, p.weeks]),
    ).toEqual([
      ["2026-08-11", "2026-08-24", 2],
      ["2026-08-25", "2026-09-14", 3],
      ["2026-09-15", "2026-09-28", 2],
      ["2026-09-29", "2026-10-12", 2],
    ]);
  });

  it("shortens a placement and pulls every later one forward", () => {
    expect(rippleFrom(plan(), 1, 1).map((p) => p.startsOn)).toEqual([
      "2026-08-11",
      "2026-08-25",
      "2026-09-01",
      "2026-09-15",
    ]);
  });

  it("leaves no gap and no overlap", () => {
    expect(contiguous(rippleFrom(plan(), 0, 6))).toBe(true);
  });

  it("returns everything before the index untouched, by reference", () => {
    const input = plan();
    const out = rippleFrom(input, 2, 4);
    expect(out[0]).toBe(input[0]);
    expect(out[1]).toBe(input[1]);
  });

  it("does not mutate its input", () => {
    const input = plan();
    rippleFrom(input, 0, 8);
    expect(input[1]?.startsOn).toBe("2026-08-25");
  });

  it("rejects a bad index or a bad duration", () => {
    expect(() => rippleFrom(plan(), 4, 2)).toThrow(RangeError);
    expect(() => rippleFrom(plan(), 0, 0)).toThrow(RangeError);
    expect(() => rippleFrom(plan(), 0, 1.5)).toThrow(RangeError);
    expect(() => rippleFrom(plan(), 0, 53)).toThrow(RangeError);
  });

  it("crosses a month and a year end", () => {
    expect(rippleFrom([at("x", "2026-12-21", 2)], 0, 3)[0]?.endsOn).toBe(
      "2027-01-10",
    );
  });
});

describe("insertPlacement", () => {
  it("takes the start of the position it lands on and pushes the rest down", () => {
    const out = insertPlacement(plan(), 2, at("new", "1970-01-01", 1), TODAY);
    expect(out.map((p) => [p.id, p.startsOn])).toEqual([
      ["a", "2026-08-11"],
      ["b", "2026-08-25"],
      ["new", "2026-09-08"],
      ["c", "2026-09-15"],
      ["d", "2026-09-29"],
    ]);
  });

  it("appends after the plan when dropped past the end", () => {
    const out = insertPlacement(plan(), 9, at("new", "1970-01-01", 2), TODAY);
    expect(out).toHaveLength(5);
    expect(out[4]?.startsOn).toBe("2026-10-06");
    expect(contiguous(out)).toBe(true);
  });

  it("starts an empty plan on this week's Monday", () => {
    const out = insertPlacement([], 0, at("new", "1970-01-01", 2), TODAY);
    expect(out[0]?.startsOn).toBe("2026-08-24");
    expect(out[0]?.endsOn).toBe("2026-09-06");
  });

  it("keeps the plan contiguous wherever it lands", () => {
    for (let i = 0; i <= 4; i++) {
      expect(
        contiguous(insertPlacement(plan(), i, at("n", "1970-01-01", 3), TODAY)),
      ).toBe(true);
    }
  });
});

describe("removePlacement", () => {
  it("closes the gap it leaves", () => {
    const out = removePlacement(plan(), 1);
    expect(out.map((p) => [p.id, p.startsOn])).toEqual([
      ["a", "2026-08-11"],
      ["c", "2026-08-25"],
      ["d", "2026-09-08"],
    ]);
  });

  it("takes the last one off without touching the rest", () => {
    const out = removePlacement(plan(), 3);
    expect(out.map((p) => p.startsOn)).toEqual([
      "2026-08-11",
      "2026-08-25",
      "2026-09-08",
    ]);
  });

  it("is a no-op on an index that is not there", () => {
    const input = plan();
    expect(removePlacement(input, 9)).toBe(input);
  });
});

describe("movePlacement", () => {
  it("swaps two and keeps every start day", () => {
    const out = movePlacement(plan(), 2, 1);
    expect(out.map((p) => p.id)).toEqual(["a", "c", "b", "d"]);
    expect(out.map((p) => p.startsOn)).toEqual([
      "2026-08-11",
      "2026-08-25",
      "2026-09-08",
      "2026-09-22",
    ]);
  });

  it("moves across several positions", () => {
    const out = movePlacement(plan(), 3, 1);
    expect(out.map((p) => p.id)).toEqual(["a", "d", "b", "c"]);
    expect(out.map((p) => p.startsOn)).toEqual([
      "2026-08-11",
      "2026-08-25",
      "2026-09-08",
      "2026-09-22",
    ]);
  });

  it("re-dates when the moved one has a different length", () => {
    const uneven = [
      at("a", "2026-08-11", 2),
      at("b", "2026-08-25", 1),
      at("c", "2026-09-01", 2),
    ];
    expect(movePlacement(uneven, 2, 1).map((p) => [p.id, p.startsOn])).toEqual([
      ["a", "2026-08-11"],
      ["c", "2026-08-25"],
      ["b", "2026-09-08"],
    ]);
  });

  it("is a no-op when it lands where it started", () => {
    const input = plan();
    expect(movePlacement(input, 1, 1)).toBe(input);
  });

  it("clamps a target past the end", () => {
    const out = movePlacement(plan(), 0, 99);
    expect(out.map((p) => p.id)).toEqual(["b", "c", "d", "a"]);
    expect(contiguous(out)).toBe(true);
  });
});

describe("placementState", () => {
  it("calls one that ended settled", () => {
    expect(placementState(at("a", "2026-08-11", 2), TODAY)).toBe("settled");
  });

  it("calls one covering today running", () => {
    expect(placementState(at("b", "2026-08-25", 2), TODAY)).toBe("running");
  });

  it("calls one starting later a draft", () => {
    expect(placementState(at("c", "2026-09-08", 2), TODAY)).toBe("draft");
  });
});

describe("firstEditableIndex / firstDraftIndex", () => {
  it("puts the editable floor on the running block, not past it", () => {
    expect(editableFloor(plan(), TODAY)).toBe(1);
    expect(editableFloor([], TODAY)).toBe(0);
  });

  it("never lets a ripple start on a settled placement", () => {
    const blocks = plan();
    const out = rippleFrom(blocks, firstEditableIndex(blocks, TODAY), 4);
    expect(out[0]).toEqual(blocks[0]);
  });
});

describe("nextStart", () => {
  it("starts the day after the plan ends", () => {
    expect(nextStart(plan(), TODAY)).toBe("2026-10-06");
  });

  it("starts this week's Monday when there is no plan", () => {
    expect(nextStart([], TODAY)).toBe("2026-08-24");
    expect(nextStart([], "2026-08-24")).toBe("2026-08-24");
  });

  it("starts this week's Monday when the whole plan has ended", () => {
    expect(nextStart(plan(), "2027-01-01")).toBe("2026-12-28");
  });

  it("never starts before the plan it follows", () => {
    expect(nextStart([at("a", "2026-08-26", 1)], TODAY)).toBe("2026-09-02");
  });
});

describe("placementForDate", () => {
  it("returns the placement covering the date, inclusive at both ends", () => {
    expect(placementForDate(plan(), "2026-08-25")?.id).toBe("b");
    expect(placementForDate(plan(), "2026-09-07")?.id).toBe("b");
  });

  it("returns null when nothing covers the date", () => {
    expect(
      placementForDate([at("a", "2026-08-11", 2)], "2026-09-01"),
    ).toBeNull();
  });
});
describe("isoWeek", () => {
  it("numbers an ordinary week", () => {
    expect(isoWeek("2026-08-28")).toBe(35);
    expect(isoWeek("2026-08-11")).toBe(33);
  });

  it("keeps a year-end week with the year that owns its Thursday", () => {
    expect(isoWeek("2026-12-31")).toBe(53);
    expect(isoWeek("2027-01-03")).toBe(53);
    expect(isoWeek("2021-01-01")).toBe(53);
    expect(isoWeek("2026-01-01")).toBe(1);
  });
});

describe("mondayOf", () => {
  it("snaps every day of a week back to its Monday", () => {
    for (const day of [
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]) {
      expect(mondayOf(day)).toBe("2026-08-24");
    }
    expect(mondayOf("2026-08-31")).toBe("2026-08-31");
  });

  it("crosses a month and a year end", () => {
    expect(mondayOf("2026-09-02")).toBe("2026-08-31");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });
});

describe("daysBetween", () => {
  it("counts whole days across a month end", () => {
    expect(daysBetween("2026-08-28", "2026-09-01")).toBe(4);
    expect(daysBetween("2026-09-01", "2026-08-28")).toBe(-4);
  });
});
