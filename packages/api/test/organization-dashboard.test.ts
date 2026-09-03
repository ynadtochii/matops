import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity } from "@matops/db";
import { entityMembership } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, memberId, rejectionCode, seedClasses } from "./helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const OWNER = "u_owner";
const COACH = "u_coach";
const NOMAD = "u_nomad";
const RIVAL = "u_rival";
const PLAN = "11111111-1111-4111-8111-000000000001";

function withEntity(id: string): Headers {
  const headers = new Headers();
  headers.set("x-matops-entity", id);
  return headers;
}

describe("the organization dashboard", () => {
  let h: Harness;
  let pg: PGlite;
  let north: string;
  let south: string;

  beforeAll(async () => {
    h = await harness([
      {
        id: ORG_A,
        code: "100001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: NOMAD, role: "student", status: "active" },
        ],
      },
      {
        id: ORG_B,
        code: "100002",
        members: [{ userId: RIVAL, role: "owner", status: "active" }],
      },
    ]);
    pg = h.pg;
    north = ORG_A;

    const made = await createEntity(
      {
        organizationId: ORG_A,
        type: "bjj_academy",
        name: "South Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    south = made.entityId;

    await h.exec.insert(entityMembership).values([
      {
        id: "emem_south_nomad",
        organizationId: ORG_A,
        entityId: south,
        userId: NOMAD,
        role: "student",
        status: "active",
        joinedAt: new Date(),
      },
      {
        id: "emem_south_coach",
        organizationId: ORG_A,
        entityId: south,
        userId: COACH,
        role: "member",
        status: "pending",
        invitedRole: "student",
      },
    ]);

    await seedClasses(pg, [
      {
        id: "11111111-0000-4000-8000-000000000001",
        academyId: north,
        instructorId: OWNER,
        startsInMinutes: 120,
      },
      {
        id: "11111111-0000-4000-8000-000000000002",
        academyId: south,
        instructorId: OWNER,
        startsInMinutes: 180,
      },
      {
        id: "11111111-0000-4000-8000-000000000003",
        academyId: ORG_B,
        instructorId: RIVAL,
        startsInMinutes: 90,
      },
    ]);

    await pg.exec(`
      INSERT INTO "membership_plan" (id, academy_id, name, price_minor, currency)
        VALUES ('${PLAN}', '${north}', 'Unlimited', 8000, 'EUR');
      INSERT INTO "payment_claim"
        (academy_id, member_id, plan_id, amount_minor, currency, period, status)
        VALUES ('${north}', '${memberId(ORG_A, NOMAD)}', '${PLAN}',
                8000, 'EUR', '2026-09', 'pending');
      INSERT INTO "payment_claim"
        (academy_id, member_id, plan_id, amount_minor, currency, period,
         status, confirmed_by, confirmed_at)
        VALUES ('${north}', '${memberId(ORG_A, COACH)}', '${PLAN}',
                8000, 'EUR', '2026-08', 'confirmed', '${OWNER}', now());
      INSERT INTO "drop_in"
        (academy_id, first_name, last_name, phone, consent, stage)
        VALUES ('${south}', 'Dana', 'Reis', '+351900000001', true, 'new');
    `);
  });

  afterAll(() => h.close());

  it("includes every academy the organization runs", async () => {
    const total = await h.as(OWNER, ORG_A).stats.organization();
    expect(total.entities.map((e) => e.entityId).sort()).toEqual(
      [north, south].sort(),
    );
  });

  it("never includes another organization's academy", async () => {
    const total = await h.as(OWNER, ORG_A).stats.organization();
    expect(total.entities.map((e) => e.entityId)).not.toContain(ORG_B);
    expect(total.upcomingClasses).toBe(2);
  });

  it("counts a member of two mats once", async () => {
    const total = await h.as(OWNER, ORG_A).stats.organization();
    const perMat = total.entities.reduce(
      (n, e) => n + e.memberUserIds.length,
      0,
    );
    expect(perMat).toBe(5);
    expect(total.members).toBe(3);
  });

  it("groups the work by academy", async () => {
    const total = await h.as(OWNER, ORG_A).stats.organization();
    const byId = new Map(total.entities.map((e) => [e.entityId, e]));
    expect(byId.get(north)?.openClaims).toBe(1);
    expect(byId.get(south)?.newLeads).toBe(1);
    expect(byId.get(south)?.pendingMembers).toBe(1);
    expect([total.openClaims, total.newLeads, total.pendingMembers]).toEqual([
      1, 1, 1,
    ]);
  });

  it("refuses an instructor of the organization", async () => {
    expect(await rejectionCode(h.as(COACH, ORG_A).stats.organization())).toBe(
      "FORBIDDEN",
    );
  });

  it("refuses the owner of another organization", async () => {
    const total = await h.as(RIVAL, ORG_B).stats.organization();
    expect(total.entities.map((e) => e.entityId)).toEqual([ORG_B]);
  });

  it("leaves the per-academy dashboard entity-only", async () => {
    const here = await h.as(OWNER, ORG_A, withEntity(north)).stats.dashboard();
    const there = await h.as(OWNER, ORG_A, withEntity(south)).stats.dashboard();
    expect(here.revenue?.map((r) => r.currency)).toEqual(["EUR"]);
    expect(there.revenue).toEqual([]);
  });
});
