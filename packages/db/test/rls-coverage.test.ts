import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

const NO_RLS_BY_DESIGN: Record<string, string> = {
  academy_invite:
    "The public join screen resolves a token with no active academy, so a policy on app.academy_id would match nothing (docs/issues/28). Migration 0020 revokes every matops_app grant on the table instead, which is stricter than a policy.",
  drop_in_link:
    "The public drop-in form resolves a token before any academy scope is known, so a policy on app.academy_id would match nothing. The migration revokes every matops_app grant on the table instead (ADR 147).",
  stripe_hook:
    "A Stripe webhook resolves its token before any gym is known, so a policy on app.organization_id would match nothing. The migration revokes every matops_app grant on the table instead (ADR 157).",
  desk_link:
    "The desk tablet resolves its token before any academy scope is known, so a policy on app.academy_id would match nothing. The migration revokes every matops_app grant on the table instead (ADR 150).",
};

const NO_ENTITY_KEY_BY_DESIGN = ["tenant_probe"];

const SCOPE_GUC: Record<string, string> = {
  entity: "app.organization_id",
  entity_membership: "app.organization_id",
  person: "app.organization_id",
  academy_profile: "app.academy_id",
  // One membership can cover a mat and a gym at once, so the four access tables
  // belong to the organization and none of them carries an academy_id (ADR 126).
  access_plan: "app.organization_id",
  access_plan_entity: "app.organization_id",
  access_assignment: "app.organization_id",
  membership_policy: "app.organization_id",
  membership_month: "app.organization_id",
  membership_month_audit: "app.organization_id",
  card_payment: "app.organization_id",
  payment_method: "app.organization_id",
  access_plan_method_off: "app.organization_id",
};

const ENTITY_GUC = "app.academy_id";

interface TenantTable {
  table_name: string;
  rls: boolean;
  policies: number;
  quals: string;
}

describe("every tenant-scoped table is covered by RLS", () => {
  let pg: PGlite;
  let tables: TenantTable[];

  beforeAll(async () => {
    pg = await freshDb();
    const res = await pg.query<TenantTable>(
      `
      SELECT c.relname AS table_name,
             c.relrowsecurity AS rls,
             (SELECT count(*)::int FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
             coalesce((SELECT string_agg(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''), ' ')
               FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.relname), '') AS quals
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND (c.relname = ANY($1)
             OR EXISTS (SELECT 1 FROM pg_attribute a
                         WHERE a.attrelid = c.oid AND a.attname = 'academy_id'
                           AND a.attnum > 0 AND NOT a.attisdropped))
      ORDER BY c.relname
    `,
      [[...Object.keys(SCOPE_GUC), ...Object.keys(NO_RLS_BY_DESIGN)]],
    );
    tables = res.rows;
  });

  afterAll(async () => {
    await pg.close();
  });

  it("finds the tenant tables at all", () => {
    expect(tables.length).toBeGreaterThan(10);
  });

  it("enables row level security on each one", () => {
    const missing = tables
      .filter((t) => !(t.table_name in NO_RLS_BY_DESIGN))
      .filter((t) => !t.rls)
      .map((t) => t.table_name);
    expect(missing).toEqual([]);
  });

  it("gives each one at least one policy", () => {
    const missing = tables
      .filter((t) => !(t.table_name in NO_RLS_BY_DESIGN))
      .filter((t) => t.policies === 0)
      .map((t) => t.table_name);
    expect(missing).toEqual([]);
  });

  it("keeps the exception list honest", () => {
    const stale = tables
      .filter((t) => t.table_name in NO_RLS_BY_DESIGN)
      .filter((t) => t.rls || t.policies > 0)
      .map((t) => t.table_name);
    expect(stale).toEqual([]);

    const unknown = Object.keys(NO_RLS_BY_DESIGN).filter(
      (name) => !tables.some((t) => t.table_name === name),
    );
    expect(unknown).toEqual([]);
  });

  it("finds the organization/entity foundation tables too", () => {
    const found = tables.map((t) => t.table_name);
    for (const name of Object.keys(SCOPE_GUC)) expect(found).toContain(name);
  });

  it("reads the GUC each table's scope says it should", () => {
    const wrong = tables
      .filter((t) => !(t.table_name in NO_RLS_BY_DESIGN))
      .filter((t) => !t.quals.includes(SCOPE_GUC[t.table_name] ?? ENTITY_GUC))
      .map((t) => t.table_name);
    expect(wrong).toEqual([]);
  });

  it("never lets an entity-scoped table match on the organization alone", () => {
    const leaky = tables
      .filter((t) => !(t.table_name in NO_RLS_BY_DESIGN))
      .filter((t) => (SCOPE_GUC[t.table_name] ?? ENTITY_GUC) === ENTITY_GUC)
      .filter((t) => t.quals.includes("app.organization_id"))
      .map((t) => t.table_name);
    expect(leaky).toEqual([]);
  });

  it("points every academy_id at an entity", async () => {
    const res = await pg.query<{ table_name: string }>(`
      SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = c.oid AND a.attname = 'academy_id'
                        AND a.attnum > 0 AND NOT a.attisdropped)
         AND NOT EXISTS (SELECT 1 FROM pg_constraint k
                          WHERE k.conrelid = c.oid AND k.contype = 'f'
                            AND k.confrelid = 'entity'::regclass
                            AND pg_get_constraintdef(k.oid) ILIKE '%(academy_id)%')
       ORDER BY 1
    `);
    expect(res.rows.map((r) => r.table_name)).toEqual(NO_ENTITY_KEY_BY_DESIGN);
  });

  it("carries the organization match on the one row that joins two parents", async () => {
    const res = await pg.query<{ def: string }>(`
      SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conname = 'entity_membership_entity_same_org'
    `);
    expect(single(res).def).toContain(
      "FOREIGN KEY (organization_id, entity_id) REFERENCES entity(organization_id, id)",
    );
  });

  it("denies the app role every privilege on an exception table", async () => {
    for (const name of Object.keys(NO_RLS_BY_DESIGN)) {
      const res = await pg.query<{ granted: boolean }>(
        `SELECT bool_or(has_table_privilege('matops_app', $1, priv)) AS granted
           FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS priv`,
        [name],
      );
      expect([name, single(res).granted]).toEqual([name, false]);
    }
  });
});
