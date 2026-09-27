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
  it("answers the membership catalog with no plans", async () => {
    const { h } = await gymWithNoBranch();

    await expect(h.as(OWNER, null).accessPlan.list()).resolves.toEqual([]);
  });

  it("says the owner may create branches", async () => {
    const { h } = await gymWithNoBranch();

    await expect(h.as(OWNER, null).entity.list()).resolves.toMatchObject({
      canCreateBranches: true,
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

  it("hands back a setup list with nothing done and no payment steps", async () => {
    const { h } = await gymWithNoBranch();

    const setup = await h.as(OWNER, null).organization.setup();

    expect(setup.progress).toEqual({ done: 0, total: 6, complete: false });
    expect(setup.items.map((i) => i.key)).toEqual([
      "branch",
      "location",
      "schedule",
      "invite",
      "approve",
      "booking",
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
