import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DbExec } from "../src/client";
import {
  eventRole,
  recordActivity,
  recordMilestone,
} from "../src/product-event";
import {
  funnelSummary,
  weeklyOwnerOnly,
  weeklyRetainedUse,
  weeklyTwoBranchUse,
  weeksBack,
  weekTwoBookers,
} from "../src/product-report";
import { productEvent } from "../src/schema";
import { execOn, freshDb } from "./helpers";

const A = "academy_A";
const B = "academy_B";

async function insert(
  pg: PGlite,
  values: {
    organizationId: string;
    entityId?: string | null;
    kind: "milestone" | "activity";
    name: string;
    occurredAt: string;
  },
) {
  await pg.query(
    `INSERT INTO "product_event"
       (organization_id, entity_id, kind, name, occurred_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      values.organizationId,
      values.entityId ?? null,
      values.kind,
      values.name,
      values.occurredAt,
    ],
  );
}

describe("the event writer", () => {
  let pg: PGlite;
  let db: DbExec;

  beforeAll(async () => {
    pg = await freshDb([A, B]);
    db = execOn(pg);
  });

  afterAll(() => pg.close());

  it("writes one row and keeps the branch and the role", async () => {
    await recordMilestone(
      {
        organizationId: A,
        entityId: A,
        name: "organization_created",
        actorRole: "owner",
      },
      db,
    );
    const rows = await db
      .select()
      .from(productEvent)
      .where(eq(productEvent.name, "organization_created"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entityId).toBe(A);
    expect(rows[0]?.actorRole).toBe("owner");
    expect(rows[0]?.kind).toBe("milestone");
  });

  it("records a milestone once, however often it is sent", async () => {
    for (let i = 0; i < 3; i++) {
      await recordMilestone(
        { organizationId: A, entityId: A, name: "first_booking" },
        db,
      );
    }
    const rows = await db
      .select()
      .from(productEvent)
      .where(eq(productEvent.name, "first_booking"));
    expect(rows).toHaveLength(1);
  });

  it("keeps the same milestone at two branches apart", async () => {
    // A SECOND branch of the same gym. `academy_B` is another gym's branch, and
    // the composite key `(organization_id, entity_id)` refuses it, which is the
    // point of that key: the same milestone at two branches is two rows only
    // when both branches are this gym's.
    const second = `${A}_second`;
    await pg.query(
      `INSERT INTO "entity" (id, organization_id, type, name, slug, is_default, public_code)
         VALUES ($1, $2, 'bjj_academy', $1, $1, false, '990099')
         ON CONFLICT (id) DO NOTHING`,
      [second, A],
    );

    await recordMilestone(
      { organizationId: A, entityId: A, name: "branch_activated" },
      db,
    );
    await recordMilestone(
      { organizationId: A, entityId: second, name: "branch_activated" },
      db,
    );
    const rows = await db
      .select()
      .from(productEvent)
      .where(eq(productEvent.name, "branch_activated"));
    expect(rows).toHaveLength(2);
  });

  it("records every activity row, because repetition is the signal", async () => {
    for (let i = 0; i < 3; i++) {
      await recordActivity(
        { organizationId: A, entityId: A, name: "student_booking" },
        db,
      );
    }
    const rows = await db
      .select()
      .from(productEvent)
      .where(eq(productEvent.name, "student_booking"));
    expect(rows).toHaveLength(3);
  });

  it("does not throw when the write is refused", async () => {
    await expect(
      recordMilestone(
        { organizationId: "no_such_gym", name: "organization_created" },
        db,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("eventRole", () => {
  it("passes a role the check allows and drops anything else", () => {
    expect(eventRole("owner")).toBe("owner");
    expect(eventRole("student")).toBe("student");
    expect(eventRole("head coach")).toBeNull();
    expect(eventRole(null)).toBeNull();
  });
});

describe("weeksBack", () => {
  it("snaps to the Monday of the week that many weeks ago", () => {
    const thursday = new Date("2026-09-03T15:00:00.000Z");
    expect(weeksBack(1, thursday).toISOString()).toBe(
      "2026-08-31T00:00:00.000Z",
    );
    expect(weeksBack(3, thursday).toISOString()).toBe(
      "2026-08-17T00:00:00.000Z",
    );
  });
});

describe("the weekly report", () => {
  let pg: PGlite;
  let db: DbExec;
  const since = new Date("2026-08-17T00:00:00.000Z");

  beforeAll(async () => {
    pg = await freshDb([A, B]);
    db = execOn(pg);
    await insert(pg, {
      organizationId: A,
      entityId: A,
      kind: "activity",
      name: "student_booking",
      occurredAt: "2026-08-18T10:00:00Z",
    });
    await insert(pg, {
      organizationId: A,
      entityId: A,
      kind: "activity",
      name: "student_attendance",
      occurredAt: "2026-08-19T10:00:00Z",
    });
    await insert(pg, {
      organizationId: A,
      entityId: A,
      kind: "activity",
      name: "staff_action",
      occurredAt: "2026-08-19T10:00:00Z",
    });
    await insert(pg, {
      organizationId: B,
      entityId: B,
      kind: "activity",
      name: "staff_action",
      occurredAt: "2026-08-20T10:00:00Z",
    });
    await insert(pg, {
      organizationId: A,
      entityId: A,
      kind: "activity",
      name: "student_booking",
      occurredAt: "2026-08-25T10:00:00Z",
    });
  });

  afterAll(() => pg.close());

  it("counts a gym once a week, however many times its students act", async () => {
    const rows = await weeklyRetainedUse(since, db);
    expect(rows).toEqual([
      {
        weekStart: "2026-08-17",
        activeOrganizations: 1,
        bookingOrganizations: 1,
        attendanceOrganizations: 1,
        events: 2,
      },
      {
        weekStart: "2026-08-24",
        activeOrganizations: 1,
        bookingOrganizations: 1,
        attendanceOrganizations: 0,
        events: 1,
      },
    ]);
  });

  it("leaves a staff-only gym out of the use count", async () => {
    const rows = await weeklyRetainedUse(since, db);
    expect(rows[0]?.activeOrganizations).toBe(1);
  });

  it("names the week a gym worked and nobody trained", async () => {
    const rows = await weeklyOwnerOnly(since, db);
    expect(rows).toEqual([
      { weekStart: "2026-08-17", organizations: 1 },
      { weekStart: "2026-08-24", organizations: 0 },
    ]);
  });

  it("ignores anything before the start date", async () => {
    const rows = await weeklyRetainedUse(new Date("2026-08-24T00:00:00Z"), db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.weekStart).toBe("2026-08-24");
  });
});

describe("two branches in one week", () => {
  let pg: PGlite;
  let db: DbExec;
  const since = new Date("2026-08-17T00:00:00.000Z");

  beforeAll(async () => {
    pg = await freshDb([A, B]);
    db = execOn(pg);
    await pg.query(
      `INSERT INTO "entity" (id, organization_id, type, name, slug, is_default, public_code)
         VALUES ('academy_A2', $1, 'bjj_academy', 'Gym floor', 'gym-floor', false, '654321')`,
      [A],
    );
    for (const entityId of [A, "academy_A2"]) {
      await insert(pg, {
        organizationId: A,
        entityId,
        kind: "activity",
        name: "student_booking",
        occurredAt: "2026-08-18T10:00:00Z",
      });
    }
    await insert(pg, {
      organizationId: B,
      entityId: B,
      kind: "activity",
      name: "student_booking",
      occurredAt: "2026-08-18T10:00:00Z",
    });
  });

  afterAll(() => pg.close());

  it("counts only the gym whose students used two branches", async () => {
    const rows = await weeklyTwoBranchUse(since, db);
    expect(rows).toEqual([{ weekStart: "2026-08-17", organizations: 1 }]);
  });
});

describe("week two", () => {
  let pg: PGlite;
  let db: DbExec;

  beforeAll(async () => {
    pg = await freshDb([A, B]);
    db = execOn(pg);
    for (const org of [A, B]) {
      await insert(pg, {
        organizationId: org,
        kind: "milestone",
        name: "organization_created",
        occurredAt: "2026-08-01T10:00:00Z",
      });
    }
    await insert(pg, {
      organizationId: A,
      entityId: A,
      kind: "activity",
      name: "student_booking",
      occurredAt: "2026-08-10T10:00:00Z",
    });
    await insert(pg, {
      organizationId: B,
      entityId: B,
      kind: "activity",
      name: "student_booking",
      occurredAt: "2026-08-03T10:00:00Z",
    });
  });

  afterAll(() => pg.close());

  it("counts a gym whose students booked in the second week only", async () => {
    expect(await weekTwoBookers(db)).toBe(1);
  });
});

describe("funnelSummary", () => {
  const created = new Date("2026-08-01T00:00:00Z");
  const empty = {
    firstBranch: null,
    firstSchedule: null,
    firstStudent: null,
    firstBooking: null,
    firstPlan: null,
    firstAssignment: null,
    secondBranch: null,
    branchActivated: null,
    paidCommitment: null,
  };

  it("counts a gym as set up only when all five steps are there", () => {
    const summary = funnelSummary([
      {
        organizationId: A,
        created,
        ...empty,
        firstBranch: new Date("2026-08-02T00:00:00Z"),
        firstSchedule: new Date("2026-08-03T00:00:00Z"),
        firstStudent: new Date("2026-08-04T00:00:00Z"),
        firstPlan: new Date("2026-08-05T00:00:00Z"),
        firstAssignment: new Date("2026-08-06T00:00:00Z"),
      },
      {
        organizationId: B,
        created,
        ...empty,
        firstBranch: new Date("2026-08-02T00:00:00Z"),
        firstSchedule: new Date("2026-08-09T00:00:00Z"),
      },
    ]);
    expect(summary.gyms).toBe(2);
    expect(summary.setupComplete).toBe(1);
    expect(summary.reached.firstBranch).toBe(2);
    expect(summary.reached.firstAssignment).toBe(1);
    expect(summary.reached.paidCommitment).toBe(0);
  });

  it("takes the median of the days, not the average", () => {
    const rows = ["2026-08-02", "2026-08-04", "2026-08-31"].map((day, i) => ({
      organizationId: `org_${i}`,
      created,
      ...empty,
      firstSchedule: new Date(`${day}T00:00:00Z`),
    }));
    expect(funnelSummary(rows).medianDaysToSchedule).toBe(3);
  });

  it("says nothing rather than zero when no gym has got there", () => {
    const summary = funnelSummary([{ organizationId: A, created, ...empty }]);
    expect(summary.medianDaysToSchedule).toBeNull();
    expect(summary.medianDaysToFirstBooking).toBeNull();
  });
});
