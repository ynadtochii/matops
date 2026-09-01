import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb } from "./helpers";

const NOT_MEMBER_DATA: Record<string, string> = {
  class:
    "The gym's own schedule. A class outlives the members who attended it; erasing a member removes their participation rows, not the class.",
  class_template: "The gym's own recurring schedule, not member data.",
  membership_plan: "The gym's price list, not member data.",
  payment_settings: "The gym's bank details, not member data.",
  drop_in:
    "A lead is not a member. It carries no member_id and is erased with the academy, not with a member (spec O4).",
  drop_in_visit:
    "A visitor's class, which belongs to a lead and not to a member. Erased with the academy, like the lead itself (ADR 115).",
  curriculum_track:
    "One of the gym's teaching plans. It outlives every member who trained under it (ADR 111).",
  curriculum_block_template:
    "The gym's reusable block library. A theme belongs to the syllabus, not to a person (ADR 105).",
  curriculum_block:
    "One stretch of weeks on the gym's plan. It names a theme and its dates, never a member (ADR 104).",
  academy_invite:
    "A shareable link belongs to the academy and to the role, not to whoever used it.",
  tenant_probe:
    "The seed:health probe row. Not member data and not reachable by a member.",
};

const ERASE_SOURCE = fileURLToPath(new URL("../src/erase.ts", import.meta.url));

describe("eraseMemberData names every table that holds member data", () => {
  let pg: PGlite;
  let tenantTables: string[];
  let source: string;

  beforeAll(async () => {
    pg = await freshDb();
    const res = await pg.query<{ table_name: string }>(`
      SELECT DISTINCT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attname = 'academy_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY 1
    `);
    tenantTables = res.rows.map((r) => r.table_name);
    source = await readFile(ERASE_SOURCE, "utf8");
  });

  afterAll(() => pg.close());

  it("finds the academy-scoped tables to check against", () => {
    expect(tenantTables.length).toBeGreaterThan(5);
  });

  it("either deletes from each one or says in writing why not", () => {
    const missing = tenantTables.filter((table) => {
      if (table in NOT_MEMBER_DATA) return false;
      const camel = table.replace(/_([a-z])/g, (_, c: string) =>
        c.toUpperCase(),
      );
      return !new RegExp(`\\.delete\\(${camel}\\)`).test(source);
    });
    expect(missing).toEqual([]);
  });

  it("keeps every written exemption pointing at a table that exists", () => {
    const stale = Object.keys(NOT_MEMBER_DATA).filter(
      (t) => !tenantTables.includes(t),
    );
    expect(stale).toEqual([]);
  });
});
