import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, createEntity, eq } from "@matops/db";
import {
  accessAssignment,
  accessPlanPrice,
  entity,
  entityMembership,
} from "@matops/db/schema";

import type { Harness } from "./helpers";
import {
  harness,
  personId,
  rejectionCode,
  seedAcademies,
  uploadProof,
} from "./helpers";

const ORG = "acad_assign";
const OWNER = "u_assign_owner";
const COACH = "u_assign_coach";
const ALEX = "u_assign_alex";
const BEA = "u_assign_bea";
const STRANGER = "u_assign_stranger";

async function branchStatus(
  h: Harness,
  entityId: string,
  userId: string,
): Promise<string | null> {
  const rows = await h.exec
    .select({ status: entityMembership.status })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.entityId, entityId),
        eq(entityMembership.userId, userId),
      ),
    );
  return rows[0]?.status ?? null;
}

describe("assigning a shared membership", () => {
  let h: Harness;
  let gym: string;
  let plan: string;

  const owner = () => h.as(OWNER, ORG);

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700082",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: ALEX, role: "student", status: "active" },
          { userId: BEA, role: "student", status: "active" },
        ],
      },
    ]);
    await h.pg.exec(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ('${STRANGER}', 'Stranger', '${STRANGER}@test.local', true, now(), now())`,
    );
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    gym = made.entityId;
    const created = await owner().accessPlan.create({
      name: "BJJ + Gym",
      entityIds: [ORG, gym],
    });
    plan = created.id;
  });

  afterAll(() => h.close());

  it("does not sell organization staff a membership", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.assign({ userId: OWNER, planId: plan }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("does not sell a coach membership for their staff branch", async () => {
    const staffPlan = await owner().accessPlan.create({
      name: "Staff mat",
      entityIds: [ORG],
    });
    expect(
      await rejectionCode(
        owner().accessPlan.assign({ userId: COACH, planId: staffPlan.id }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("allows a coach to buy student access at another branch", async () => {
    const gymPlan = await owner().accessPlan.create({
      name: "Coach training elsewhere",
      entityIds: [gym],
    });
    const made = await owner().accessPlan.assign({
      userId: COACH,
      planId: gymPlan.id,
    });
    expect(made.created).toBe(true);
    const memberships = await h.exec
      .select()
      .from(entityMembership)
      .where(eq(entityMembership.userId, COACH));
    expect(memberships.find((m) => m.entityId === ORG)?.role).toBe(
      "instructor",
    );
    expect(memberships.find((m) => m.entityId === gym)?.role).toBe("student");
  });

  it("is owner only", async () => {
    expect(
      await rejectionCode(
        h.as(COACH, ORG).accessPlan.assign({ userId: ALEX, planId: plan }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses somebody who is not part of the gym", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.assign({ userId: STRANGER, planId: plan }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("enrols the person at every covered branch that had nobody", async () => {
    expect(await branchStatus(h, gym, ALEX)).toBeNull();

    const made = await owner().accessPlan.assign({
      userId: ALEX,
      planId: plan,
      assigningEntityId: ORG,
    });

    expect(made.created).toBe(true);
    expect(made.enrolled).toEqual([gym]);
    expect(await branchStatus(h, gym, ALEX)).toBe("active");
    // The mat membership was already there, so it is left alone, not remade.
    expect(await branchStatus(h, ORG, ALEX)).toBe("active");
  });

  it("returns the existing membership when assigned again from another branch", async () => {
    const first = await owner().accessPlan.assign({
      userId: BEA,
      planId: plan,
      assigningEntityId: ORG,
    });
    const again = await owner().accessPlan.assign({
      userId: BEA,
      planId: plan,
      assigningEntityId: gym,
    });

    expect([again.id, again.created, again.restored]).toEqual([
      first.id,
      false,
      false,
    ]);
    const held = await owner().accessPlan.forUser({ userId: BEA });
    expect(held).toHaveLength(1);
  });

  it("never reactivates a suspended branch membership", async () => {
    await h.exec
      .update(entityMembership)
      .set({ status: "suspended" })
      .where(
        and(
          eq(entityMembership.entityId, gym),
          eq(entityMembership.userId, BEA),
        ),
      );

    const again = await owner().accessPlan.assign({
      userId: BEA,
      planId: plan,
    });

    expect(await branchStatus(h, gym, BEA)).toBe("suspended");
    expect(again.enrolled).toEqual([]);
    expect(again.needsDecision).toEqual([
      { entityId: gym, status: "suspended" },
    ]);
  });

  it("suspends and cancels the whole shared membership at once", async () => {
    const made = await owner().accessPlan.assign({
      userId: ALEX,
      planId: plan,
    });
    expect((await owner().accessPlan.suspend({ id: made.id })).status).toBe(
      "suspended",
    );
    expect(
      (await owner().accessPlan.forUser({ userId: ALEX }))[0]?.status,
    ).toBe("suspended");

    expect((await owner().accessPlan.cancel({ id: made.id })).status).toBe(
      "cancelled",
    );
  });

  it("puts a cancelled membership back on its feet when assigned again", async () => {
    const back = await owner().accessPlan.assign({
      userId: ALEX,
      planId: plan,
    });
    expect([back.created, back.restored]).toEqual([false, true]);
    expect(
      (await owner().accessPlan.forUser({ userId: ALEX }))[0]?.status,
    ).toBe("active");
  });

  it("leaves the branch memberships alone when a membership is cancelled", async () => {
    expect(await branchStatus(h, gym, ALEX)).toBe("active");
    expect(await branchStatus(h, ORG, ALEX)).toBe("active");
  });

  it("refuses a new membership on an archived plan, and keeps the old ones", async () => {
    const shelved = await owner().accessPlan.create({
      name: "Old deal",
      entityIds: [ORG],
    });
    const held = await owner().accessPlan.assign({
      userId: ALEX,
      planId: shelved.id,
    });
    await owner().accessPlan.archive({ id: shelved.id, archived: true });

    expect(
      await rejectionCode(
        owner().accessPlan.assign({ userId: BEA, planId: shelved.id }),
      ),
    ).toBe("CONFLICT");
    // The person who already holds it keeps it, and may still be restored.
    await owner().accessPlan.suspend({ id: held.id });
    const again = await owner().accessPlan.assign({
      userId: ALEX,
      planId: shelved.id,
    });
    expect(again.restored).toBe(true);
  });

  it("starts the membership on the first of a calendar month", async () => {
    const held = await owner().accessPlan.forUser({ userId: BEA });
    expect(held[0]?.startMonth).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("records the coverage the plan holds, not the branch it was assigned from", async () => {
    const held = await owner().accessPlan.forUser({ userId: BEA });
    expect(held[0]?.entityIds).toEqual([ORG, gym].sort());
    expect(held[0]?.assigningEntityId).toBe(ORG);
  });
});

describe("marking a membership month paid", () => {
  const ORG2 = "acad_months";
  const BOSS = "u_months_owner";
  const HAND = "u_months_coach";
  const SAM = "u_months_sam";
  let h: Harness;
  let assignment: string;

  const owner = () => h.as(BOSS, ORG2);

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG2,
        code: "700083",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: HAND, role: "instructor", status: "active" },
          { userId: SAM, role: "student", status: "active" },
        ],
      },
    ]);
    const plan = await owner().accessPlan.create({
      name: "Mat only",
      entityIds: [ORG2],
      priceMinor: 6500,
      currency: "EUR",
    });
    const made = await owner().accessPlan.assign({
      userId: SAM,
      planId: plan.id,
      startMonth: "2026-09-01",
    });
    assignment = made.id;
    await h.exec
      .update(accessAssignment)
      .set({ startsOn: "2026-09-01" })
      .where(eq(accessAssignment.id, assignment));
    await h.exec
      .update(accessPlanPrice)
      .set({ effectiveMonth: "2026-09-01" })
      .where(eq(accessPlanPrice.planId, plan.id));
  });

  afterAll(() => h.close());

  const auditCount = async (): Promise<number> => {
    const res = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "membership_month_audit"`,
    );
    return res.rows[0]?.n ?? -1;
  };
  const monthsOf = async () =>
    (
      await h.pg.query<{ month: string; status: string }>(
        `SELECT month::text AS month, status FROM "membership_month"
           WHERE assignment_id = $1 ORDER BY month DESC`,
        [assignment],
      )
    ).rows;

  it("is owner only", async () => {
    expect(
      await rejectionCode(
        h.as(HAND, ORG2).accessPlan.markMonth({
          assignmentId: assignment,
          month: "2026-09-01",
          paid: true,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses a month that is not the first of one", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.markMonth({
          assignmentId: assignment,
          month: "2026-09-15",
          paid: true,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("has no record at all until somebody ticks it", async () => {
    expect(await monthsOf()).toEqual([]);
  });

  it("marks a month paid once, however many times it is called", async () => {
    const first = await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month: "2026-09-01",
      paid: true,
    });
    const again = await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month: "2026-09-01",
      paid: true,
    });

    expect([first.changed, again.changed]).toEqual([true, false]);
    const months = await monthsOf();
    expect(months).toHaveLength(1);
    expect([months[0]?.month, months[0]?.status]).toEqual([
      "2026-09-01",
      "confirmed",
    ]);
    expect(await auditCount()).toBe(1);
  });

  it("writes an audit row for a correction, and none for a no-op", async () => {
    const before = await auditCount();
    await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month: "2026-09-01",
      paid: false,
    });
    expect(await auditCount()).toBe(before + 1);

    await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month: "2026-09-01",
      paid: false,
    });
    expect(await auditCount()).toBe(before + 1);

    const rows = await h.pg.query<{
      before_status: string | null;
      after_status: string;
    }>(
      `SELECT before_status, after_status FROM "membership_month_audit" ORDER BY created_at ASC`,
    );
    expect(rows.rows.map((r) => [r.before_status, r.after_status])).toEqual([
      [null, "confirmed"],
      ["confirmed", "unpaid"],
    ]);
  });

  it("keeps one record for a shared membership, not one per branch", async () => {
    await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month: "2026-10-01",
      paid: true,
    });
    const months = await monthsOf();
    expect(months.map((m) => m.month)).toEqual(["2026-10-01", "2026-09-01"]);
  });

  it("refuses a membership that is not this gym's", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.markMonth({
          assignmentId: "99999999-9999-4999-8999-999999999999",
          month: "2026-09-01",
          paid: true,
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("lists every active membership of the month, unpaid included", async () => {
    const board = await owner().accessPlan.monthBoard();
    expect(board.month).toMatch(/^\d{4}-\d{2}-01$/);
    expect(board.monthLabel).toBeTruthy();

    const row = board.rows.find((r) => r.assignmentId === assignment);
    expect(row?.userId).toBe(personId(ORG2, SAM));
    expect(row?.planName).toBe("Mat only");
    expect(row?.entityIds).toEqual([ORG2]);
    expect(row?.deadlineLabel).toBeTruthy();
  });

  it("counts a month as paid on the board once it is ticked", async () => {
    const start = await owner().accessPlan.monthBoard();
    await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month: start.month,
      paid: false,
    });
    const before = await owner().accessPlan.monthBoard();
    await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month: start.month,
      paid: true,
    });
    const after = await owner().accessPlan.monthBoard();
    expect([
      after.paidCount,
      after.rows.find((r) => r.assignmentId === assignment)?.paid,
    ]).toEqual([before.paidCount + 1, true]);
  });

  it("keeps the board owner only", async () => {
    expect(await rejectionCode(h.as(HAND, ORG2).accessPlan.monthBoard())).toBe(
      "FORBIDDEN",
    );
  });

  it("carries the month a tick acts on, and its state, to the member profile", async () => {
    const held = await owner().accessPlan.forUser({ userId: SAM });
    const month = held[0]?.month ?? "";
    expect(month).toMatch(/^\d{4}-\d{2}-01$/);
    expect(held[0]?.monthLabel).toBeTruthy();

    await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month,
      paid: true,
    });
    const paid = await owner().accessPlan.forUser({ userId: SAM });
    expect([paid[0]?.month, paid[0]?.paid]).toEqual([month, true]);

    await owner().accessPlan.markMonth({
      assignmentId: assignment,
      month,
      paid: false,
    });
    const undone = await owner().accessPlan.forUser({ userId: SAM });
    expect(undone[0]?.paid).toBe(false);
  });
});

describe("a member says they paid", () => {
  const ORGC = "acad_claim";
  const OTHERC = "acad_claim_other";
  const BOSS = "u_claim_owner";
  const SAM = "u_claim_sam";
  const LEE = "u_claim_lee";
  const STRANGER = "u_claim_stranger";
  let h: Harness;
  let sams: string;
  let lees: string;

  const owner = () => h.as(BOSS, ORGC);
  const monthNow = () => `${new Date().toISOString().slice(0, 7)}-01` as const;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORGC,
        code: "700088",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: SAM, role: "student", status: "active" },
          { userId: LEE, role: "student", status: "active" },
        ],
      },
      {
        id: OTHERC,
        code: "700089",
        members: [{ userId: STRANGER, role: "owner", status: "active" }],
      },
    ]);
    const plan = await owner().accessPlan.create({
      name: "Mat only",
      entityIds: [ORGC],
      priceMinor: 6500,
      currency: "EUR",
    });
    sams = (await owner().accessPlan.assign({ userId: SAM, planId: plan.id }))
      .id;
    lees = (await owner().accessPlan.assign({ userId: LEE, planId: plan.id }))
      .id;
    await h.exec
      .update(entity)
      .set({ membershipEnforcedAt: new Date() })
      .where(eq(entity.id, ORGC));
  });

  const proof = () => uploadProof(h, SAM, ORGC);

  afterAll(() => h.close());

  const auditCount = async (): Promise<number> => {
    const res = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "membership_month_audit"`,
    );
    return res.rows[0]?.n ?? -1;
  };

  it("records one claim on the month the member is judged on", async () => {
    const made = await h.as(SAM, ORGC).accessPlan.claimMonth({
      assignmentId: sams,
      proofFileId: await proof(),
    });
    expect([made.claimed, made.month]).toEqual([true, monthNow()]);
    const waiting = await owner().accessPlan.claims();
    expect(waiting).toHaveLength(1);
    expect([waiting[0]?.assignmentId, waiting[0]?.planName]).toEqual([
      sams,
      "Mat only",
    ]);
  });

  it("takes a second press as the same claim", async () => {
    const again = await h
      .as(SAM, ORGC)
      .accessPlan.claimMonth({ assignmentId: sams });
    expect(again.claimed).toBe(false);
    expect(await owner().accessPlan.claims()).toHaveLength(1);
  });

  it("leaves the month unpaid while it waits", async () => {
    const mine = await h.as(SAM, ORGC).accessPlan.mine();
    expect(mine.memberships[0]?.paid).toBe(false);
    expect(mine.memberships[0]?.reportedAt).toBeInstanceOf(Date);
  });

  it("refuses a claim on somebody else's membership", async () => {
    expect(
      await rejectionCode(
        h.as(LEE, ORGC).accessPlan.claimMonth({ assignmentId: sams }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("refuses a claim on a cancelled membership", async () => {
    await owner().accessPlan.cancel({ id: lees });
    expect(
      await rejectionCode(
        h.as(LEE, ORGC).accessPlan.claimMonth({ assignmentId: lees }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("keeps another gym's claims out of the queue", async () => {
    expect(await h.as(STRANGER, OTHERC).accessPlan.claims()).toEqual([]);
  });

  it("keeps the queue owner only", async () => {
    expect(await rejectionCode(h.as(SAM, ORGC).accessPlan.claims())).toBe(
      "FORBIDDEN",
    );
  });

  it("clears the claim and marks the month paid when the owner confirms", async () => {
    await owner().accessPlan.markMonth({
      assignmentId: sams,
      month: monthNow(),
      paid: true,
    });
    expect(await owner().accessPlan.claims()).toEqual([]);
    const mine = await h.as(SAM, ORGC).accessPlan.mine();
    expect([
      mine.memberships[0]?.paid,
      mine.memberships[0]?.reportedAt,
    ]).toEqual([true, null]);
  });

  it("leaves no claim behind when a paid month is corrected back to unpaid", async () => {
    await owner().accessPlan.markMonth({
      assignmentId: sams,
      month: monthNow(),
      paid: false,
    });
    expect(await owner().accessPlan.claims()).toEqual([]);
    expect(
      (await h.as(SAM, ORGC).accessPlan.mine()).memberships[0]?.reportedAt,
    ).toBeNull();
  });

  it("rejects the claim and blocks another report until the hold is resolved", async () => {
    await h.as(SAM, ORGC).accessPlan.claimMonth({
      assignmentId: sams,
      proofFileId: await proof(),
    });
    const before = await auditCount();

    const rejected = await owner().accessPlan.rejectClaim({
      assignmentId: sams,
      month: monthNow(),
    });
    expect(rejected.cleared).toBe(true);
    expect(await owner().accessPlan.claims()).toEqual([]);
    expect(await auditCount()).toBe(before + 1);

    expect(
      await h.as(SAM, ORGC).accessPlan.claimMonth({ assignmentId: sams }),
    ).toMatchObject({ claimed: false, status: "rejected" });
    expect(await owner().accessPlan.claims()).toHaveLength(0);
  });

  it("reports nothing cleared when there was no claim", async () => {
    await owner().accessPlan.rejectClaim({
      assignmentId: sams,
      month: monthNow(),
    });
    const twice = await owner().accessPlan.rejectClaim({
      assignmentId: sams,
      month: monthNow(),
    });
    expect(twice.cleared).toBe(false);
  });
});

describe("the membership policy", () => {
  const ORG3 = "acad_policy";
  const BOSS = "u_policy_owner";
  const HAND = "u_policy_coach";
  let h: Harness;

  const owner = () => h.as(BOSS, ORG3);

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG3,
        code: "700085",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: HAND, role: "instructor", status: "active" },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  it("answers with sane settings before anybody has saved any", async () => {
    const seen = await owner().accessPlan.policy();
    expect([seen.graceDays, seen.calendarTimeZone]).toEqual([7, null]);
    expect(seen.effective).toBe(seen.suggested);
  });

  it("suggests the main branch's own zone", async () => {
    await owner().academy.updateSettings({ timeZone: "Europe/Kyiv" });
    const seen = await owner().accessPlan.policy();
    expect([seen.suggested, seen.effective]).toEqual([
      "Europe/Kyiv",
      "Europe/Kyiv",
    ]);
  });

  it("saves the owner's own choice and reads it back", async () => {
    await owner().accessPlan.setPolicy({
      graceDays: 14,
      calendarTimeZone: "Europe/Lisbon",
    });
    const seen = await owner().accessPlan.policy();
    expect([seen.graceDays, seen.calendarTimeZone, seen.effective]).toEqual([
      14,
      "Europe/Lisbon",
      "Europe/Lisbon",
    ]);
  });

  it("saves again without making a second row", async () => {
    await owner().accessPlan.setPolicy({ graceDays: 3 });
    const seen = await owner().accessPlan.policy();
    expect([seen.graceDays, seen.calendarTimeZone]).toEqual([3, null]);
    const rows = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "membership_policy"`,
    );
    expect(rows.rows[0]?.n).toBe(1);
  });

  it("refuses a grace the column would refuse too", async () => {
    expect(
      await rejectionCode(owner().accessPlan.setPolicy({ graceDays: 99 })),
    ).toBe("BAD_REQUEST");
  });

  it("refuses a zone nobody has heard of", async () => {
    expect(
      await rejectionCode(
        owner().accessPlan.setPolicy({
          graceDays: 7,
          calendarTimeZone: "Mars/Olympus",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("is owner only", async () => {
    expect(await rejectionCode(h.as(HAND, ORG3).accessPlan.policy())).toBe(
      "FORBIDDEN",
    );
  });
});

describe("where a member is told to pay", () => {
  const ORG4 = "acad_account";
  const OTHER4 = "acad_account_other";
  const BOSS = "u_account_owner";
  const ANA = "u_account_ana";
  const BRUNO = "u_account_bruno";
  const STRANGER = "u_account_stranger";
  let h: Harness;
  let planId: string;

  const owner = () => h.as(BOSS, ORG4);

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG4,
        code: "700086",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: ANA, role: "student", status: "active" },
          { userId: BRUNO, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER4,
        code: "700087",
        members: [{ userId: STRANGER, role: "owner", status: "active" }],
      },
    ]);
    await owner().paymentMethod.save({
      kind: "bank",
      label: "Bank transfer",
      details: "Demo Bank\nIBAN: PT50 1111",
      enabled: true,
    });
    const plan = await owner().accessPlan.create({
      name: "Unlimited",
      entityIds: [ORG4],
    });
    planId = plan.id;
    for (const userId of [ANA, BRUNO]) {
      await owner().accessPlan.assign({ userId, planId });
    }
  });

  afterAll(() => h.close());

  it("hands a member the account and their own reference", async () => {
    const mine = await h.as(ANA, ORG4).accessPlan.mine();
    expect(mine.paymentMethods.map((m) => m.details)).toEqual([
      "Demo Bank\nIBAN: PT50 1111",
    ]);
    expect(mine.memberships[0]?.reference).toContain("USER U_ACCOUNT_ANA");
  });

  it("gives two members of one gym different references", async () => {
    const ana = await h.as(ANA, ORG4).accessPlan.mine();
    const bruno = await h.as(BRUNO, ORG4).accessPlan.mine();
    expect(ana.memberships[0]?.reference).not.toBe(
      bruno.memberships[0]?.reference,
    );
  });

  it("keeps another gym's bank account out of sight", async () => {
    expect(await h.as(STRANGER, OTHER4).paymentMethod.list()).toEqual([]);
  });
});
