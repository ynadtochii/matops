import type { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  APP_ROLE,
  ENTITY_GUC,
  ORGANIZATION_GUC,
  withScope,
} from "../src/tenant";
import { execOn, freshDb, single } from "./helpers";

type ScopeRow = Record<string, unknown> & {
  role: string;
  organization: string | null;
  entity: string | null;
};

const READ_SCOPE = sql`SELECT current_user AS role,
  current_setting(${ORGANIZATION_GUC}, true) AS organization,
  current_setting(${ENTITY_GUC}, true) AS entity`;

describe("withScope", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
  });

  afterAll(async () => {
    await pg.close();
  });

  it("sets the restricted role and both GUCs inside the transaction", async () => {
    const inside = await withScope(
      { organizationId: "org-1", entityId: "entity-1" },
      async (tx) => single(await tx.execute<ScopeRow>(READ_SCOPE)),
      execOn(pg),
    );

    expect(inside.role).toBe(APP_ROLE);
    expect(inside.organization).toBe("org-1");
    expect(inside.entity).toBe("entity-1");
  });

  it("leaves the entity GUC unset when the scope names no entity", async () => {
    const inside = await withScope(
      { organizationId: "org-1" },
      async (tx) => single(await tx.execute<ScopeRow>(READ_SCOPE)),
      execOn(pg),
    );

    expect(inside.organization).toBe("org-1");
    expect(inside.entity).toBeFalsy();
  });

  it("resets everything at COMMIT so a reused pooled connection cannot inherit it", async () => {
    await withScope(
      { organizationId: "org-1", entityId: "entity-1" },
      () => Promise.resolve(undefined),
      execOn(pg),
    );

    const after = single(await execOn(pg).execute<ScopeRow>(READ_SCOPE));

    expect(after.role).not.toBe(APP_ROLE);
    expect(after.organization).toBeFalsy();
    expect(after.entity).toBeFalsy();
  });

  it("refuses an empty organization id", async () => {
    await expect(
      withScope(
        { organizationId: "" },
        () => Promise.resolve(undefined),
        execOn(pg),
      ),
    ).rejects.toThrow(/organizationId is required/);
  });

  it("refuses an empty entity id rather than silently widening the scope", async () => {
    await expect(
      withScope(
        { organizationId: "org-1", entityId: "" },
        () => Promise.resolve(undefined),
        execOn(pg),
      ),
    ).rejects.toThrow(/entityId cannot be empty/);
  });
});
