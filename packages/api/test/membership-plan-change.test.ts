import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { eq } from "@matops/db";
import { accessAssignment } from "@matops/db/schema";
import { monthOf, nextMonth } from "@matops/domain";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const ORG = "acad_change";
const OWNER = "u_change_owner";
const ALEX = "u_change_alex";

const THIS_MONTH = monthOf(new Date(), "UTC");
const NEXT_MONTH = nextMonth(THIS_MONTH);

describe("changing somebody's plan at the month boundary", () => {
  let h: Harness;
  let basic: string;
  let full: string;
  let held: string;

  const owner = () => h.as(OWNER, ORG);

  const periodOf = async (id: string) => {
    const [row] = await h.exec
      .select({
        startMonth: accessAssignment.startMonth,
        endMonth: accessAssignment.endMonth,
        status: accessAssignment.status,
        planId: accessAssignment.planId,
      })
      .from(accessAssignment)
      .where(eq(accessAssignment.id, id));
    return row;
  };

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700093",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: ALEX, role: "student", status: "active" },
        ],
      },
    ]);
    await owner().accessPlan.setPolicy({
      graceDays: 7,
      calendarTimeZone: "UTC",
      bankDetails: "IBAN",
    });
    basic = (
      await owner().accessPlan.create({
        name: "Basic",
        entityIds: [ORG],
        priceMinor: 5000,
        currency: "EUR",
      })
    ).id;
    full = (
      await owner().accessPlan.create({
        name: "Full",
        entityIds: [ORG],
        priceMinor: 8000,
        currency: "EUR",
      })
    ).id;
    held = (await owner().accessPlan.assign({ userId: ALEX, planId: basic }))
      .id;
  });

  afterAll(() => h.close());

  it("says what the change would do before it does it", async () => {
    const seen = await owner().accessPlan.previewChange({
      assignmentId: held,
      targetPlanId: full,
    });
    expect(seen.effectiveMonth).toBe(NEXT_MONTH);
    expect(seen.targetPlanName).toBe("Full");
    expect(seen.amount?.priceMinor).toBe(8000);
    expect(seen.pending).toBe(false);
  });

  it("ends the old plan at the boundary and starts the new one there", async () => {
    const done = await owner().accessPlan.scheduleChange({
      assignmentId: held,
      targetPlanId: full,
    });
    expect(done.effectiveMonth).toBe(NEXT_MONTH);

    const source = await periodOf(held);
    expect([source?.startMonth, source?.endMonth]).toEqual([
      THIS_MONTH,
      NEXT_MONTH,
    ]);
    const successor = await periodOf(done.successorId);
    expect([
      successor?.startMonth,
      successor?.endMonth,
      successor?.planId,
    ]).toEqual([NEXT_MONTH, null, full]);
  });

  it("never rewrites the old assignment's plan", async () => {
    expect((await periodOf(held))?.planId).toBe(basic);
  });

  it("leaves this month on the old plan and off the new one", async () => {
    const board = await owner().accessPlan.monthBoard();
    const mine = board.rows.filter((r) => r.userId === ALEX);
    expect(mine.map((r) => r.planName)).toEqual(["Basic"]);
    expect(mine[0]?.amount?.priceMinor).toBe(5000);
  });

  it("makes one change out of a second submit", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.scheduleChange({
          assignmentId: held,
          targetPlanId: full,
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("shows the waiting plan on the person and to the member", async () => {
    const rows = await owner().accessPlan.forUser({ userId: ALEX });
    const source = rows.find((r) => r.id === held);
    expect(source?.pendingChange?.effectiveMonth).toBe(NEXT_MONTH);
    expect(source?.appliesNow).toBe(true);

    const mine = await h.as(ALEX, ORG).accessPlan.mine();
    expect(mine.memberships.map((m) => m.planName)).toEqual(["Basic"]);
    expect(mine.memberships[0]?.next?.planName).toBe("Full");
    expect(mine.memberships[0]?.next?.amount?.priceMinor).toBe(8000);
  });

  it("refuses to pause the source while the change is waiting", async () => {
    expect(await rejectionCode(owner().accessPlan.suspend({ id: held }))).toBe(
      "CONFLICT",
    );
  });

  it("refuses to archive the plan the change points at", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.archive({ id: full, archived: true }),
      ),
    ).toBe("CONFLICT");
  });

  it("takes the change back, restoring only what it wrote", async () => {
    const rows = await owner().accessPlan.forUser({ userId: ALEX });
    const changeId = rows.find((r) => r.id === held)?.pendingChange?.id ?? "";
    await owner().accessPlan.cancelScheduledChange({ changeId });

    expect((await periodOf(held))?.endMonth).toBeNull();
    const after = await owner().accessPlan.forUser({ userId: ALEX });
    expect(after.find((r) => r.id === held)?.pendingChange).toBeNull();
    expect(
      after.filter((r) => r.planId === full && r.status !== "cancelled"),
    ).toEqual([]);
  });

  it("can schedule again after a cancellation", async () => {
    const again = await owner().accessPlan.scheduleChange({
      assignmentId: held,
      targetPlanId: full,
    });
    expect(again.effectiveMonth).toBe(NEXT_MONTH);
    const rows = await owner().accessPlan.forUser({ userId: ALEX });
    const changeId = rows.find((r) => r.id === held)?.pendingChange?.id ?? "";
    await owner().accessPlan.cancelScheduledChange({ changeId });
  });

  it("refuses a plan they already hold over those months", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.scheduleChange({
          assignmentId: held,
          targetPlanId: basic,
        }),
      ),
    ).toBe("CONFLICT");
  });

  it("keeps history when they return to a plan they once ended", async () => {
    const [past] = await h.exec
      .select({ id: accessAssignment.id })
      .from(accessAssignment)
      .where(eq(accessAssignment.planId, basic));
    expect(past?.id).toBe(held);
  });
});
