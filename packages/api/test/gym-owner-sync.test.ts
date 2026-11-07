import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, memberId } from "./helpers";

const GYM = "org_owner_sync";
const OWNER = "u_sync_owner";
const COACH = "u_sync_coach";

function withEntity(id: string): Headers {
  const headers = new Headers();
  headers.set("x-matops-entity", id);
  return headers;
}

describe("gym owner follows academy ownership", () => {
  let h: Harness;

  const at = (user: string) => h.as(user, GYM, withEntity(GYM));
  const gymRole = async (user: string) => {
    const rows = await h.pg.query<{ role: string }>(
      `SELECT role FROM "member" WHERE user_id = $1 AND organization_id = $2`,
      [user, GYM],
    );
    return rows.rows[0]?.role;
  };
  const target = { memberId: memberId(GYM, COACH) };

  beforeAll(async () => {
    h = await harness([
      {
        id: GYM,
        code: "700290",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  it("makes a promoted co-owner an owner of the gym", async () => {
    expect((await at(COACH).entity.list()).canRunOrganization).toBe(false);

    await at(OWNER).membership.promote(target);

    expect(await gymRole(COACH)).toBe("owner");
    expect((await at(COACH).entity.list()).canRunOrganization).toBe(true);
  });

  it("takes the gym role away when the co-owner is suspended", async () => {
    await at(OWNER).membership.suspend(target);

    expect(await gymRole(COACH)).toBe("member");
  });

  it("gives the gym role back on restore", async () => {
    await at(OWNER).membership.restore(target);

    expect(await gymRole(COACH)).toBe("owner");
  });

  it("takes the gym role away when the co-owner is archived", async () => {
    await at(OWNER).membership.archive(target);

    expect(await gymRole(COACH)).toBe("member");
  });

  it("keeps the gym owner who is still an academy owner", async () => {
    expect(await gymRole(OWNER)).toBe("owner");
  });
});
