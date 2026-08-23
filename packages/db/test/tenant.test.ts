import type { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { APP_ROLE, TENANT_GUC, withTenant } from "../src/tenant";
import { execOn, freshDb, single } from "./helpers";

describe("withTenant", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
  });

  afterAll(async () => {
    await pg.close();
  });

  it("sets the restricted role and the academy GUC inside the transaction", async () => {
    const inside = await withTenant(
      "academy-1",
      async (tx) =>
        single(
          await tx.execute<{ role: string; academy: string }>(
            sql`SELECT current_user AS role, current_setting(${TENANT_GUC}) AS academy`,
          ),
        ),
      execOn(pg),
    );

    expect(inside.role).toBe(APP_ROLE);
    expect(inside.academy).toBe("academy-1");
  });

  it("resets both at COMMIT so a reused pooled connection cannot inherit them", async () => {
    await withTenant("academy-1", () => Promise.resolve(undefined), execOn(pg));

    const after = single(
      await execOn(pg).execute<{ role: string; academy: string }>(
        sql`SELECT current_user AS role, current_setting(${TENANT_GUC}, true) AS academy`,
      ),
    );

    expect(after.role).not.toBe(APP_ROLE);
    expect(after.academy).toBeFalsy();
  });

  it("refuses an empty academy id", async () => {
    await expect(
      withTenant("", () => Promise.resolve(undefined), execOn(pg)),
    ).rejects.toThrow(/academyId is required/);
  });
});
