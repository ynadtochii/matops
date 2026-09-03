import { describe, expect, it } from "vitest";

import type { EntitySummary } from "../src/dashboard";
import {
  combineEntitySummaries,
  entitiesNeedingAttention,
} from "../src/dashboard";

function summary(patch: Partial<EntitySummary> = {}): EntitySummary {
  return {
    entityId: "e1",
    name: "Mat",
    timeZone: "Europe/Lisbon",
    memberUserIds: [],
    pendingMembers: 0,
    newLeads: 0,
    openClaims: 0,
    upcomingClasses: 0,
    revenue: [],
    ...patch,
  };
}

describe("organization totals", () => {
  it("counts a person who trains at two mats once", () => {
    const total = combineEntitySummaries([
      summary({ entityId: "a", memberUserIds: ["u1", "u2"] }),
      summary({ entityId: "b", memberUserIds: ["u2", "u3"] }),
    ]);
    expect(total.members).toBe(3);
  });

  it("adds the work waiting at every mat", () => {
    const total = combineEntitySummaries([
      summary({ pendingMembers: 2, newLeads: 1, openClaims: 0 }),
      summary({ pendingMembers: 1, newLeads: 0, openClaims: 4 }),
    ]);
    expect([total.pendingMembers, total.newLeads, total.openClaims]).toEqual([
      3, 1, 4,
    ]);
  });

  it("never adds two currencies together", () => {
    const total = combineEntitySummaries([
      summary({ revenue: [{ currency: "EUR", amountMinor: 5000 }] }),
      summary({
        revenue: [
          { currency: "EUR", amountMinor: 2500 },
          { currency: "USD", amountMinor: 900 },
        ],
      }),
    ]);
    expect(total.revenue).toEqual([
      { currency: "EUR", amountMinor: 7500 },
      { currency: "USD", amountMinor: 900 },
    ]);
  });

  it("keeps each mat's own row, time zone and all", () => {
    const total = combineEntitySummaries([
      summary({ entityId: "a", name: "North", timeZone: "Europe/Lisbon" }),
      summary({ entityId: "b", name: "South", timeZone: "Europe/Kyiv" }),
    ]);
    expect(total.entities.map((e) => [e.entityId, e.timeZone])).toEqual([
      ["a", "Europe/Lisbon"],
      ["b", "Europe/Kyiv"],
    ]);
  });

  it("is empty for an organization with no academies", () => {
    const total = combineEntitySummaries([]);
    expect([
      total.members,
      total.revenue.length,
      total.entities.length,
    ]).toEqual([0, 0, 0]);
  });
});

describe("where the work is", () => {
  it("lists only the mats with something waiting, busiest first", () => {
    const quiet = summary({ entityId: "a", name: "Quiet" });
    const some = summary({ entityId: "b", name: "Some", newLeads: 1 });
    const busy = summary({ entityId: "c", name: "Busy", pendingMembers: 5 });
    expect(
      entitiesNeedingAttention([quiet, some, busy]).map((e) => e.entityId),
    ).toEqual(["c", "b"]);
  });

  it("breaks a tie by name so the order never jumps", () => {
    const north = summary({ entityId: "a", name: "North", openClaims: 2 });
    const east = summary({ entityId: "b", name: "East", openClaims: 2 });
    expect(entitiesNeedingAttention([north, east]).map((e) => e.name)).toEqual([
      "East",
      "North",
    ]);
  });
});
