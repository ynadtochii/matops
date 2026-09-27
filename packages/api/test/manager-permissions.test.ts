import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const GYM = "acad_roles";
const OTHER = "acad_roles_other";
const OWNER = "u_roles_owner";
const MANAGER = "u_roles_manager";
const COACH = "u_roles_coach";
const STUDENT = "u_roles_student";
const OUTSIDER = "u_roles_outsider";

/**
 * Who may do what at the GYM level (spec FP7, ADR 128).
 *
 * The rule lives in the procedure tiers, so this asks the procedures rather
 * than the screens: a screen that hides a button proves nothing about what the
 * server would accept.
 */
describe("gym-level permissions", () => {
  let h: Harness;
  let planId: string;

  const as = (user: string) => h.as(user, GYM);

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: GYM,
        code: "700090",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "700091",
        members: [{ userId: OUTSIDER, role: "owner", status: "active" }],
      },
    ]);
    const plan = await as(OWNER).accessPlan.create({
      name: "Full",
      entityIds: [GYM],
      priceMinor: 5000,
      currency: "EUR",
    });
    planId = plan.id;
  });

  afterAll(() => h.close());

  it("lets a manager read the gym: plans, payments, setup", async () => {
    await expect(as(MANAGER).accessPlan.list()).resolves.toBeDefined();
    await expect(as(MANAGER).accessPlan.monthBoard()).resolves.toBeDefined();
    await expect(as(MANAGER).organization.setup()).resolves.toBeDefined();
  });

  it("lets a manager do the daily work: assign, confirm, and set up", async () => {
    await expect(
      as(MANAGER).accessPlan.assign({ userId: STUDENT, planId }),
    ).resolves.toBeDefined();
    await expect(
      as(MANAGER).accessPlan.setPolicy({ graceDays: 7, bankDetails: "IBAN" }),
    ).resolves.toBeDefined();
    await expect(
      as(MANAGER).organization.rename({ name: "Renamed gym" }),
    ).resolves.toBeDefined();
  });

  it("refuses a manager the owner-only branch create", async () => {
    expect(
      await rejectionCode(
        as(MANAGER).entity.create({ type: "bjj_academy", name: "Second Mat" }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses an instructor and a student every gym-level call", async () => {
    for (const user of [COACH, STUDENT]) {
      expect([user, await rejectionCode(as(user).accessPlan.list())]).toEqual([
        user,
        "FORBIDDEN",
      ]);
      expect([
        user,
        await rejectionCode(as(user).organization.setup()),
      ]).toEqual([user, "FORBIDDEN"]);
      expect([
        user,
        await rejectionCode(
          as(user).accessPlan.assign({ userId: STUDENT, planId }),
        ),
      ]).toEqual([user, "FORBIDDEN"]);
    }
  });

  it("refuses somebody who runs a different gym", async () => {
    expect(await rejectionCode(as(OUTSIDER).accessPlan.list())).toBe(
      "FORBIDDEN",
    );
  });

  it("tells the shell the role it should show", async () => {
    expect((await as(MANAGER).entity.list()).role).toBe("manager");
    expect((await as(MANAGER).entity.list()).canRunOrganization).toBe(true);
    // Seeing the gym is not opening a branch: that stays with the owner.
    expect((await as(MANAGER).entity.list()).canCreateBranches).toBe(false);
    expect((await as(OWNER).entity.list()).canCreateBranches).toBe(true);
  });
});
