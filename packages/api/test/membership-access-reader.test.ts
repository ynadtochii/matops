import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity, withScope } from "@matops/db";

import type { Harness } from "./helpers";
import {
  loadMembershipAccess,
  loadRosterStanding,
} from "../src/membership-access";
import { harness, seedAcademies } from "./helpers";

const ORG = "acad_reader";
const BOSS = "u_reader_owner";
const SAM = "u_reader_sam";

const IN_GRACE = new Date("2026-09-03T09:00:00Z");
const PAST_GRACE = new Date("2026-09-25T09:00:00Z");
const NEXT_MONTH = new Date("2026-10-20T09:00:00Z");

describe("the scoped membership access reader", () => {
  let h: Harness;
  let gym: string;
  let assignment: string;

  const owner = () => h.as(BOSS, ORG);

  /** Ask the reader inside a real scoped transaction, as a request would. */
  const ask = (input: {
    now: Date;
    sessionAt?: Date;
    entityId?: string;
    membership?: { status: string } | null;
  }) =>
    withScope(
      { organizationId: ORG, entityId: input.entityId ?? ORG },
      (tx) =>
        loadMembershipAccess(tx, {
          userId: SAM,
          entityId: input.entityId ?? ORG,
          membership:
            input.membership === undefined
              ? { status: "active" }
              : input.membership,
          now: input.now,
          sessionAt: input.sessionAt,
        }),
      h.exec,
    );

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700088",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: SAM, role: "student", status: "active" },
          { userId: "reader_coach", role: "instructor", status: "active" },
          {
            userId: "reader_paused_coach",
            role: "instructor",
            status: "suspended",
          },
        ],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "general_space",
        name: "The Gym",
        ownerUserId: BOSS,
      },
      h.exec,
    );
    gym = made.entityId;
    const plan = await owner().accessPlan.create({
      name: "Mat only",
      entityIds: [ORG],
    });
    assignment = (
      await owner().accessPlan.assign({
        userId: SAM,
        planId: plan.id,
        startMonth: "2026-09-01",
      })
    ).id;
  });

  afterAll(() => h.close());

  it("admits inside the grace window", async () => {
    const seen = await ask({ now: IN_GRACE });
    expect([seen.now, seen.atSession]).toEqual(["ok", "ok"]);
  });

  it("says not covered at a branch the plan does not name", async () => {
    const seen = await ask({ now: IN_GRACE, entityId: gym });
    expect(seen.now).toBe("not-covered");
  });

  it("expires once the deadline has passed", async () => {
    const seen = await ask({ now: PAST_GRACE });
    expect(seen.now).toBe("expired");
  });

  it("answers separately for now and for the class's own month", async () => {
    // Today is fine. The class is next month, which nobody has paid for, and
    // by the time it starts that month's own deadline has gone.
    await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month: "2026-09-01",
      paid: true,
    });
    const seen = await ask({ now: PAST_GRACE, sessionAt: NEXT_MONTH });
    expect([seen.now, seen.atSession]).toEqual(["ok", "expired"]);
  });

  it("lets a paid future month through", async () => {
    await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month: "2026-10-01",
      paid: true,
    });
    const seen = await ask({ now: PAST_GRACE, sessionAt: NEXT_MONTH });
    expect([seen.now, seen.atSession]).toEqual(["ok", "ok"]);
  });

  it("keeps a branch suspension above a paid membership", async () => {
    const seen = await ask({
      now: IN_GRACE,
      membership: { status: "suspended" },
    });
    expect(seen.now).toBe("suspended");
  });

  it("grants an owner staff access without a paid membership", async () => {
    const seen = await withScope(
      { organizationId: ORG, entityId: ORG },
      (tx) =>
        loadMembershipAccess(tx, {
          userId: BOSS,
          entityId: ORG,
          membership: { status: "active" },
          now: IN_GRACE,
        }),
      h.exec,
    );
    expect([seen.now, seen.assignments, seen.accessSource]).toEqual([
      "ok",
      [],
      "staff",
    ]);
  });
  it("keeps active and suspended instructors separate from payment coverage", async () => {
    const seen = await withScope(
      { organizationId: ORG, entityId: ORG },
      (tx) =>
        loadRosterStanding(tx, {
          entityId: ORG,
          people: [
            { userId: "reader_coach", role: "instructor", status: "active" },
            {
              userId: "reader_paused_coach",
              role: "instructor",
              status: "suspended",
            },
          ],
          now: IN_GRACE,
        }),
      h.exec,
    );
    expect(seen.get("reader_coach")).toMatchObject({
      verdict: "ok",
      accessSource: "staff",
      covered: false,
    });
    expect(seen.get("reader_paused_coach")).toMatchObject({
      verdict: "suspended",
      accessSource: null,
    });
  });

  it("inherits owner access at another branch without coverage", async () => {
    const seen = await withScope(
      { organizationId: ORG, entityId: gym },
      (tx) =>
        loadMembershipAccess(tx, {
          userId: BOSS,
          entityId: gym,
          membership: { status: "suspended" },
          now: PAST_GRACE,
        }),
      h.exec,
    );
    expect(seen).toMatchObject({
      now: "ok",
      atSession: "ok",
      accessSource: "staff",
    });
  });
});
