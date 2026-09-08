import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { and, createEntity, eq, inArray } from "@matops/db";
import { entity, entityMembership } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedClasses } from "./helpers";

const ORG = "acad_purchase";
const OWNER = "u_purchase_owner";
const STUDENT = "u_purchase_student";
const PENDING = "u_purchase_pending";
const OTHER_STUDENT = "u_purchase_other_student";
const FOREIGN_ORG = "acad_purchase_foreign";
const FOREIGN_OWNER = "u_purchase_foreign_owner";
const CLASS = "00000000-0000-4000-8000-0000000c0001";

describe("student membership purchases", () => {
  let h: Harness;
  let gym: string;
  let planId: string;

  const owner = () => h.as(OWNER, ORG);
  const student = () => h.as(STUDENT, ORG);
  const foreign = () => h.as(FOREIGN_OWNER, FOREIGN_ORG);

  const choose = async (start: "current" | "next" = "current", id = planId) => {
    const catalog = await student().membershipPurchase.catalog({ start });
    const plan = catalog.plans.find((candidate) => candidate.id === id);
    if (!plan) throw new Error("The fixture plan is missing from the catalog");
    return student().membershipPurchase.select({
      planId: id,
      start,
      version: plan.version,
    });
  };

  const gymStatus = async () => {
    const rows = await h.exec
      .select({ status: entityMembership.status })
      .from(entityMembership)
      .where(
        and(
          eq(entityMembership.entityId, gym),
          eq(entityMembership.userId, STUDENT),
        ),
      );
    return rows[0]?.status ?? null;
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    h = await harness([
      {
        id: ORG,
        code: "700091",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          { userId: OTHER_STUDENT, role: "student", status: "active" },
          { userId: PENDING, role: "student", status: "pending" },
        ],
      },
      {
        id: FOREIGN_ORG,
        code: "700092",
        members: [{ userId: FOREIGN_OWNER, role: "owner", status: "active" }],
      },
    ]);
    gym = (
      await createEntity(
        {
          organizationId: ORG,
          type: "general_space",
          name: "Gym",
          ownerUserId: OWNER,
        },
        h.exec,
      )
    ).entityId;
    await h.exec
      .update(entity)
      .set({ membershipEnforcedAt: new Date("2026-09-01T00:00:00Z") })
      .where(inArray(entity.id, [ORG, gym]));
    await owner().accessPlan.setPolicy({
      graceDays: 7,
      calendarTimeZone: "UTC",
      bankDetails: "Test Bank, account 12345",
    });
    planId = (
      await owner().accessPlan.create({
        name: "BJJ + Gym",
        entityIds: [ORG, gym],
        priceMinor: 6500,
        currency: "EUR",
      })
    ).id;
    await owner().membershipPurchase.setAvailability({
      planId,
      available: true,
    });
    await seedClasses(h.pg, [
      { id: CLASS, academyId: ORG, instructorId: OWNER, startsInMinutes: 60 },
    ]);
    await h.pg.query('UPDATE "class" SET starts_at = $1 WHERE id = $2', [
      "2026-09-16T12:00:00Z",
      CLASS,
    ]);
  });

  afterEach(async () => {
    await h.close();
    vi.useRealTimers();
  });

  it("grants provisional access after a paid claim", async () => {
    const selected = await choose();
    expect(selected.status).toBe("pending");
    expect(await owner().accessPlan.forUser({ userId: STUDENT })).toEqual([]);
    expect((await student().booking.access()).locked).toBe(true);
    expect(
      await rejectionCode(student().booking.book({ classId: CLASS })),
    ).toBe("PRECONDITION_FAILED");
    expect(
      await rejectionCode(
        owner().membershipPurchase.confirm({ id: selected.id }),
      ),
    ).toBe("CONFLICT");

    await student().membershipPurchase.claim({ id: selected.id });
    expect((await student().booking.access()).locked).toBe(false);
    expect(await student().booking.book({ classId: CLASS })).toEqual({
      ok: true,
      tier: "provisional",
    });

    const confirmed = await owner().membershipPurchase.confirm({
      id: selected.id,
    });
    expect(confirmed.status).toBe("confirmed");
    expect((await student().booking.access()).locked).toBe(false);
    expect((await student().booking.book({ classId: CLASS })).ok).toBe(true);
  });

  it("adds missing bundle branches only when payment is confirmed", async () => {
    const selected = await choose();
    expect(selected.entityIds).toEqual([ORG, gym].sort());
    expect(await gymStatus()).toBeNull();
    await student().membershipPurchase.claim({ id: selected.id });
    expect(await gymStatus()).toBeNull();
    await owner().membershipPurchase.confirm({ id: selected.id });
    expect(await gymStatus()).toBe("active");
  });

  it("reuses selection, claim and confirmation without duplicate assignments or payment records", async () => {
    const first = await choose();
    const again = await choose();
    expect([again.id, again.reference]).toEqual([first.id, first.reference]);
    const claim = await student().membershipPurchase.claim({ id: first.id });
    const repeatedClaim = await student().membershipPurchase.claim({
      id: first.id,
    });
    expect(repeatedClaim.claimedAt).toEqual(claim.claimedAt);
    const confirmed = await owner().membershipPurchase.confirm({
      id: first.id,
    });
    const repeated = await owner().membershipPurchase.confirm({ id: first.id });
    expect(repeated.assignmentId).toBe(confirmed.assignmentId);
    expect(await owner().accessPlan.forUser({ userId: STUDENT })).toHaveLength(
      1,
    );
    const counts = await h.pg.query<{ months: number; audit: number }>(
      "SELECT (SELECT count(*)::int FROM membership_month) AS months, (SELECT count(*)::int FROM membership_month_audit) AS audit",
    );
    expect(counts.rows[0]).toEqual({ months: 1, audit: 1 });
  });

  it("lets pending students browse the catalog but prevents selection and booking", async () => {
    const pending = h.as(PENDING, ORG);
    const catalog = await pending.membershipPurchase.catalog({});
    expect(catalog.canSelect).toBe(false);
    expect(catalog.plans.map((plan) => plan.id)).toContain(planId);
    const plan = catalog.plans.find((candidate) => candidate.id === planId);
    if (!plan) throw new Error("The fixture plan is missing from the catalog");
    expect(
      await rejectionCode(
        pending.membershipPurchase.select({ planId, version: plan.version }),
      ),
    ).toBe("CONFLICT");
    expect((await pending.booking.access()).locked).toBe(true);
    expect(await rejectionCode(pending.booking.book({ classId: CLASS }))).toBe(
      "FORBIDDEN",
    );
  });

  it("keeps another organization's plans and purchases out of every action", async () => {
    const selected = await choose();
    expect(
      await rejectionCode(
        foreign().membershipPurchase.select({
          planId,
          version: selected.version,
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(
        foreign().membershipPurchase.claim({ id: selected.id }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(
        foreign().membershipPurchase.confirm({ id: selected.id }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(
        foreign().membershipPurchase.setAvailability({
          planId,
          available: false,
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(await foreign().membershipPurchase.review()).toEqual([]);
    expect((await foreign().membershipPurchase.mine()).purchases).toEqual([]);
  });

  it("does not let another student claim a purchase or review payments", async () => {
    const selected = await choose();
    expect(
      await rejectionCode(
        h.as(OTHER_STUDENT, ORG).membershipPurchase.claim({ id: selected.id }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(
        student().membershipPurchase.confirm({ id: selected.id }),
      ),
    ).toBe("FORBIDDEN");
    expect(await rejectionCode(student().membershipPurchase.review())).toBe(
      "FORBIDDEN",
    );
  });

  it("preserves a suspension added before payment approval", async () => {
    const selected = await choose();
    await student().membershipPurchase.claim({ id: selected.id });
    await h.exec.insert(entityMembership).values({
      organizationId: ORG,
      entityId: gym,
      userId: STUDENT,
      role: "student",
      status: "suspended",
    });
    const reviewed = await owner().membershipPurchase.confirm({
      id: selected.id,
    });
    expect(reviewed.status).toBe("resolution");
    expect(reviewed.assignmentId).toBeNull();
    expect(await gymStatus()).toBe("suspended");
    expect(await owner().accessPlan.forUser({ userId: STUDENT })).toEqual([]);
  });

  it("requires a resolution when a selected month's price changes", async () => {
    const selected = await choose("next");
    await student().membershipPurchase.claim({ id: selected.id });
    await owner().accessPlan.setPrice({
      id: planId,
      priceMinor: 7500,
      currency: "EUR",
      effectiveMonth: "2026-10-01",
    });
    const reviewed = await owner().membershipPurchase.confirm({
      id: selected.id,
    });
    expect(reviewed.status).toBe("resolution");
    expect(reviewed.priceMinor).toBe(6500);
    expect(reviewed.confirmedAt).toBeInstanceOf(Date);
    expect(reviewed.assignmentId).toBeNull();
    expect(await gymStatus()).toBeNull();
  });

  it("requires a resolution when included branches change", async () => {
    const selected = await choose();
    await student().membershipPurchase.claim({ id: selected.id });
    await owner().accessPlan.setCoverage({ id: planId, entityIds: [ORG] });
    const reviewed = await owner().membershipPurchase.confirm({
      id: selected.id,
    });
    expect(reviewed.status).toBe("resolution");
    expect(reviewed.entityIds).toEqual([ORG, gym].sort());
    expect(reviewed.assignmentId).toBeNull();
    expect((await student().booking.access()).locked).toBe(true);
  });

  it("queues a free membership for approval without a payment claim", async () => {
    const free = await owner().accessPlan.create({
      name: "Free training",
      entityIds: [ORG],
      priceMinor: 0,
      currency: "EUR",
    });
    await owner().membershipPurchase.setAvailability({
      planId: free.id,
      available: true,
    });
    const selected = await choose("current", free.id);
    expect(selected.status).toBe("pending");
    expect(selected.claimedAt).toBeNull();
    expect(
      (await owner().membershipPurchase.review()).map((row) => row.id),
    ).toContain(selected.id);
    expect((await student().booking.access()).locked).toBe(true);
    expect(
      (await owner().membershipPurchase.confirm({ id: selected.id })).status,
    ).toBe("confirmed");
    expect((await student().booking.access()).locked).toBe(false);
  });

  it("records a future payment without granting current booking access", async () => {
    const selected = await choose("next");
    await student().membershipPurchase.claim({ id: selected.id });
    const confirmed = await owner().membershipPurchase.confirm({
      id: selected.id,
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.startMonth).toBe("2026-10-01");
    expect((await student().booking.access()).locked).toBe(true);
    expect(
      await rejectionCode(student().booking.book({ classId: CLASS })),
    ).toBe("PRECONDITION_FAILED");
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    expect((await student().booking.access()).locked).toBe(false);
  });

  it("keeps a declined claim blocked until the owner approves it", async () => {
    const selected = await choose();
    await student().membershipPurchase.claim({ id: selected.id });
    const returned = await owner().membershipPurchase.reject({
      id: selected.id,
      reason: "Please check the payment reference.",
    });
    expect(returned.status).toBe("rejected");
    expect(
      (await student().membershipPurchase.mine()).purchases[0]?.reason,
    ).toBe("Please check the payment reference.");
    expect((await student().booking.access()).locked).toBe(true);
    expect(
      await rejectionCode(
        student().membershipPurchase.claim({ id: selected.id }),
      ),
    ).toBe("CONFLICT");
    expect(
      (await owner().membershipPurchase.confirm({ id: selected.id })).status,
    ).toBe("confirmed");
    expect((await student().booking.access()).locked).toBe(false);
  });

  it("closes a resolved payment while preserving its payment evidence", async () => {
    const selected = await choose();
    await student().membershipPurchase.claim({ id: selected.id });
    await owner().accessPlan.setCoverage({ id: planId, entityIds: [ORG] });
    const reviewed = await owner().membershipPurchase.confirm({
      id: selected.id,
    });
    const closed = await owner().membershipPurchase.close({
      id: selected.id,
      reason: "Refund agreed and sent.",
    });
    expect(closed.status).toBe("cancelled");
    expect(closed.confirmedAt).toEqual(reviewed.confirmedAt);
    expect(closed.claimedAt).toEqual(reviewed.claimedAt);
    expect(closed.reference).toBe(selected.reference);
    expect(closed.assignmentId).toBeNull();
    expect(await owner().membershipPurchase.review()).toEqual([]);
  });

  it("does not let staff close a declined paid claim", async () => {
    const selected = await choose();
    await student().membershipPurchase.claim({ id: selected.id });
    const returned = await owner().membershipPurchase.reject({
      id: selected.id,
      reason: "Payment could not be found.",
    });
    const repeated = await owner().membershipPurchase.reject({
      id: selected.id,
      reason: "Payment could not be found.",
    });
    expect(repeated).toEqual(returned);
    expect(
      await rejectionCode(
        student().membershipPurchase.cancel({ id: selected.id }),
      ),
    ).toBe("CONFLICT");
    expect(
      await rejectionCode(
        student().membershipPurchase.close({
          id: selected.id,
          reason: "Close my request.",
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        owner().membershipPurchase.close({
          id: selected.id,
          reason: "Student confirmed no transfer was sent.",
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      (await owner().membershipPurchase.confirm({ id: selected.id })).status,
    ).toBe("confirmed");
  });

  it("lets students cancel a returned free request and choose another plan", async () => {
    const free = await owner().accessPlan.create({
      name: "Free training",
      entityIds: [ORG],
      priceMinor: 0,
      currency: "EUR",
    });
    await owner().membershipPurchase.setAvailability({
      planId: free.id,
      available: true,
    });
    const selected = await choose("current", free.id);
    await owner().membershipPurchase.reject({
      id: selected.id,
      reason: "Please choose the standard membership.",
    });
    const cancelled = await student().membershipPurchase.cancel({
      id: selected.id,
    });
    expect(cancelled.status).toBe("cancelled");
    const next = await choose();
    expect(next.planId).toBe(planId);
    expect(next.id).not.toBe(selected.id);
    expect((await student().booking.access()).locked).toBe(true);
  });

  it("keeps an approved free plan accessible next month without inventing payments", async () => {
    const free = await owner().accessPlan.create({
      name: "Free training",
      entityIds: [ORG],
      priceMinor: 0,
      currency: "EUR",
    });
    await owner().membershipPurchase.setAvailability({
      planId: free.id,
      available: true,
    });
    const selected = await choose("current", free.id);
    const confirmed = await owner().membershipPurchase.confirm({
      id: selected.id,
    });
    expect(confirmed.status).toBe("confirmed");
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    expect((await student().booking.access()).locked).toBe(false);
    const counts = await h.pg.query<{ payments: number; audits: number }>(
      "SELECT (SELECT count(*)::int FROM membership_month WHERE assignment_id = $1 AND paid = true) AS payments, (SELECT count(*)::int FROM membership_month_audit WHERE assignment_id = $1 AND paid = true) AS audits",
      [confirmed.assignmentId],
    );
    expect(counts.rows[0]).toEqual({ payments: 0, audits: 0 });
  });

  it("requires a resolution for a payment confirmed after its selected month ends", async () => {
    const selected = await choose();
    await student().membershipPurchase.claim({ id: selected.id });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const reviewed = await owner().membershipPurchase.confirm({
      id: selected.id,
    });
    expect(reviewed.status).toBe("resolution");
    expect(reviewed.startMonth).toBe("2026-09-01");
    expect(reviewed.confirmedAt).toBeInstanceOf(Date);
    expect(reviewed.assignmentId).toBeNull();
    expect(reviewed.reference).toBe(selected.reference);
    expect(await gymStatus()).toBeNull();
    expect((await student().booking.access()).locked).toBe(true);
    expect(await owner().accessPlan.forUser({ userId: STUDENT })).toEqual([]);
  });
});
