import { afterEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, memberId, rejectionCode, seedAcademies } from "./helpers";

const A = "academy_A";
const OWNER = "u_owner";
const COACH = "u_coach";
const ANA = "u_ana";
const BO = "u_bo";
const CY = "u_cy";

const m = (userId: string) => memberId(A, userId);

let open: Harness | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function base(): Promise<Harness> {
  const h = await harness();
  open = h;
  await seedAcademies(h.pg, [
    {
      id: A,
      code: "100001",
      members: [
        { userId: OWNER, role: "owner", status: "active" },
        { userId: COACH, role: "instructor", status: "active" },
        { userId: ANA, role: "student", status: "active", name: "Ana" },
        { userId: BO, role: "student", status: "active", name: "Bo" },
        { userId: CY, role: "student", status: "active", name: "Cy" },
      ],
    },
  ]);
  return h;
}

async function referrerOf(h: Harness, student: string): Promise<string | null> {
  const res = await h.pg.query<{ referrer_member_id: string | null }>(
    `SELECT referrer_member_id FROM "member_referral" WHERE student_member_id = $1`,
    [student],
  );
  return res.rows[0]?.referrer_member_id ?? null;
}

async function auditCount(h: Harness): Promise<number> {
  const res = await h.pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "member_referral_audit"`,
  );
  return res.rows[0]?.n ?? 0;
}

describe("referral.correct", () => {
  it("moves the credit to a different member and writes an audit row", async () => {
    const h = await base();
    await h
      .as(OWNER, A)
      .referral.assign({ studentMemberId: m(ANA), referrerMemberId: m(BO) });

    await h
      .as(OWNER, A)
      .referral.correct({ studentMemberId: m(ANA), referrerMemberId: m(CY) });

    expect(await referrerOf(h, m(ANA))).toBe(m(CY));
    expect(await auditCount(h)).toBeGreaterThan(0);
  });

  it("clears the credit when the correction names nobody", async () => {
    const h = await base();
    await h
      .as(OWNER, A)
      .referral.assign({ studentMemberId: m(ANA), referrerMemberId: m(BO) });

    await h
      .as(OWNER, A)
      .referral.correct({ studentMemberId: m(ANA), referrerMemberId: null });

    expect(await referrerOf(h, m(ANA))).toBeNull();
  });

  it("refuses when there is nothing to correct", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as(OWNER, A).referral.correct({
          studentMemberId: m(ANA),
          referrerMemberId: m(BO),
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("refuses a correction that changes nothing", async () => {
    const h = await base();
    await h
      .as(OWNER, A)
      .referral.assign({ studentMemberId: m(ANA), referrerMemberId: m(BO) });

    expect(
      await rejectionCode(
        h.as(OWNER, A).referral.correct({
          studentMemberId: m(ANA),
          referrerMemberId: m(BO),
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("refuses to credit a referral to a coach", async () => {
    const h = await base();
    await h
      .as(OWNER, A)
      .referral.assign({ studentMemberId: m(ANA), referrerMemberId: m(BO) });

    expect(
      await rejectionCode(
        h.as(OWNER, A).referral.correct({
          studentMemberId: m(COACH),
          referrerMemberId: m(BO),
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("is owner-only", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as(COACH, A).referral.correct({
          studentMemberId: m(ANA),
          referrerMemberId: m(CY),
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});
