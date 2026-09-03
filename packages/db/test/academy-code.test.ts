import { describe, expect, it } from "vitest";

import { freshDb } from "./helpers";

describe("the entity's public_code", () => {
  const insertEntity = (id: string, slug: string, code: string | null) =>
    `INSERT INTO "organization" (id, name, slug, created_at)
       VALUES ('org_${id}', '${id}', 'org-${slug}', now());
     INSERT INTO "entity" (id, organization_id, type, name, slug, public_code)
       VALUES ('${id}', 'org_${id}', 'bjj_academy', '${id}', '${slug}', ${
         code === null ? "NULL" : `'${code}'`
       })`;

  it("accepts a code, then rejects a duplicate", async () => {
    const pg = await freshDb([]);
    await pg.exec(insertEntity("acad_a", "a", "482913"));

    await expect(
      pg.exec(insertEntity("acad_b", "b", "482913")),
    ).rejects.toThrow(/unique|duplicate/i);

    await pg.close();
  });

  it("rejects a missing code (NOT NULL)", async () => {
    const pg = await freshDb([]);
    await expect(pg.exec(insertEntity("acad_c", "c", null))).rejects.toThrow(
      /null|not-null/i,
    );
    await pg.close();
  });
});
