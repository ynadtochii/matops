import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, createEntity, eq, provisionOrganization } from "@matops/db";
import { entityMembership } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const OWNER = "u_owner";
const COACH = "u_coach";
const PENDING = "u_pending";
const SUSPENDED = "u_suspended";
const OUTSIDER = "u_outsider";

function withEntity(id: string): Headers {
  const headers = new Headers();
  headers.set("x-matops-entity", id);
  return headers;
}

describe("the entity tiers", () => {
  let h: Harness;
  let pg: PGlite;
  let secondEntity: string;
  let foreignEntity: string;

  beforeAll(async () => {
    h = await harness();
    pg = h.pg;
    await seedAcademies(pg, [
      {
        id: ORG_A,
        code: "100001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: PENDING, role: "member", status: "pending" },
          { userId: SUSPENDED, role: "student", status: "active" },
        ],
      },
      {
        id: ORG_B,
        code: "100002",
        members: [{ userId: OUTSIDER, role: "owner", status: "active" }],
      },
    ]);

    await provisionOrganization(
      { organizationId: ORG_A, ownerUserId: OWNER },
      h.exec,
    );
    await provisionOrganization(
      { organizationId: ORG_B, ownerUserId: OUTSIDER },
      h.exec,
    );
    foreignEntity = ORG_B;

    const second = await createEntity(
      {
        organizationId: ORG_A,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    secondEntity = second.entityId;

    // The fixture already mirrors every member onto the default entity. Only the
    // suspended case differs from the organization row: live in the
    // organization, suspended at this mat.
    await h.exec
      .update(entityMembership)
      .set({ status: "suspended" })
      .where(
        and(
          eq(entityMembership.entityId, ORG_A),
          eq(entityMembership.userId, SUSPENDED),
        ),
      );
  });

  afterAll(() => h.close());

  it("refuses a request that names no entity", async () => {
    expect(
      await rejectionCode(h.as(COACH, ORG_A, new Headers()).entity.current()),
    ).toBe("BAD_REQUEST");
  });

  it("refuses an entity of another organization", async () => {
    expect(
      await rejectionCode(
        h.as(OWNER, ORG_A, withEntity(foreignEntity)).entity.current(),
      ),
    ).toBe("FORBIDDEN");
  });

  it("gives an entity that does not exist the same answer as a foreign one", async () => {
    expect(
      await rejectionCode(
        h.as(OWNER, ORG_A, withEntity("no-such-entity")).entity.current(),
      ),
    ).toBe("FORBIDDEN");
  });

  it("lets a coach into the entity they belong to", async () => {
    const current = await h
      .as(COACH, ORG_A, withEntity(ORG_A))
      .entity.current();
    expect([current.id, current.role]).toEqual([ORG_A, "instructor"]);
  });

  it("refuses that same coach on a sibling entity of the same organization", async () => {
    expect(
      await rejectionCode(
        h.as(COACH, ORG_A, withEntity(secondEntity)).entity.current(),
      ),
    ).toBe("FORBIDDEN");
  });

  it("lets the organization owner into an entity they have no membership in", async () => {
    const current = await h
      .as(OWNER, ORG_A, withEntity(secondEntity))
      .entity.current();
    expect([current.id, current.role]).toEqual([secondEntity, "owner"]);
  });

  it("refuses a suspended membership", async () => {
    expect(
      await rejectionCode(
        h.as(SUSPENDED, ORG_A, withEntity(ORG_A)).entity.current(),
      ),
    ).toBe("FORBIDDEN");
  });

  it("admits a pending membership to the enrolled tier, as the academy tiers do", async () => {
    const current = await h
      .as(PENDING, ORG_A, withEntity(ORG_A))
      .entity.current();
    expect(current.status).toBe("pending");
  });

  it("refuses someone with no organization membership at all", async () => {
    expect(
      await rejectionCode(
        h.as(OUTSIDER, ORG_A, withEntity(ORG_A)).entity.current(),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("listing the entities a caller may open", () => {
  let h: Harness;
  let secondEntity: string;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG_A,
        code: "100001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
        ],
      },
      {
        id: ORG_B,
        code: "100002",
        members: [{ userId: OUTSIDER, role: "owner", status: "active" }],
      },
    ]);
    await provisionOrganization(
      { organizationId: ORG_A, ownerUserId: OWNER },
      h.exec,
    );
    await provisionOrganization(
      { organizationId: ORG_B, ownerUserId: OUTSIDER },
      h.exec,
    );
    const second = await createEntity(
      {
        organizationId: ORG_A,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    secondEntity = second.entityId;
  });

  afterAll(() => h.close());

  it("gives the owner every entity of their organization and no other", async () => {
    const ids = (await h.as(OWNER, ORG_A).entity.list()).map((e) => e.id);
    expect(ids.sort()).toEqual([ORG_A, secondEntity].sort());
  });

  it("gives a coach only the entities they belong to", async () => {
    const ids = (await h.as(COACH, ORG_A).entity.list()).map((e) => e.id);
    expect(ids).toEqual([ORG_A]);
  });

  it("never shows another organization's entity", async () => {
    const ids = (await h.as(OUTSIDER, ORG_B).entity.list()).map((e) => e.id);
    expect(ids).toEqual([ORG_B]);
  });
});

describe("adding an entity", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG_A,
        code: "100001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
        ],
      },
    ]);
    await provisionOrganization(
      { organizationId: ORG_A, ownerUserId: OWNER },
      h.exec,
    );
  });

  afterAll(() => h.close());

  it("refuses a coach", async () => {
    expect(
      await rejectionCode(
        h.as(COACH, ORG_A).entity.create({
          name: "Second Mat",
          type: "bjj_academy",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses a type nobody implemented", async () => {
    expect(
      await rejectionCode(
        h.as(OWNER, ORG_A).entity.create({
          name: "Sauna",
          type: "sauna" as "bjj_academy",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("gives the owner a second academy with its own rows", async () => {
    const made = await h
      .as(OWNER, ORG_A)
      .entity.create({ name: "Second Mat", type: "bjj_academy" });

    expect(made.entityId).not.toBe(ORG_A);
    expect(made.created.sort()).toEqual([
      "academy_profile",
      "curriculum_track",
      "entity",
      "entity_membership",
    ]);

    const current = await h
      .as(OWNER, ORG_A, withEntity(made.entityId))
      .entity.current();
    expect(current.name).toBe("Second Mat");
  });

  it("leaves the first academy alone", async () => {
    const before = await h.as(OWNER, ORG_A, withEntity(ORG_A)).entity.current();
    await h
      .as(OWNER, ORG_A)
      .entity.create({ name: "Third Mat", type: "bjj_academy" });
    const after = await h.as(OWNER, ORG_A, withEntity(ORG_A)).entity.current();
    expect(after).toEqual(before);
  });
});
