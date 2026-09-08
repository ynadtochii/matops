import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity } from "@matops/db";

import type { Harness } from "./helpers";
import { harness, personId, rejectionCode, seedAcademies } from "./helpers";

const ORG = "acad_plans";
const OTHER = "acad_plans_other";
const OWNER = "u_plans_owner";
const COACH = "u_plans_coach";
const STUDENT = "u_plans_student";
const OUTSIDER = "u_plans_outsider";

describe("the membership plan catalog", () => {
  let h: Harness;
  let gym: string;
  let foreignEntity: string;

  const owner = () => h.as(OWNER, ORG);

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700080",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "700081",
        members: [{ userId: OUTSIDER, role: "owner", status: "active" }],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "general_space",
        name: "The Gym",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    gym = made.entityId;
    foreignEntity = OTHER;
  });

  afterAll(() => h.close());

  it("is owner only", async () => {
    for (const user of [COACH, STUDENT]) {
      expect([
        user,
        await rejectionCode(h.as(user, ORG).accessPlan.list()),
      ]).toEqual([user, "FORBIDDEN"]);
    }
  });

  it("creates a plan covering the branches it names", async () => {
    const made = await owner().accessPlan.create({
      name: "BJJ + Gym",
      entityIds: [ORG, gym],
    });
    const one = await owner().accessPlan.get({ id: made.id });
    expect([one.name, one.entityIds.sort(), one.archived]).toEqual([
      "BJJ + Gym",
      [ORG, gym].sort(),
      false,
    ]);
  });

  it("refuses a branch that belongs to another gym", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.create({
          name: "Sneaky",
          entityIds: [foreignEntity],
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("keeps another gym's catalog out of sight", async () => {
    await h
      .as(OUTSIDER, OTHER)
      .accessPlan.create({ name: "Theirs", entityIds: [OTHER] });
    const mine = await owner().accessPlan.list();
    expect(mine.map((p) => p.name)).not.toContain("Theirs");
  });

  it("previews a coverage change without applying it", async () => {
    const made = await owner().accessPlan.create({
      name: "Mat only",
      entityIds: [ORG],
    });
    const seen = await owner().accessPlan.coveragePreview({
      id: made.id,
      entityIds: [ORG, gym],
    });
    expect([seen.before, seen.after]).toEqual([[ORG], [ORG, gym].sort()]);

    const unchanged = await owner().accessPlan.get({ id: made.id });
    expect(unchanged.entityIds).toEqual([ORG]);
  });

  it("replaces coverage with the exact list it was given", async () => {
    const made = await owner().accessPlan.create({
      name: "Everything",
      entityIds: [ORG, gym],
    });
    await owner().accessPlan.setCoverage({ id: made.id, entityIds: [gym] });
    expect((await owner().accessPlan.get({ id: made.id })).entityIds).toEqual([
      gym,
    ]);
  });

  it("freezes an archived plan rather than only hiding it", async () => {
    const made = await owner().accessPlan.create({
      name: "Old deal",
      entityIds: [ORG],
    });
    await owner().accessPlan.archive({ id: made.id, archived: true });

    expect((await owner().accessPlan.get({ id: made.id })).archived).toBe(true);
    expect(
      await rejectionCode(
        owner().accessPlan.rename({ id: made.id, name: "Renamed" }),
      ),
    ).toBe("CONFLICT");
    expect(
      await rejectionCode(
        owner().accessPlan.setCoverage({ id: made.id, entityIds: [gym] }),
      ),
    ).toBe("CONFLICT");
  });

  it("un-archives, and the plan takes edits again", async () => {
    const made = await owner().accessPlan.create({
      name: "Back on sale",
      entityIds: [ORG],
    });
    await owner().accessPlan.archive({ id: made.id, archived: true });
    await owner().accessPlan.archive({ id: made.id, archived: false });
    await owner().accessPlan.rename({ id: made.id, name: "Renamed" });
    expect((await owner().accessPlan.get({ id: made.id })).name).toBe(
      "Renamed",
    );
  });

  it("gives a foreign plan id the same answer as a missing one", async () => {
    const theirs = await h
      .as(OUTSIDER, OTHER)
      .accessPlan.create({ name: "Not yours", entityIds: [OTHER] });
    expect(await rejectionCode(owner().accessPlan.get({ id: theirs.id }))).toBe(
      "NOT_FOUND",
    );
  });

  it("refuses the same branch twice in one plan", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.create({ name: "Doubled", entityIds: [ORG, ORG] }),
      ),
    ).toBe("BAD_REQUEST");
  });
});

describe("what a plan costs, and what it cost", () => {
  let h: Harness;
  const PRICED = "acad_priced";
  const BOSS = "u_priced_owner";
  const MEMBER = "u_priced_member";

  const owner = () => h.as(BOSS, PRICED);

  /** The month a price change may first name: the one after this one. */
  function nextMonthKey(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    return m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: PRICED,
        code: "700082",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: MEMBER, role: "student", status: "active" },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  it("keeps a plan with no price, which is a real state during setup", async () => {
    const made = await owner().accessPlan.create({
      name: "Unpriced",
      entityIds: [PRICED],
    });
    const listed = (await owner().accessPlan.list()).find(
      (p) => p.id === made.id,
    );
    expect([listed?.priceMinor, listed?.currency]).toEqual([null, null]);
  });

  it("takes a price at creation and reports it back", async () => {
    const made = await owner().accessPlan.create({
      name: "Full",
      entityIds: [PRICED],
      priceMinor: 5000,
      currency: "eur",
    });
    const listed = (await owner().accessPlan.list()).find(
      (p) => p.id === made.id,
    );
    // The currency is upper-cased at the boundary, by the shared field.
    expect([listed?.priceMinor, listed?.currency]).toEqual([5000, "EUR"]);
  });

  it("refuses a price change that names this month or an earlier one", async () => {
    const made = await owner().accessPlan.create({
      name: "Backdated",
      entityIds: [PRICED],
      priceMinor: 5000,
      currency: "EUR",
    });
    for (const month of ["2020-01-01", "2026-09-01"]) {
      expect([
        month,
        await rejectionCode(
          owner().accessPlan.setPrice({
            id: made.id,
            priceMinor: 9000,
            currency: "EUR",
            effectiveMonth: month,
          }),
        ),
      ]).toEqual([month, "BAD_REQUEST"]);
    }
  });

  it("takes a first price from this month on a plan made without one", async () => {
    const made = await owner().accessPlan.create({
      name: "Priced later",
      entityIds: [PRICED],
    });
    const board = await owner().accessPlan.monthBoard();
    await owner().accessPlan.setPrice({
      id: made.id,
      priceMinor: 3500,
      currency: "EUR",
      effectiveMonth: board.month,
    });

    const listed = (await owner().accessPlan.list()).find(
      (p) => p.id === made.id,
    );
    expect([listed?.priceMinor, listed?.currency]).toEqual([3500, "EUR"]);
  });

  it("puts the month's amount on the member's own standing", async () => {
    const made = await owner().accessPlan.create({
      name: "Standing",
      entityIds: [PRICED],
      priceMinor: 4500,
      currency: "EUR",
    });
    await owner().accessPlan.assign({ userId: MEMBER, planId: made.id });

    const mine = await h.as(MEMBER, PRICED).accessPlan.mine();
    const held = mine.memberships.find((m) => m.planName === "Standing");
    expect(held?.amount).toEqual({ priceMinor: 4500, currency: "EUR" });
  });

  it("gives a member on an unpriced plan no amount rather than a zero", async () => {
    const made = await owner().accessPlan.create({
      name: "Free-looking",
      entityIds: [PRICED],
    });
    await owner().accessPlan.assign({ userId: MEMBER, planId: made.id });

    const mine = await h.as(MEMBER, PRICED).accessPlan.mine();
    const held = mine.memberships.find((m) => m.planName === "Free-looking");
    expect(held?.amount).toBeNull();
  });

  it("leaves THIS month's amount alone when a future change is recorded", async () => {
    const made = await owner().accessPlan.create({
      name: "Rising",
      entityIds: [PRICED],
      priceMinor: 5000,
      currency: "EUR",
    });
    await owner().accessPlan.assign({ userId: MEMBER, planId: made.id });

    await owner().accessPlan.setPrice({
      id: made.id,
      priceMinor: 6000,
      currency: "EUR",
      effectiveMonth: nextMonthKey(),
    });

    // The member is on the plan already: the change reaches them from the month
    // it names, and this month still says what they were asked for.
    const board = await owner().accessPlan.monthBoard();
    const row = board.rows.find(
      (r) => r.userId === personId(PRICED, MEMBER) && r.planName === "Rising",
    );
    expect(row?.amount).toEqual({ priceMinor: 5000, currency: "EUR" });

    // The plan itself carries what it costs from now on.
    const listed = (await owner().accessPlan.list()).find(
      (p) => p.id === made.id,
    );
    expect(listed?.priceMinor).toBe(6000);
  });
});

describe("moving several people at once", () => {
  let h: Harness;
  const BULK = "acad_bulk";
  const BOSS = "u_bulk_owner";
  const ANA = "u_bulk_ana";
  const BEA = "u_bulk_bea";
  const GONE = "u_bulk_gone";
  let gym: string;
  let planId: string;

  const owner = () => h.as(BOSS, BULK);

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: BULK,
        code: "700083",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: ANA, role: "student", status: "active" },
          { userId: BEA, role: "student", status: "active" },
        ],
      },
    ]);
    // Somebody who exists but belongs to no branch of this gym.
    await h.pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('${GONE}', 'Gone', 'gone@test.local', true, now(), now())
        ON CONFLICT (id) DO NOTHING;
    `);
    const made = await createEntity(
      {
        organizationId: BULK,
        type: "general_space",
        name: "The Gym",
        ownerUserId: BOSS,
      },
      h.exec,
    );
    gym = made.entityId;
    const plan = await owner().accessPlan.create({
      name: "Everything",
      entityIds: [BULK, gym],
      priceMinor: 6000,
      currency: "EUR",
    });
    planId = plan.id;
  });

  afterAll(() => h.close());

  it("places everybody it can and names who it could not", async () => {
    const result = await owner().accessPlan.assignMany({
      userIds: [ANA, BEA, GONE],
      planId,
    });

    expect(result.placed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results.find((r) => r.userId === GONE)?.outcome).toBe(
      "failed",
    );
    expect(result.results.find((r) => r.userId === ANA)?.outcome).toBe(
      "created",
    );
  });

  it("says `already` on a second run rather than making a second membership", async () => {
    const again = await owner().accessPlan.assignMany({
      userIds: [ANA, BEA],
      planId,
    });
    expect(again.results.map((r) => r.outcome)).toEqual(["already", "already"]);

    const held = await owner().accessPlan.forUser({ userId: ANA });
    expect(held.filter((h2) => h2.planId === planId)).toHaveLength(1);
  });

  it("enrols them at every branch the plan covers", async () => {
    const rows = await h.pg.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "entity_membership"
         WHERE user_id = $1 AND entity_id IN ($2, $3) AND status = 'active'`,
      [ANA, BULK, gym],
    );
    expect(rows.rows[0]?.n).toBe("2");
  });

  it("enrols the plan's holders at a branch the same save added", async () => {
    const later = await createEntity(
      {
        organizationId: BULK,
        type: "general_space",
        name: "The Sauna",
        ownerUserId: BOSS,
      },
      h.exec,
    );
    const saved = await owner().accessPlan.setCoverage({
      id: planId,
      entityIds: [BULK, gym, later.entityId],
    });
    expect(saved.checked).toBe(2);
    expect(saved.enrolled.map((e) => e.userId).sort()).toEqual(
      [personId(BULK, ANA), personId(BULK, BEA)].sort(),
    );
    expect([saved.failed, saved.incomplete]).toEqual([[], false]);

    // The retry is repeatable and has nothing left to do.
    const again = await owner().accessPlan.reconcile({ id: planId });
    expect(again.enrolled).toEqual([]);
    expect(again.checked).toBe(2);
  });

  it("leaves no gap for the retry button to show", async () => {
    const listed = await owner().accessPlan.list();
    expect(listed.find((p) => p.id === planId)?.gaps).toEqual({
      missing: 0,
      needsDecision: 0,
    });
  });

  it("refuses a save computed against a coverage that has since moved", async () => {
    const held = (await owner().accessPlan.get({ id: planId })).entityIds;
    const seen = await owner().accessPlan.coveragePreview({
      id: planId,
      entityIds: [BULK],
    });
    // Somebody else saves. The list is the one already there, so this moves the
    // version without moving the coverage the tests after this one read.
    await owner().accessPlan.setCoverage({ id: planId, entityIds: held });
    expect(
      await rejectionCode(
        owner().accessPlan.setCoverage({
          id: planId,
          entityIds: [BULK],
          version: seen.version,
        }),
      ),
    ).toBe("CONFLICT");
    expect((await owner().accessPlan.get({ id: planId })).entityIds).toEqual(
      held,
    );
  });

  it("reports nobody uncovered once a branch runs on memberships", async () => {
    await owner().entity.setMembershipEnforced({
      entityId: BULK,
      enforced: true,
    });
    const queue = await owner().accessPlan.uncovered();
    expect(queue.total).toBe(0);
  });

  it("reports readiness for that branch, with its blockers named", async () => {
    const preview = await owner().entity.activationPreview({ entityId: BULK });
    expect(preview.readiness.uncoveredPeople).toBe(0);
    expect(preview.readiness.unpricedPlans).toBe(0);
    expect(preview.readiness.pendingEnrolment).toBe(0);
    // No bank details were ever set for this gym, so it is not ready and says
    // exactly which of the four things is missing.
    expect(preview.readiness.bankDetails).toBe(false);
    expect(preview.ready).toBe(false);
  });
});
