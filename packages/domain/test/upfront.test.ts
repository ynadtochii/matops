import { describe, expect, it } from "vitest";

import type { UpfrontRule } from "../src/upfront";
import {
  discountProblem,
  monthsFrom,
  paidUntil,
  splitTotal,
  upfrontHint,
  upfrontRuleLabel,
  upfrontStart,
  upfrontTotal,
} from "../src/upfront";

const tenOff: UpfrontRule = { fromMonths: 3, percent: 10, monthMinor: null };
const fixed: UpfrontRule = { fromMonths: 6, percent: null, monthMinor: 5200 };

describe("upfrontTotal", () => {
  it("charges months times the monthly price without a rule", () => {
    expect(upfrontTotal(6000, null, 4)).toEqual({
      months: 4,
      fullMinor: 24000,
      totalMinor: 24000,
      savingMinor: 0,
    });
  });

  it("applies a percent rule from its first month", () => {
    expect(upfrontTotal(6000, tenOff, 2).totalMinor).toBe(12000);
    expect(upfrontTotal(6000, tenOff, 3)).toMatchObject({
      totalMinor: 16200,
      savingMinor: 1800,
    });
    expect(upfrontTotal(6000, tenOff, 6).totalMinor).toBe(32400);
  });

  it("rounds a percent rule to the nearest cent", () => {
    expect(upfrontTotal(3333, tenOff, 3).totalMinor).toBe(8999);
  });

  it("applies a fixed price per month from its first month", () => {
    expect(upfrontTotal(6000, fixed, 5).totalMinor).toBe(30000);
    expect(upfrontTotal(6000, fixed, 6)).toMatchObject({
      totalMinor: 31200,
      savingMinor: 4800,
    });
  });

  it("never charges more than the monthly price", () => {
    expect(upfrontTotal(5000, fixed, 6)).toMatchObject({
      totalMinor: 30000,
      savingMinor: 0,
    });
  });
});

describe("upfrontHint", () => {
  it("names the rule while the student is below its start", () => {
    expect(upfrontHint(6000, tenOff, 1)).toEqual(tenOff);
    expect(upfrontHint(6000, tenOff, 3)).toBeNull();
    expect(upfrontHint(6000, null, 1)).toBeNull();
  });

  it("stays quiet when the rule saves nothing", () => {
    expect(upfrontHint(5000, fixed, 1)).toBeNull();
  });
});

describe("splitTotal", () => {
  it("shares the total and puts the leftover cents on the first month", () => {
    expect(splitTotal(16200, 3)).toEqual([5400, 5400, 5400]);
    expect(splitTotal(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitTotal(4500, 1)).toEqual([4500]);
  });

  it("always adds up to the total", () => {
    for (const months of [1, 2, 5, 7, 12]) {
      const shares = splitTotal(12345, months);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(12345);
    }
  });
});

describe("monthsFrom", () => {
  it("lists consecutive months across a year end", () => {
    expect(monthsFrom("2026-11-01", 3)).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]);
  });
});

describe("upfrontStart", () => {
  it("starts at the first month not yet paid or claimed", () => {
    expect(upfrontStart("2026-11-01", new Set())).toBe("2026-11-01");
    expect(
      upfrontStart("2026-11-01", new Set(["2026-11-01", "2026-12-01"])),
    ).toBe("2027-01-01");
  });
});

describe("paidUntil", () => {
  it("gives the last month of the paid run that holds this month", () => {
    expect(
      paidUntil(
        "2026-11-01",
        new Set(["2026-11-01", "2026-12-01", "2027-02-01"]),
      ),
    ).toBe("2026-12-01");
    expect(paidUntil("2026-11-01", new Set(["2026-11-01"]))).toBe("2026-11-01");
    expect(paidUntil("2026-11-01", new Set(["2026-12-01"]))).toBeNull();
  });
});

describe("discountProblem", () => {
  it("accepts a percent or a fixed rule", () => {
    expect(discountProblem(tenOff, 6000)).toBeNull();
    expect(discountProblem(fixed, 6000)).toBeNull();
  });

  it("refuses a start outside 2 to 12 months", () => {
    expect(discountProblem({ ...tenOff, fromMonths: 1 }, 6000)).toBe(
      "from_range",
    );
    expect(discountProblem({ ...tenOff, fromMonths: 13 }, 6000)).toBe(
      "from_range",
    );
  });

  it("needs exactly one of percent and fixed price", () => {
    expect(
      discountProblem({ fromMonths: 3, percent: 10, monthMinor: 5000 }, 6000),
    ).toBe("pick_one");
    expect(
      discountProblem({ fromMonths: 3, percent: null, monthMinor: null }, 6000),
    ).toBe("pick_one");
  });

  it("refuses a percent outside 1 to 90", () => {
    expect(discountProblem({ ...tenOff, percent: 0 }, 6000)).toBe(
      "percent_range",
    );
    expect(discountProblem({ ...tenOff, percent: 91 }, 6000)).toBe(
      "percent_range",
    );
  });

  it("refuses a fixed price that is not below the monthly price", () => {
    expect(discountProblem({ ...fixed, monthMinor: 0 }, 6000)).toBe(
      "month_amount",
    );
    expect(discountProblem(fixed, 5200)).toBe("no_saving");
  });
});

describe("upfrontRuleLabel", () => {
  it("names where the rule starts and what it gives", () => {
    expect(upfrontRuleLabel(tenOff, "EUR")).toBe("From 3 months: 10% off");
    expect(upfrontRuleLabel(fixed, "EUR")).toMatch(
      /^From 6 months: .*52.* a month$/,
    );
  });
});
