import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

describe("person schema", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
  });

  afterAll(async () => {
    await pg.close();
  });

  it("keeps the person profile independent from an account", async () => {
    const result = await pg.query<{
      column_name: string;
      is_nullable: string;
    }>(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'person'
    `);
    const columns = new Map(
      result.rows.map((row) => [row.column_name, row.is_nullable]),
    );
    expect(columns.get("name")).toBe("NO");
    expect(columns.get("email")).toBe("YES");
    expect(columns.get("phone")).toBe("YES");
    expect(columns.get("account_user_id")).toBe("YES");
  });

  it("adds nullable person subjects without removing account subjects", async () => {
    const result = await pg.query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
    }>(`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'entity_membership' AND column_name IN ('user_id', 'person_id'))
          OR (table_name = 'access_assignment' AND column_name IN ('user_id', 'person_id'))
          OR (table_name = 'access_assignment_change' AND column_name IN ('user_id', 'person_id'))
          OR (table_name = 'membership_purchase' AND column_name IN ('user_id', 'person_id'))
          OR (table_name = 'class_participation' AND column_name IN ('student_id', 'person_organization_id', 'person_id'))
        )
    `);
    const columns = new Map(
      result.rows.map((row) => [
        `${row.table_name}.${row.column_name}`,
        row.is_nullable,
      ]),
    );
    expect(Object.fromEntries(columns)).toEqual({
      "access_assignment.person_id": "YES",
      "access_assignment.user_id": "NO",
      "access_assignment_change.person_id": "YES",
      "access_assignment_change.user_id": "NO",
      "class_participation.person_id": "YES",
      "class_participation.person_organization_id": "YES",
      "class_participation.student_id": "NO",
      "entity_membership.person_id": "YES",
      "entity_membership.user_id": "YES",
      "membership_purchase.person_id": "YES",
      "membership_purchase.user_id": "NO",
    });
  });

  it("enforces organization matches on person subjects and guardians", async () => {
    const result = await pg.query<{ conname: string; definition: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname IN (
        'person_account_same_org',
        'person_guardian_student_same_org',
        'person_guardian_account_same_org',
        'entity_membership_person_same_org',
        'access_assignment_person_same_org',
        'access_assignment_change_person_same_org',
        'membership_purchase_person_same_org',
        'class_participation_person_same_org'
      )
    `);
    expect(result.rows).toHaveLength(8);
    expect(
      result.rows.every((row) => row.definition.includes("FOREIGN KEY (")),
    ).toBe(true);
    expect(
      result.rows.every((row) => row.definition.includes("organization_id")),
    ).toBe(true);
  });

  it("requires both class participation person columns together", async () => {
    const result = await pg.query<{ definition: string }>(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'class_participation_person_complete'
    `);
    expect(single(result).definition).toContain(
      "((person_organization_id IS NULL) = (person_id IS NULL))",
    );
  });

  it("gives the app role access through organization policies", async () => {
    const result = await pg.query<{
      table_name: string;
      row_security: boolean;
      policy_count: number;
      can_read: boolean;
      can_write: boolean;
    }>(`
      SELECT c.relname AS table_name,
             c.relrowsecurity AS row_security,
             (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS policy_count,
             has_table_privilege('matops_app', c.relname, 'SELECT') AS can_read,
             has_table_privilege('matops_app', c.relname, 'INSERT,UPDATE,DELETE') AS can_write
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('person', 'person_guardian')
      ORDER BY c.relname
    `);
    expect(result.rows).toEqual([
      {
        table_name: "person",
        row_security: true,
        policy_count: 1,
        can_read: true,
        can_write: true,
      },
      {
        table_name: "person_guardian",
        row_security: true,
        policy_count: 1,
        can_read: true,
        can_write: true,
      },
    ]);
  });
});
