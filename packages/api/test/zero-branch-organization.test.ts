import { afterEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode } from "./helpers";

const OWNER = "u_owner";

let open: Harness | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function gymWithNoBranch(): Promise<{
  h: Harness;
  organizationId: string;
}> {
  const h = await harness();
  open = h;
  await h.pg.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('${OWNER}', 'Owner', 'owner@test.local', true, now(), now());
  `);
  const { organizationId } = await h
    .as(OWNER, null)
    .organization.create({ name: "Alma" });
  return { h, organizationId };
}

describe("a gym with no branch", () => {
  it("answers the overview with zero totals and no branches", async () => {
    const { h } = await gymWithNoBranch();

    await expect(h.as(OWNER, null).stats.organization()).resolves.toMatchObject(
      {
        members: 0,
        pendingMembers: 0,
        newLeads: 0,
        openClaims: 0,
        upcomingClasses: 0,
        revenue: [],
        entities: [],
      },
    );
  });

  it("answers the metrics with zero people and no branch rows", async () => {
    const { h } = await gymWithNoBranch();

    await expect(
      h.as(OWNER, null).stats.organizationMetrics(),
    ).resolves.toMatchObject({
      enrolledMembers: 0,
      membersWithAccess: 0,
      membersAttended: 0,
      newMembers: 0,
      attendanceByBranch: [],
      sessionUse: [],
      enrolmentsByBranch: [],
    });
  });

  it("answers the people directory with no rows", async () => {
    const { h } = await gymWithNoBranch();

    await expect(
      h.as(OWNER, null).stats.organizationMembers(),
    ).resolves.toMatchObject({ entities: [], rows: [] });
  });

  it("returns confirmed organization badge zeroes without a selected branch", async () => {
    const { h, organizationId } = await gymWithNoBranch();

    await expect(
      h.as(OWNER, null).stats.navigationSummary({
        organizationId,
        branchId: null,
      }),
    ).resolves.toEqual({
      organizationId,
      branch: null,
      counts: {
        people: { state: "ready", count: 0 },
        memberships: { state: "ready", count: 0 },
        roster: { state: "unavailable" },
        coaches: { state: "unavailable" },
        branchClaims: { state: "unavailable" },
        unread: { state: "unavailable" },
      },
    });
  });

  it("answers the membership catalog with no plans", async () => {
    const { h } = await gymWithNoBranch();

    await expect(h.as(OWNER, null).accessPlan.list()).resolves.toEqual([]);
  });

  it("says the owner may create branches, general spaces included", async () => {
    const { h } = await gymWithNoBranch();

    await expect(h.as(OWNER, null).entity.list()).resolves.toMatchObject({
      canCreateBranches: true,
      canCreateGeneralBranches: true,
    });
  });

  it("withholds general spaces from a gym that is not entitled to them", async () => {
    const { h, organizationId } = await gymWithNoBranch();
    await h.pg.query(
      `UPDATE "organization" SET general_branches_enabled = false WHERE id = $1`,
      [organizationId],
    );

    await expect(h.as(OWNER, null).entity.list()).resolves.toMatchObject({
      canCreateBranches: true,
      canCreateGeneralBranches: false,
    });
  });

  it("lets the owner make that gym active, which the gate needs", async () => {
    const { h, organizationId } = await gymWithNoBranch();

    await expect(
      h.as(OWNER, null).organization.setActive({ organizationId }),
    ).resolves.toEqual({ ok: true });
    expect(h.activeOrgOf(OWNER)).toBe(organizationId);
  });

  it("refuses to make a gym active that the caller does not own", async () => {
    const { h } = await gymWithNoBranch();
    await h.pg.exec(`
      INSERT INTO "organization" (id, name, slug, created_at)
      VALUES ('org_rival', 'Rival', 'rival', now());
    `);

    expect(
      await rejectionCode(
        h
          .as(OWNER, null)
          .organization.setActive({ organizationId: "org_rival" }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("hands back a setup list where only the gym's name is done", async () => {
    const { h } = await gymWithNoBranch();

    const setup = await h.as(OWNER, null).organization.setup();

    expect(setup.progress).toEqual({ done: 1, total: 9, complete: false });
    expect(setup.items.filter((i) => i.done).map((i) => i.key)).toEqual([
      "gym",
    ]);
    expect(setup.items.find((i) => i.key === "branch")).toMatchObject({
      done: false,
      blocked: false,
    });
    expect(setup.items.find((i) => i.key === "schedule")?.blocked).toBe(true);
    expect(setup.branches).toEqual([]);
  });

  it("names the gym the owner owns, so the gate can open it", async () => {
    const { h, organizationId } = await gymWithNoBranch();

    await expect(h.as(OWNER, null).organization.mine()).resolves.toEqual([
      { organizationId, name: "Alma" },
    ]);
  });
});
