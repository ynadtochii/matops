import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

const NO_RLS_BY_DESIGN: Record<string, string> = {
  academy_invite:
    "The public join screen resolves a token with no active academy, so a policy on app.academy_id would match nothing (docs/issues/28). Migration 0020 revokes every matops_app grant on the table instead, which is stricter than a policy.",
};

interface TenantTable {
  table_name: string;
  rls: boolean;
  policies: number;
}

describe("every tenant-scoped table is covered by RLS", () => {
  let pg: PGlite;
  let tables: TenantTable[];

  beforeAll(async () => {
    pg = await freshDb();
    const res = await pg.query<TenantTable>(`
      SELECT c.relname AS table_name,
             c.relrowsecurity AS rls,
             (SELECT count(*)::int FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a
        ON a.attrelid = c.oid AND a.attname = 'academy_id' AND a.attnum > 0
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `);
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
