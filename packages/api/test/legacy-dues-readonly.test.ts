import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity } from "@matops/db";

import type { Harness } from "./helpers";
import { harness, memberId, rejectionCode } from "./helpers";

const OLD = "acad_legacy";
const OWNER = "u_legacy_owner";
const STUDENT = "u_legacy_student";

/**
 * A migrated branch keeps its old dues and cannot edit them (spec FP5).
 *
 * The screens already hide the Payments item, so these ask the PROCEDURES: a
 * hidden nav item is not a rule, and an old mobile build still holding a dues
 * screen would reach them anyway.
 */
describe("legacy dues after a branch has moved", () => {
  let h: Harness;
  let planId: string;
  let newBranch: string;

  const owner = () => h.as(OWNER, OLD);
  const student = () => h.as(STUDENT, OLD);

  beforeAll(async () => {
    h = await harness([
      {
        id: OLD,
        code: "700095",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
    ]);
    const plan = await owner().payments.createPlan({
      name: "Adults",
      priceMinor: 5000,
      currency: "EUR",
      cycle: "monthly",
    });
    planId = plan.id;

    const made = await createEntity(
      {
        organizationId: OLD,
        type: "general_space",
        name: "The Gym",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    newBranch = made.entityId;
  });

  afterAll(() => h.close());

  it("lets the owner run branch dues while the branch still uses them", async () => {
    await expect(
      owner().payments.setMemberDues({
        memberId: memberId(OLD, STUDENT),
        planId,
        nextDueAt: "2026-10-01",
      }),
    ).resolves.toBeDefined();
    await expect(owner().payments.plans()).resolves.toHaveLength(1);
  });

  it("says the branch has a dues history, and a new branch does not", async () => {
    expect((await owner().academy.current())?.hasLegacyDues).toBe(true);
    expect(
      (await h.as(OWNER, newBranch).academy.current())?.hasLegacyDues,
    ).toBe(false);
  });

  it("refuses every owner-side edit once the branch has moved", async () => {
    await owner().entity.setMembershipEnforced({
      entityId: OLD,
      enforced: true,
    });

    const refusals = {
      createPlan: owner().payments.createPlan({
        name: "Another",
        priceMinor: 100,
        currency: "EUR",
        cycle: "monthly",
      }),
      updatePlan: owner().payments.updatePlan({
        id: planId,
        name: "Renamed",
        priceMinor: 6000,
        currency: "EUR",
        cycle: "monthly",
      }),
      deletePlan: owner().payments.deletePlan({ id: planId }),
      setMemberDues: owner().payments.setMemberDues({
        memberId: memberId(OLD, STUDENT),
        planId,
        nextDueAt: "2026-11-01",
      }),
      updateBookingGate: owner().payments.updateBookingGate({
        enforced: true,
        graceDays: 3,
      }),
    };

    for (const [name, call] of Object.entries(refusals)) {
      expect([name, await rejectionCode(call)]).toEqual([name, "CONFLICT"]);
    }
  });

  it("refuses the member-side writes too, which an old app could still send", async () => {
    expect(await rejectionCode(student().payments.choosePlan({ planId }))).toBe(
      "CONFLICT",
    );
    expect(await rejectionCode(student().payments.claim({}))).toBe("CONFLICT");
  });

  it("still reads the history, because read-only is not deleted", async () => {
    const plans = await owner().payments.plans();
    expect(plans.map((p) => p.name)).toEqual(["Adults"]);
  });
});
