import { describe, expect, it } from "vitest";

import { freshDb } from "./helpers";

/**
 * Migration 0010 (docs/issues/32): `organization.public_code` is NOT NULL and
 * unique — two academies can never share the 6-digit code students type to join.
 */
describe("academy public_code (migration 0010)", () => {
  const insertOrg = (id: string, slug: string, code: string | null) =>
    `INSERT INTO "organization" (id, name, slug, created_at, public_code)
     VALUES ('${id}', '${id}', '${slug}', now(), ${
       code === null ? "NULL" : `'${code}'`
     })`;

  it("accepts a code, then rejects a duplicate", async () => {
    const pg = await freshDb();
    await pg.exec(insertOrg("acad_a", "a", "482913"));

    await expect(pg.exec(insertOrg("acad_b", "b", "482913"))).rejects.toThrow(
      /unique|duplicate/i,
    );

    await pg.close();
  });

  it("rejects a missing code (NOT NULL)", async () => {
    const pg = await freshDb();
    await expect(pg.exec(insertOrg("acad_c", "c", null))).rejects.toThrow(
      /null|not-null/i,
    );
    await pg.close();
  });
});
