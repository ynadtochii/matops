import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nextMonth } from "@matops/domain";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const ORG = "acad_pay_link";
const OWNER = "u_pay_link_owner";
const STUDENT = "u_pay_link_student";
const LINK = "https://buy.stripe.com/test_now";
const NEXT_LINK = "https://buy.stripe.com/test_next";

describe("plan payment link (ADR 156)", () => {
  let h: Harness;
  let planId: string;

  const owner = () => h.as(OWNER, ORG);
  const student = () => h.as(STUDENT, ORG);
  const held = async () => {
    const mine = await student().accessPlan.mine();
    const membership = mine.memberships.find((m) => m.planName === "Adults");
    if (!membership) throw new Error("student holds no Adults membership");
    return membership;
  };

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700060",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
    ]);
    const unpriced = await owner().accessPlan.create({
      name: "Unpriced",
      entityIds: [ORG],
    });
    expect(
      await rejectionCode(
        owner().accessPlan.setPaymentLink({
          planId: unpriced.id,
          paymentLinkUrl: LINK,
        }),
      ),
    ).toBe("PRECONDITION_FAILED");

    const made = await owner().accessPlan.create({
      name: "Adults",
      entityIds: [ORG],
      priceMinor: 4500,
      currency: "EUR",
    });
    planId = made.id;
    await owner().accessPlan.assign({ userId: STUDENT, planId });
  });

  afterAll(() => h.close());

  it("starts with no card link", async () => {
    expect((await held()).cardPaymentUrl).toBeNull();
  });

  it("lets only staff who run the gym set it", async () => {
    expect(
      await rejectionCode(
        student().accessPlan.setPaymentLink({ planId, paymentLinkUrl: LINK }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses a link that is not a Stripe payment link", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.setPaymentLink({
          planId,
          paymentLinkUrl: "https://evil.test/pay",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("gives the student the link with their membership and month", async () => {
    await owner().accessPlan.setPaymentLink({ planId, paymentLinkUrl: LINK });
    const plans = await owner().accessPlan.list();
    expect(plans.find((p) => p.id === planId)?.paymentLinkUrl).toBe(LINK);

    const membership = await held();
    expect(membership.cardPaymentUrl).toBe(
      `${LINK}?client_reference_id=${membership.assignmentId}_${membership.month.slice(0, 7)}`,
    );
  });

  it("keeps this month's link when a future price brings its own", async () => {
    const membership = await held();
    await owner().accessPlan.setPrice({
      id: planId,
      priceMinor: 5000,
      currency: "EUR",
      effectiveMonth: nextMonth(membership.month),
      paymentLinkUrl: NEXT_LINK,
    });
    expect((await held()).cardPaymentUrl?.startsWith(`${LINK}?`)).toBe(true);
    const plans = await owner().accessPlan.list();
    const plan = plans.find((p) => p.id === planId);
    expect(plan?.paymentLinkUrl).toBe(LINK);
    expect(plan?.currentAmount).toEqual({ priceMinor: 4500, currency: "EUR" });
    expect(plan?.priceMinor).toBe(5000);
  });

  it("keeps a link when the same month is priced again without one", async () => {
    const membership = await held();
    await owner().accessPlan.setPrice({
      id: planId,
      priceMinor: 5200,
      currency: "EUR",
      effectiveMonth: nextMonth(membership.month),
    });
    const rows = await h.pg.query<{ link: string | null }>(
      `SELECT payment_link_url AS link FROM access_plan_price WHERE plan_id = $1 AND effective_month = $2`,
      [planId, nextMonth(membership.month)],
    );
    expect(rows.rows[0]?.link).toBe(NEXT_LINK);
  });

  it("removes the link", async () => {
    await owner().accessPlan.setPaymentLink({ planId, paymentLinkUrl: null });
    expect((await held()).cardPaymentUrl).toBeNull();
  });
});
