import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { eq } from "@matops/db";
import { entity } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedClasses, uploadProof } from "./helpers";

const ACAD = "acad_choose";
const OWNER = "u_choose_owner";
const STUDENT = "u_choose_student";
const OTHER = "u_choose_other";
const CLASS = "00000000-0000-4000-8000-0000000c0001";

describe("students choose and pay for a plan", () => {
  let h: Harness;
  let eight: string;
  let unlimited: string;
  let family: string;
  let cashId: string;
  let bankId: string;

  const owner = () => h.as(OWNER, ACAD);
  const student = () => h.as(STUDENT, ACAD);
  const other = () => h.as(OTHER, ACAD);
  const banner = async (who = student()) =>
    (await who.accessPlan.mine()).banner?.kind ?? null;
  const held = async (who = student()) =>
    (await who.accessPlan.mine()).memberships.filter(
      (m) => m.status === "active",
    );

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    h = await harness([
      {
        id: ACAD,
        code: "700095",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          { userId: OTHER, role: "student", status: "active" },
        ],
      },
    ]);
    await seedClasses(h.pg, [
      { id: CLASS, academyId: ACAD, instructorId: OWNER, startsInMinutes: 60 },
    ]);
    await h.pg.query('UPDATE "class" SET starts_at = $1 WHERE id = $2', [
      "2026-11-04T12:00:00Z",
      CLASS,
    ]);
    await owner().accessPlan.setPolicy({
      graceDays: 7,
      calendarTimeZone: "UTC",
    });
    const make = async (name: string, priceMinor: number) =>
      (
        await owner().accessPlan.create({
          name,
          entityIds: [ACAD],
          priceMinor,
          currency: "EUR",
        })
      ).id;
    eight = await make("Eight classes", 5000);
    unlimited = await make("Unlimited", 6500);
    family = await make("Family", 4000);
    await owner().accessPlan.setStaffOnly({ planId: family, staffOnly: true });
    await owner().accessPlan.setPaymentLink({
      planId: eight,
      paymentLinkUrl: "https://buy.stripe.com/test_eight",
    });
    cashId = (
      await owner().paymentMethod.save({
        kind: "cash",
        label: "Cash",
        details: "",
        enabled: true,
      })
    ).id;
    bankId = (
      await owner().paymentMethod.save({
        kind: "bank",
        label: "Bank transfer",
        details: "IBAN PT50 0000",
        enabled: true,
      })
    ).id;
  });

  afterAll(async () => {
    await h.close();
    vi.useRealTimers();
  });

  it("offers the open, priced plans and the staff who take cash", async () => {
    const options = await student().studentPlan.options();
    expect(options.plans.map((p) => p.name)).toEqual([
      "Eight classes",
      "Unlimited",
    ]);
    expect(options.plans[0]?.cardLink).toBe(true);
    expect(options.staff.map((s) => s.userId)).toContain(OWNER);
    expect(options.methods.map((m) => m.kind)).toEqual(["cash", "bank"]);
  });

  it("refuses a choice while payments are off", async () => {
    expect(await banner()).toBeNull();
    expect(
      await rejectionCode(student().studentPlan.choose({ planId: eight })),
    ).toBe("PRECONDITION_FAILED");
    await h.exec
      .update(entity)
      .set({ membershipEnforcedAt: new Date() })
      .where(eq(entity.id, ACAD));
  });

  it("asks a student with no plan to choose, and keeps booking closed", async () => {
    expect(await banner()).toBe("choose_plan");
    expect(
      await rejectionCode(student().booking.book({ classId: CLASS })),
    ).toBe("PRECONDITION_FAILED");
  });

  it("refuses a staff only plan and lets staff not choose", async () => {
    expect(
      await rejectionCode(student().studentPlan.choose({ planId: family })),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(owner().studentPlan.choose({ planId: eight })),
    ).toBe("FORBIDDEN");
  });

  it("creates the membership at once, with no grace days", async () => {
    const chosen = await student().studentPlan.choose({ planId: eight });
    expect(chosen.created).toBe(true);
    expect(await banner()).toBe("finish_payment");
    expect(
      await rejectionCode(student().booking.book({ classId: CLASS })),
    ).toBe("PRECONDITION_FAILED");
    const [membership] = await held();
    expect(membership?.cardPaymentUrl).toContain("client_reference_id=");
    const row = await h.pg.query<{ by: string }>(
      `SELECT assigned_by AS by FROM access_assignment WHERE id = $1`,
      [chosen.assignmentId],
    );
    expect(row.rows[0]?.by).toBe(STUDENT);
  });

  it("swaps an unpaid choice for another plan", async () => {
    await student().studentPlan.choose({ planId: unlimited });
    expect((await held()).map((m) => m.planName)).toEqual(["Unlimited"]);
    expect(
      (await student().studentPlan.choose({ planId: unlimited })).created,
    ).toBe(false);
  });

  it("takes only the ways to pay that are on for the plan", async () => {
    await owner().accessPlan.setPlanMethod({
      planId: unlimited,
      methodId: cashId,
      on: false,
    });
    const options = await student().studentPlan.options();
    expect(options.methods.find((m) => m.id === cashId)?.offPlanIds).toEqual([
      unlimited,
    ]);
    expect(
      (await owner().accessPlan.list()).find((p) => p.id === unlimited)
        ?.methodsOff,
    ).toEqual([cashId]);

    const [membership] = await held();
    if (!membership) throw new Error("no membership");
    expect(
      await rejectionCode(
        student().accessPlan.claimMonth({
          assignmentId: membership.assignmentId,
          methodId: cashId,
          cashPaidTo: OWNER,
          cashPaidOn: "2026-11-02",
        }),
      ),
    ).toBe("BAD_REQUEST");

    await owner().accessPlan.setPlanMethod({
      planId: unlimited,
      methodId: bankId,
      on: false,
    });
    expect(
      (await student().studentPlan.options()).plans.map((p) => p.name),
    ).toEqual(["Eight classes"]);

    for (const methodId of [cashId, bankId]) {
      await owner().accessPlan.setPlanMethod({
        planId: unlimited,
        methodId,
        on: true,
      });
    }
    expect(
      (await student().studentPlan.options()).plans.map((p) => p.name),
    ).toEqual(["Eight classes", "Unlimited"]);
  });

  it("lets only the owner pick ways to pay for a plan", async () => {
    expect(
      await rejectionCode(
        student().accessPlan.setPlanMethod({
          planId: unlimited,
          methodId: cashId,
          on: false,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("needs to know who took the cash", async () => {
    const [membership] = await held();
    if (!membership) throw new Error("no membership");
    expect(
      await rejectionCode(
        student().accessPlan.claimMonth({
          assignmentId: membership.assignmentId,
          methodId: cashId,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("needs a cash day that is not in the future or too old", async () => {
    const [membership] = await held();
    if (!membership) throw new Error("no membership");
    for (const cashPaidOn of [undefined, "2026-11-04", "2026-08-01"]) {
      expect(
        await rejectionCode(
          student().accessPlan.claimMonth({
            assignmentId: membership.assignmentId,
            methodId: cashId,
            cashPaidTo: OWNER,
            ...(cashPaidOn ? { cashPaidOn } : {}),
          }),
        ),
      ).toBe("BAD_REQUEST");
    }
  });

  it("keeps booking closed until staff confirm the cash", async () => {
    const [membership] = await held();
    if (!membership) throw new Error("no membership");
    await student().accessPlan.claimMonth({
      assignmentId: membership.assignmentId,
      methodId: cashId,
      cashPaidTo: OWNER,
      cashPaidOn: "2026-11-02",
      note: "Paid before class",
    });
    expect(await banner()).toBe("waiting_cash");
    expect(
      await rejectionCode(student().booking.book({ classId: CLASS })),
    ).toBe("PRECONDITION_FAILED");

    const [claim] = await owner().accessPlan.claims();
    expect(claim?.cashPaidToName).toBeTruthy();
    expect(claim?.cashPaidOn).toBe("2026-11-02");
    expect(claim?.note).toBe("Paid before class");

    await owner().accessPlan.markMonth({
      assignmentId: membership.assignmentId,
      month: membership.month,
      paid: true,
    });
    expect(await banner()).toBeNull();
    expect((await student().booking.book({ classId: CLASS })).tier).toBe(
      "confirmed",
    );
  });

  it("refuses to swap a plan once it is paid", async () => {
    expect(
      await rejectionCode(student().studentPlan.choose({ planId: eight })),
    ).toBe("CONFLICT");
  });

  it("lets a transfer book while the gym checks it", async () => {
    const chosen = await other().studentPlan.choose({ planId: unlimited });
    expect(
      await rejectionCode(
        other().accessPlan.claimMonth({
          assignmentId: chosen.assignmentId,
          methodId: bankId,
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await rejectionCode(
        other().accessPlan.claimMonth({
          assignmentId: chosen.assignmentId,
          methodId: bankId,
          proofFileId: await uploadProof(h, STUDENT, ACAD),
        }),
      ),
    ).toBe("NOT_FOUND");
    const proofFileId = await uploadProof(h, OTHER, ACAD);
    await other().accessPlan.claimMonth({
      assignmentId: chosen.assignmentId,
      methodId: bankId,
      proofFileId,
    });
    expect(await banner(other())).toBe("waiting_check");
    expect((await other().booking.book({ classId: CLASS })).tier).toBe(
      "provisional",
    );
  });

  it("lets staff open the proof through a short-lived link", async () => {
    const [claim] = await owner().accessPlan.claims();
    if (!claim) throw new Error("no claim");
    expect(claim.hasProof).toBe(true);
    const { url } = await owner().accessPlan.proofUrl({
      assignmentId: claim.assignmentId,
      month: claim.month,
    });
    expect(url).toMatch(/^fake:\/\/get\/receipt\/acad_choose\/.+\.pdf$/);
    expect(
      await rejectionCode(
        other().accessPlan.proofUrl({
          assignmentId: claim.assignmentId,
          month: claim.month,
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});
