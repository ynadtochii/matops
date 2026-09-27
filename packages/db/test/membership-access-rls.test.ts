import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

const ORG_A = "academy_A";
const ORG_B = "academy_B";
const GYM_A = "e_gym_a";
const ALEX = "u_alex";
const BEA = "u_bea";
const ALEX_PERSON = "11111111-1111-4111-8111-000000000011";
const BEA_PERSON = "11111111-1111-4111-8111-000000000012";
const PLAN_A = "11111111-1111-4111-8111-000000000001";
const PLAN_B = "11111111-1111-4111-8111-000000000002";

/**
 * Isolation for the four access tables (ADR 126).
 *
 * They belong to the ORGANIZATION, so the policy matches on
 * `app.organization_id` and NOT on `app.academy_id`. That is deliberate: one
 * membership covering a mat and a gym is a single row, and an entity-scoped
 * policy could not see it from either branch.
 *
 * The flip side is written down here too. Organization isolation keeps two gyms
 * apart; it does NOT keep two members of the same gym apart, because they share
 * one organization id. Protecting one member's membership from another is the
 * reader's job, not the policy's.
 */
function asOrganization<T>(
  pg: PGlite,
  organizationId: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE matops_app");
    await tx.query("SELECT set_config('app.organization_id', $1, true)", [
      organizationId,
    ]);
    return run(tx);
  });
}

function count(tx: Tx, table: string, where = ""): Promise<number> {
  return tx
    .query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}" ${where}`)
    .then((res) => single(res).n);
}

describe("membership access isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    // Seeded as the bootstrap superuser, which bypasses RLS: two organizations,
    // a second branch for A, two of A's members and one plan each side.
    await pg.exec(`
      INSERT INTO "entity" (id, organization_id, type, name, slug, public_code)
        VALUES ('${GYM_A}', '${ORG_A}', 'bjj_academy', 'Gym A', 'gym-a', '100777');
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('${ALEX}', 'Alex', 'alex@test.local', true, now(), now()),
               ('${BEA}', 'Bea', 'bea@test.local', true, now(), now());
      INSERT INTO "member" (id, organization_id, user_id, role, created_at) VALUES
        ('m_alex', '${ORG_A}', '${ALEX}', 'member', now()),
        ('m_bea', '${ORG_A}', '${BEA}', 'member', now());
      INSERT INTO "person" (id, organization_id, name, account_user_id) VALUES
        ('${ALEX_PERSON}', '${ORG_A}', 'Alex', '${ALEX}'),
        ('${BEA_PERSON}', '${ORG_A}', 'Bea', '${BEA}');
      INSERT INTO "access_plan" (id, organization_id, name) VALUES
        ('${PLAN_A}', '${ORG_A}', 'BJJ + Gym'),
        ('${PLAN_B}', '${ORG_B}', 'Mat only');
      INSERT INTO "access_plan_entity" (organization_id, plan_id, entity_id) VALUES
        ('${ORG_A}', '${PLAN_A}', '${ORG_A}'),
        ('${ORG_A}', '${PLAN_A}', '${GYM_A}'),
        ('${ORG_B}', '${PLAN_B}', '${ORG_B}');
      INSERT INTO "access_assignment"
        (organization_id, person_id, plan_id, start_month, starts_on) VALUES
        ('${ORG_A}', '${ALEX_PERSON}', '${PLAN_A}', '2026-09-01', '2026-09-01'),
        ('${ORG_A}', '${BEA_PERSON}', '${PLAN_A}', '2026-09-01', '2026-09-01');
      INSERT INTO "membership_policy" (organization_id) VALUES ('${ORG_A}');
      INSERT INTO "access_plan_price"
        (organization_id, plan_id, effective_month, price_minor, currency) VALUES
        ('${ORG_A}', '${PLAN_A}', '2026-09-01', 5000, 'EUR'),
        ('${ORG_B}', '${PLAN_B}', '2026-09-01', 4000, 'EUR');
    `);
  });

  afterAll(() => pg.close());

  it("an organization reads its own plans", async () => {
    expect(
      await asOrganization(pg, ORG_A, (tx) => count(tx, "access_plan")),
    ).toBe(1);
    expect(
      await asOrganization(pg, ORG_A, (tx) => count(tx, "access_plan_entity")),
    ).toBe(2);
    expect(
      await asOrganization(pg, ORG_A, (tx) => count(tx, "membership_policy")),
    ).toBe(1);
    expect(
      await asOrganization(pg, ORG_A, (tx) => count(tx, "access_plan_price")),
    ).toBe(1);
  });

  it("a foreign organization reads zero of everything", async () => {
    for (const table of [
      "access_plan",
      "access_plan_entity",
      "access_assignment",
      "access_plan_price",
      "membership_policy",
    ]) {
      expect([
        table,
        await asOrganization(pg, "org_nobody", (tx) => count(tx, table)),
      ]).toEqual([table, 0]);
    }
  });

  it("cannot reach the other gym's plan even by naming it", async () => {
    expect(
      await asOrganization(pg, ORG_A, (tx) =>
        count(tx, "access_plan", `WHERE id = '${PLAN_B}'`),
      ),
    ).toBe(0);
  });

  it("cannot write a plan into another organization", async () => {
    await expect(
      asOrganization(pg, ORG_A, (tx) =>
        tx.query(
          `INSERT INTO "access_plan" (organization_id, name)
             VALUES ('${ORG_B}', 'Sneaky')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot move an assignment to another organization", async () => {
    await expect(
      asOrganization(pg, ORG_A, (tx) =>
        tx.query(`UPDATE "access_assignment" SET organization_id = '${ORG_B}'`),
      ),
    ).rejects.toThrow(/row-level security|foreign key/i);
  });

  it("reads nothing at all when the scope is unset", async () => {
    const n = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return count(tx, "access_assignment");
    });
    expect(n).toBe(0);
  });

  it("keeps a shared assignment reachable from either branch of the gym", async () => {
    // Both branches sit in one organization, so the entity a request names does
    // not change what the policy admits. That is what makes one membership
    // covering a mat and a gym a single row.
    const seen = await asOrganization(pg, ORG_A, async (tx) => {
      await tx.query("SELECT set_config('app.academy_id', $1, true)", [GYM_A]);
      return count(tx, "access_assignment");
    });
    expect(seen).toBe(2);
  });

  it("leaves one member's assignment visible to another, which the reader must filter", async () => {
    // NOT a leak between gyms: Alex and Bea share an organization, so the policy
    // has nothing to tell them apart by. The router filters by user id, and this
    // records why that filter is load-bearing rather than belt-and-braces.
    const all = await asOrganization(pg, ORG_A, (tx) =>
      count(tx, "access_assignment"),
    );
    expect(all).toBe(2);

    const mine = await asOrganization(pg, ORG_A, (tx) =>
      count(tx, "access_assignment", `WHERE person_id = '${ALEX_PERSON}'`),
    );
    expect(mine).toBe(1);
  });
});
