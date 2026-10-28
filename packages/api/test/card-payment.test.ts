import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nextMonth } from "@matops/domain";

import type { Harness } from "./helpers";
import { cardPaymentWebhookResponse } from "../src/card-payment";
import { openSecret } from "../src/secret-box";
import { signStripePayload } from "../src/stripe-signature";
import {
  harness,
  rejectionCode,
  seedAcademies,
  TEST_PAYMENT_KEY,
} from "./helpers";

const ORG = "acad_card_pay";
const OWNER = "u_card_pay_owner";
const MANAGER = "u_card_pay_manager";
const STUDENT = "u_card_pay_student";
const SECRET = "whsec_test_0123456789abcdef";

describe("card payment webhook (ADR 157)", () => {
  let h: Harness;
  let assignmentId: string;
  let month: string;
  let hookUrl: string;
  let session = 0;

  const owner = () => h.as(OWNER, ORG);
  const manager = () => h.as(MANAGER, ORG);
  const tokenOf = (url: string) => url.split("/").pop() ?? "";

  const deliver = async (
    object: Record<string, unknown>,
    opts: {
      url?: string;
      secret?: string;
      type?: string;
      livemode?: boolean;
      requireLive?: boolean;
      keys?: Buffer[];
    } = {},
  ) => {
    const body = JSON.stringify({
      id: `evt_${session}`,
      type: opts.type ?? "checkout.session.completed",
      livemode: opts.livemode ?? false,
      data: { object },
    });
    const url = opts.url ?? hookUrl;
    const response = await cardPaymentWebhookResponse(
      new Request(url, {
        method: "POST",
        body,
        headers: {
          "stripe-signature": signStripePayload(
            opts.secret ?? SECRET,
            body,
            Math.floor(Date.now() / 1000),
          ),
        },
      }),
      tokenOf(url),
      {
        secretKeys: opts.keys ?? [TEST_PAYMENT_KEY],
        requireLive: opts.requireLive ?? false,
        report: () => undefined,
        baseDb: h.exec,
      },
    );
    const json = response.ok
      ? ((await response.json()) as { outcome: string })
      : null;
    return { status: response.status, outcome: json?.outcome };
  };

  const paid = (overrides: Record<string, unknown> = {}) => {
    session += 1;
    return {
      id: `cs_test_${session}`,
      payment_status: "paid",
      amount_total: 4500,
      currency: "eur",
      client_reference_id: `${assignmentId}_${month.slice(0, 7)}`,
      ...overrides,
    };
  };

  const monthRow = async (m: string) =>
    (
      await h.pg.query<{ status: string; reviewed_by: string | null }>(
        `SELECT status, reviewed_by FROM membership_month WHERE assignment_id = $1 AND month = $2`,
        [assignmentId, m],
      )
    ).rows[0];

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700070",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
    ]);
    const plan = await owner().accessPlan.create({
      name: "Adults",
      entityIds: [ORG],
      priceMinor: 4500,
      currency: "EUR",
    });
    await owner().accessPlan.assign({ userId: STUDENT, planId: plan.id });
    const mine = await h.as(STUDENT, ORG).accessPlan.mine();
    const held = mine.memberships.find((m) => m.planName === "Adults");
    if (!held) throw new Error("no membership");
    assignmentId = held.assignmentId;
    month = held.month;
  });

  afterAll(() => h.close());

  it("starts off and lets only the owner set it up", async () => {
    expect(await manager().cardPayment.hook()).toEqual({
      configured: true,
      state: "none",
      url: null,
      lastEventAt: null,
      lastProblem: null,
      lastProblemAt: null,
    });
    expect(await rejectionCode(manager().cardPayment.startHook())).toBe(
      "FORBIDDEN",
    );
    hookUrl = (await owner().cardPayment.startHook()).url;
    expect(hookUrl.startsWith("http://localhost:3004/api/stripe/hooks/")).toBe(
      true,
    );
    expect((await manager().cardPayment.hook()).state).toBe("needs_secret");
  });

  it("refuses events until the secret is saved", async () => {
    expect((await deliver(paid())).status).toBe(409);
  });

  it("stores the signing secret encrypted", async () => {
    expect(
      await rejectionCode(
        owner().cardPayment.saveSecret({ secret: "sk_live_nope" }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await rejectionCode(manager().cardPayment.saveSecret({ secret: SECRET })),
    ).toBe("FORBIDDEN");
    await owner().cardPayment.saveSecret({ secret: SECRET });
    const row = await h.pg.query<{ sealed: string }>(
      `SELECT secret_ciphertext AS sealed FROM stripe_hook WHERE organization_id = $1`,
      [ORG],
    );
    const sealed = row.rows[0]?.sealed ?? "";
    expect(sealed).not.toContain(SECRET);
    expect(openSecret(TEST_PAYMENT_KEY, sealed)).toBe(SECRET);
    expect((await owner().cardPayment.hook()).state).toBe("ready");
  });

  it("refuses a wrong signature, an unknown token and a server without a key", async () => {
    expect(
      (await deliver(paid(), { secret: "whsec_other_000000000" })).status,
    ).toBe(400);
    expect((await owner().cardPayment.hook()).lastProblem).toBe(
      "bad_signature",
    );
    expect(
      (
        await deliver(paid(), {
          url: "http://localhost:3004/api/stripe/hooks/aaaaaaaaaaaaaaaaaaaaaaaa",
        })
      ).status,
    ).toBe(404);
    expect((await deliver(paid(), { keys: [] })).status).toBe(503);
    expect(
      (await deliver(paid(), { keys: [Buffer.alloc(32, 9)] })).status,
    ).toBe(500);
    expect(
      (await deliver(paid({ padding: "x".repeat(65 * 1024) }))).status,
    ).toBe(413);
    expect(await monthRow(month)).toBeUndefined();
  });

  it("ignores other events, unpaid sessions and test events in production", async () => {
    expect(
      (await deliver(paid(), { type: "payment_intent.succeeded" })).outcome,
    ).toBe("ignored");
    expect((await deliver(paid({ payment_status: "unpaid" }))).outcome).toBe(
      "ignored",
    );
    expect((await deliver(paid(), { requireLive: true })).outcome).toBe(
      "ignored",
    );
    expect((await owner().cardPayment.hook()).lastProblem).toBe("test_event");
    expect(await monthRow(month)).toBeUndefined();
  });

  it("confirms the month through the same write as Mark paid", async () => {
    const payment = paid();
    expect((await deliver(payment)).outcome).toBe("confirmed");
    expect(await monthRow(month)).toEqual({
      status: "confirmed",
      reviewed_by: null,
    });
    const audit = await h.pg.query<{
      event: string;
      actor: string | null;
      reason: string;
    }>(
      `SELECT event, actor_id AS actor, reason FROM membership_month_audit
         WHERE assignment_id = $1 AND month = $2 ORDER BY created_at DESC LIMIT 1`,
      [assignmentId, month],
    );
    expect(audit.rows[0]).toEqual({
      event: "stripe_paid",
      actor: null,
      reason: payment.id,
    });
    const status = await owner().cardPayment.hook();
    expect(status.lastEventAt).not.toBeNull();
    expect(status.lastProblem).toBeNull();

    session -= 1;
    expect((await deliver(paid())).outcome).toBe("duplicate");
  });

  it("still opens secrets sealed with the previous key", async () => {
    const newer = Buffer.alloc(32, 8);
    expect(
      (await deliver(paid(), { keys: [newer, TEST_PAYMENT_KEY] })).outcome,
    ).toBe("paid_twice");
    await manager().cardPayment.dismiss({
      id: (await manager().cardPayment.toReview())[0]?.id ?? "",
    });
  });

  it("flags a second payment for a month already paid", async () => {
    expect((await deliver(paid())).outcome).toBe("paid_twice");
    const review = await manager().cardPayment.toReview();
    expect(review.map((r) => r.outcome)).toEqual(["paid_twice"]);
    expect(review[0]?.name).toBeTruthy();
  });

  it("leaves a different amount or a missing reference for review", async () => {
    const next = nextMonth(month);
    expect(
      (
        await deliver(
          paid({
            amount_total: 4000,
            client_reference_id: `${assignmentId}_${next.slice(0, 7)}`,
          }),
        )
      ).outcome,
    ).toBe("needs_review");
    expect(await monthRow(next)).toBeUndefined();
    expect((await deliver(paid({ client_reference_id: null }))).outcome).toBe(
      "needs_review",
    );
    expect(
      (
        await deliver(
          paid({
            client_reference_id: `00000000-0000-4000-8000-000000000000_${month.slice(0, 7)}`,
          }),
        )
      ).outcome,
    ).toBe("needs_review");
    expect((await manager().cardPayment.toReview()).length).toBe(4);
  });

  it("hides a payment once staff checked it", async () => {
    const [first] = await manager().cardPayment.toReview();
    if (!first) throw new Error("nothing to review");
    await manager().cardPayment.dismiss({ id: first.id });
    expect(
      (await manager().cardPayment.toReview()).some((r) => r.id === first.id),
    ).toBe(false);
  });

  it("gives a new URL on a fresh setup and retires the old one", async () => {
    const old = hookUrl;
    hookUrl = (await owner().cardPayment.startHook()).url;
    expect(hookUrl).not.toBe(old);
    expect((await deliver(paid(), { url: old })).status).toBe(404);
    await owner().cardPayment.removeHook();
    expect((await owner().cardPayment.hook()).state).toBe("none");
  });
});
