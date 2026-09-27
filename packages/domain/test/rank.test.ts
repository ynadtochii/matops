import { describe, expect, it } from "vitest";

import {
  compareRank,
  disciplineLabel,
  formatRank,
  isRankChange,
  isRankRegression,
  isValidRank,
  RANK_SYSTEMS,
  rankDisciplines,
} from "../src/rank";

describe("rank systems", () => {
  it("lists the ranked disciplines for the owner picker", () => {
    const keys = rankDisciplines().map((s) => s.discipline);
    expect(keys).toEqual(Object.keys(RANK_SYSTEMS));
    expect(keys).toContain("bjj");
  });
});

describe("isValidRank", () => {
  it("accepts a belt + stripe count inside the system", () => {
    expect(isValidRank("bjj", "Blue", 2)).toBe(true);
    expect(isValidRank("bjj", "White", 0)).toBe(true);
    expect(isValidRank("bjj", "Black", 4)).toBe(true);
  });

  it("rejects a belt not in the ladder", () => {
    expect(isValidRank("bjj", "Red", 0)).toBe(false);
    expect(isValidRank("bjj", "Yellow", 0)).toBe(false);
  });

  it("rejects stripes out of range or non-integer", () => {
    expect(isValidRank("bjj", "Blue", 5)).toBe(false);
    expect(isValidRank("bjj", "Blue", -1)).toBe(false);
    expect(isValidRank("bjj", "Blue", 1.5)).toBe(false);
  });

  it("rejects a discipline with no seeded system", () => {
    expect(isValidRank("boxing", "White", 0)).toBe(false);
    expect(isValidRank("judo", "Green", 0)).toBe(false);
  });
});

describe("formatRank", () => {
  it("shows the stripe count, pluralised", () => {
    expect(formatRank({ discipline: "bjj", belt: "Blue", stripes: 2 })).toBe(
      "Blue · 2 stripes",
    );
    expect(formatRank({ discipline: "bjj", belt: "Blue", stripes: 1 })).toBe(
      "Blue · 1 stripe",
    );
  });

  it("omits stripes when zero", () => {
    expect(formatRank({ discipline: "bjj", belt: "White", stripes: 0 })).toBe(
      "White",
    );
  });

  it("shows only the belt for a discipline with no seeded system", () => {
    expect(formatRank({ discipline: "judo", belt: "Green", stripes: 2 })).toBe(
      "Green",
    );
  });
});

describe("disciplineLabel", () => {
  it("uses the seeded label, or the raw key as a fallback", () => {
    expect(disciplineLabel("bjj")).toBe("Brazilian Jiu-Jitsu");
    expect(disciplineLabel("boxing")).toBe("boxing");
  });
});

describe("isRankChange", () => {
  it("is a change when there is no current rank", () => {
    expect(isRankChange(null, { belt: "White", stripes: 0 })).toBe(true);
  });

  it("is a change when belt or stripes differ", () => {
    const cur = { belt: "Blue", stripes: 1 };
    expect(isRankChange(cur, { belt: "Blue", stripes: 2 })).toBe(true);
    expect(isRankChange(cur, { belt: "Purple", stripes: 0 })).toBe(true);
  });

  it("is not a change when identical", () => {
    expect(
      isRankChange({ belt: "Blue", stripes: 2 }, { belt: "Blue", stripes: 2 }),
    ).toBe(false);
  });
});

describe("compareRank", () => {
  it("orders by belt position first", () => {
    const white = { belt: "White", stripes: 0 };
    const blue = { belt: "Blue", stripes: 0 };
    expect(compareRank("bjj", white, blue)).toBeLessThan(0);
    expect(compareRank("bjj", blue, white)).toBeGreaterThan(0);
  });

  it("breaks a same-belt tie by stripes", () => {
    const one = { belt: "Blue", stripes: 1 };
    const two = { belt: "Blue", stripes: 2 };
    expect(compareRank("bjj", one, two)).toBeLessThan(0);
    expect(compareRank("bjj", two, two)).toBe(0);
  });

  it("puts a higher belt above a fully-striped lower belt", () => {
    // White · 4 stripes is still below Blue · 0 — belt dominates stripes.
    expect(
      compareRank(
        "bjj",
        { belt: "White", stripes: 4 },
        { belt: "Blue", stripes: 0 },
      ),
    ).toBeLessThan(0);
  });
});

describe("isRankRegression", () => {
  it("allows a first rank (no current)", () => {
    expect(isRankRegression("bjj", null, { belt: "White", stripes: 0 })).toBe(
      false,
    );
  });

  it("allows a stripe bump on the same belt", () => {
    expect(
      isRankRegression(
        "bjj",
        { belt: "Blue", stripes: 1 },
        { belt: "Blue", stripes: 2 },
      ),
    ).toBe(false);
  });

  it("allows a belt promotion even when stripes reset to zero", () => {
    expect(
      isRankRegression(
        "bjj",
        { belt: "White", stripes: 4 },
        { belt: "Blue", stripes: 0 },
      ),
    ).toBe(false);
  });

  it("allows setting the same rank (no-op, not a regression)", () => {
    expect(
      isRankRegression(
        "bjj",
        { belt: "Blue", stripes: 2 },
        { belt: "Blue", stripes: 2 },
      ),
    ).toBe(false);
  });

  it("rejects dropping a stripe on the same belt", () => {
    expect(
      isRankRegression(
        "bjj",
        { belt: "Blue", stripes: 2 },
        { belt: "Blue", stripes: 1 },
      ),
    ).toBe(true);
  });

  it("rejects dropping to a lower belt", () => {
    expect(
      isRankRegression(
        "bjj",
        { belt: "Purple", stripes: 0 },
        { belt: "Blue", stripes: 4 },
      ),
    ).toBe(true);
  });
});
