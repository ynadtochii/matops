import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode } from "./helpers";

const ORG = "org_alma";
const OWNER = "u_owner";
const STUDENT = "u_student";
const STRANGER = "u_stranger";

describe("a session that names no gym", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness([
      {
        id: ORG,
        code: "100001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  it("cannot reach the organization tier, which is why a gate exists", async () => {
    expect(await rejectionCode(h.as(OWNER, null).entity.list())).toBe(
      "FORBIDDEN",
    );
  });

  it("still lists the gyms the person belongs to", async () => {
    const mine = await h.as(OWNER, null).academy.memberships();
    expect(mine.map((m) => m.academyId)).toEqual([ORG]);
  });

  it("names the organization the gate has to activate", async () => {
    const [mine] = await h.as(STUDENT, null).academy.memberships();
    expect(mine?.organizationId).toBe(ORG);
  });

  it("opens the gym the gate picked", async () => {
    await h.as(OWNER, null).academy.setActive({ academyId: ORG });
    expect(h.activeOrgOf(OWNER)).toBe(ORG);
  });

  it("offers a stranger nothing to open", async () => {
    expect(await h.as(STRANGER, null).academy.memberships()).toEqual([]);
  });

  it("refuses a gym the caller does not belong to", async () => {
    expect(
      await rejectionCode(
        h.as(STRANGER, null).academy.setActive({ academyId: ORG }),
      ),
    ).toBe("NOT_FOUND");
  });
});
