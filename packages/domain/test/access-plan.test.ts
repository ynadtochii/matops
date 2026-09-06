import { describe, expect, it } from "vitest";

import type { AssignmentCoverage } from "../src/access-plan";
import {
  affectedByCoverageChange,
  appliesInMonth,
  canEditPlan,
  changeIsPending,
  coverageChange,
  coveredEntities,
  periodsOverlap,
} from "../src/access-plan";

const MAT = "e_mat";
const GYM = "e_gym";
const SAUNA = "e_sauna";

const assignment = (
  over: Partial<AssignmentCoverage> & { id: string },
): AssignmentCoverage => ({
  userId: "u_alex",
  planId: "p_bjj",
  status: "active",
  entityIds: [MAT],
  ...over,
});

describe("coveredEntities", () => {
  it("is the union of what the active assignments cover", () => {
    expect(
      coveredEntities([
        assignment({ id: "a1", entityIds: [MAT, GYM] }),
        assignment({ id: "a2", planId: "p_spa", entityIds: [GYM, SAUNA] }),
      ]),
    ).toEqual([GYM, MAT, SAUNA].sort());
  });

  it("counts one entity once, however many plans cover it", () => {
    expect(
      coveredEntities([
        assignment({ id: "a1", entityIds: [GYM] }),
        assignment({ id: "a2", planId: "p_spa", entityIds: [GYM] }),
      ]),
    ).toEqual([GYM]);
  });

  it("gives a suspended or cancelled assignment no coverage at all", () => {
    for (const status of ["suspended", "cancelled"] as const) {
      expect([
        status,
        coveredEntities([assignment({ id: "a1", status })]),
      ]).toEqual([status, []]);
    }
  });

  it("keeps the coverage a second live membership still grants", () => {
    expect(
      coveredEntities([
        assignment({ id: "a1", status: "suspended", entityIds: [MAT, GYM] }),
        assignment({ id: "a2", planId: "p_spa", entityIds: [GYM] }),
      ]),
    ).toEqual([GYM]);
  });

  it("covers nothing when there is nothing", () => {
    expect(coveredEntities([])).toEqual([]);
  });
});

describe("canEditPlan", () => {
  it("freezes an archived plan and leaves a live one alone", () => {
    expect(canEditPlan({ id: "p_bjj", archived: false })).toBe(true);
    expect(canEditPlan({ id: "p_bjj", archived: true })).toBe(false);
  });
});

describe("coverageChange", () => {
  it("names what an edit adds and what it takes away", () => {
    expect(coverageChange([MAT, GYM], [MAT, SAUNA])).toEqual({
      added: [SAUNA],
      removed: [GYM],
    });
  });

  it("reports nothing when the coverage is the same, in any order", () => {
    expect(coverageChange([MAT, GYM], [GYM, MAT])).toEqual({
      added: [],
      removed: [],
    });
  });
});

describe("affectedByCoverageChange", () => {
  it("shows who the new branch opens to", () => {
    const rows = affectedByCoverageChange(
      "p_bjj",
      [MAT, GYM],
      [assignment({ id: "a1" }), assignment({ id: "a2", userId: "u_bea" })],
    );
    expect(rows).toEqual([
      { userId: "u_alex", assignmentId: "a1", gains: [GYM], loses: [] },
      { userId: "u_bea", assignmentId: "a2", gains: [GYM], loses: [] },
    ]);
  });

  it("counts a loss only where nothing else of theirs covers it", () => {
    const rows = affectedByCoverageChange(
      "p_bjj",
      [MAT],
      [
        assignment({ id: "a1", entityIds: [MAT, GYM] }),
        assignment({
          id: "a2",
          planId: "p_spa",
          entityIds: [GYM, SAUNA],
        }),
        assignment({ id: "a3", userId: "u_bea", entityIds: [MAT, GYM] }),
      ],
    );
    // Only Bea is affected. Alex holds a second membership covering the gym,
    // so the edit costs them nothing and they are not in the list at all: a
    // preview of who is affected must not name somebody who is not.
    expect(rows).toEqual([
      { userId: "u_bea", assignmentId: "a3", gains: [], loses: [GYM] },
    ]);
  });

  it("ignores a second membership that is itself suspended", () => {
    const rows = affectedByCoverageChange(
      "p_bjj",
      [MAT],
      [
        assignment({ id: "a1", entityIds: [MAT, GYM] }),
        assignment({
          id: "a2",
          planId: "p_spa",
          status: "suspended",
          entityIds: [GYM],
        }),
      ],
    );
    expect(rows).toEqual([
      { userId: "u_alex", assignmentId: "a1", gains: [], loses: [GYM] },
    ]);
  });

  it("leaves a suspended assignment out of the preview", () => {
    expect(
      affectedByCoverageChange(
        "p_bjj",
        [MAT, GYM],
        [assignment({ id: "a1", status: "suspended" })],
      ),
    ).toEqual([]);
  });

  it("lists nobody when the edit changes nothing", () => {
    expect(
      affectedByCoverageChange("p_bjj", [MAT], [assignment({ id: "a1" })]),
    ).toEqual([]);
  });

  it("does not reach the holders of another plan", () => {
    const rows = affectedByCoverageChange(
      "p_bjj",
      [MAT, GYM],
      [
        assignment({ id: "a1" }),
        assignment({ id: "a2", userId: "u_bea", planId: "p_spa" }),
      ],
    );
    expect(rows.map((r) => r.assignmentId)).toEqual(["a1"]);
  });
});

describe("assignment periods", () => {
  const open = { startMonth: "2026-09-01", endMonth: null };
  const ended = { startMonth: "2026-09-01", endMonth: "2026-11-01" };

  it("starts in its own month and never before it", () => {
    expect(appliesInMonth(open, "2026-08-01")).toBe(false);
    expect(appliesInMonth(open, "2026-09-01")).toBe(true);
    expect(appliesInMonth(open, "2030-01-01")).toBe(true);
  });

  it("treats the end as the first month it no longer applies", () => {
    expect(appliesInMonth(ended, "2026-10-01")).toBe(true);
    expect(appliesInMonth(ended, "2026-11-01")).toBe(false);
  });

  it("lets one period start exactly where the other ends", () => {
    const successor = { startMonth: "2026-11-01", endMonth: null };
    expect(periodsOverlap(ended, successor)).toBe(false);
    expect(appliesInMonth(ended, "2026-11-01")).toBe(false);
    expect(appliesInMonth(successor, "2026-11-01")).toBe(true);
  });

  it("refuses two periods that share a month", () => {
    expect(
      periodsOverlap(open, { startMonth: "2027-01-01", endMonth: null }),
    ).toBe(true);
    expect(
      periodsOverlap(ended, { startMonth: "2026-10-01", endMonth: null }),
    ).toBe(true);
  });

  it("reads pending off the calendar, not off a flag", () => {
    const change = { effectiveMonth: "2026-10-01", cancelledAt: null };
    expect(changeIsPending(change, "2026-09-01")).toBe(true);
    expect(changeIsPending(change, "2026-10-01")).toBe(false);
    expect(
      changeIsPending({ ...change, cancelledAt: new Date() }, "2026-09-01"),
    ).toBe(false);
  });
});
