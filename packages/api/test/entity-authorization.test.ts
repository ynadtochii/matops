import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, createEntity, eq, provisionOrganization } from "@matops/db";
import { entityMembership, organization } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, personId, rejectionCode, seedAcademies } from "./helpers";

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
        members: [
          { userId: OUTSIDER, role: "owner", status: "active" },
          { userId: OWNER, role: "student", status: "active" },
        ],
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

  it("refuses to rename an entity of another organization", async () => {
    expect(
      await rejectionCode(
        h
          .as(OWNER, ORG_A, withEntity(foreignEntity))
          .academy.rename({ name: "Not mine" }),
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

  it("gives two tabs of one session two different academies", async () => {
    const here = await h.as(OWNER, ORG_A, withEntity(ORG_A)).academy.current();
    const there = await h
      .as(OWNER, ORG_A, withEntity(secondEntity))
      .academy.current();
    expect([here?.academyId, there?.academyId]).toEqual([ORG_A, secondEntity]);
    expect(here?.name).not.toBe(there?.name);
  });

  it("has no academy when the request names none", async () => {
    expect(
      await h.as(OWNER, ORG_A, new Headers()).academy.current(),
    ).toBeNull();
  });

  it("has no academy for a header naming one the caller cannot open", async () => {
    expect(
      await h.as(COACH, ORG_A, withEntity(secondEntity)).academy.current(),
    ).toBeNull();
  });

  it("has no academy when the active organization does not own it", async () => {
    expect(
      await h.as(OWNER, ORG_B, withEntity(ORG_A)).academy.current(),
    ).toBeNull();
  });

  it("refuses a suspended membership", async () => {
    expect(
      await rejectionCode(
        h.as(SUSPENDED, ORG_A, withEntity(ORG_A)).entity.current(),
      ),
    ).toBe("FORBIDDEN");
  });

  it("hides every inactive membership from academy.current", async () => {
    try {
      for (const status of ["suspended", "archived", "removed"]) {
        await h.exec
          .update(entityMembership)
          .set({ status })
          .where(
            and(
              eq(entityMembership.entityId, ORG_A),
              eq(entityMembership.userId, SUSPENDED),
            ),
          );
        expect(
          await h.as(SUSPENDED, ORG_A, withEntity(ORG_A)).academy.current(),
        ).toBeNull();
      }
    } finally {
      await h.exec
        .update(entityMembership)
        .set({ status: "suspended" })
        .where(
          and(
            eq(entityMembership.entityId, ORG_A),
            eq(entityMembership.userId, SUSPENDED),
          ),
        );
    }
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

  it("lets the organization owner in at a mat that suspended them", async () => {
    await h.exec
      .update(entityMembership)
      .set({ status: "suspended" })
      .where(
        and(
          eq(entityMembership.entityId, ORG_A),
          eq(entityMembership.userId, OWNER),
        ),
      );
    try {
      const current = await h
        .as(OWNER, ORG_A, withEntity(ORG_A))
        .entity.current();
      expect([current.role, current.status]).toEqual(["owner", "active"]);
    } finally {
      await h.exec
        .update(entityMembership)
        .set({ status: "active" })
        .where(
          and(
            eq(entityMembership.entityId, ORG_A),
            eq(entityMembership.userId, OWNER),
          ),
        );
    }
  });

  it("answers academy.current for an owner with no membership at that mat", async () => {
    const current = await h
      .as(OWNER, ORG_A, withEntity(secondEntity))
      .academy.current();
    expect([current?.academyId, current?.role]).toEqual([
      secondEntity,
      "owner",
    ]);
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
    const ids = (await h.as(OWNER, ORG_A).entity.list()).entities.map(
      (e) => e.id,
    );
    expect(ids.sort()).toEqual([ORG_A, secondEntity].sort());
  });

  it("gives a coach only the entities they belong to", async () => {
    const ids = (await h.as(COACH, ORG_A).entity.list()).entities.map(
      (e) => e.id,
    );
    expect(ids).toEqual([ORG_A]);
  });

  it("never shows another organization's entity", async () => {
    const ids = (await h.as(OUTSIDER, ORG_B).entity.list()).entities.map(
      (e) => e.id,
    );
    expect(ids).toEqual([ORG_B]);
  });

  it("stops offering a coach a mat they were removed from", async () => {
    await h.exec
      .update(entityMembership)
      .set({ status: "removed" })
      .where(
        and(
          eq(entityMembership.entityId, ORG_A),
          eq(entityMembership.userId, COACH),
        ),
      );
    const ids = (await h.as(COACH, ORG_A).entity.list()).entities.map(
      (e) => e.id,
    );
    expect(ids).toEqual([]);
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

describe("the BJJ-only tiers", () => {
  let h: Harness;
  let gym: string;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG_A,
        code: "100001",
        members: [{ userId: OWNER, role: "owner", status: "active" }],
      },
    ]);
    await provisionOrganization(
      { organizationId: ORG_A, ownerUserId: OWNER },
      h.exec,
    );
    const made = await createEntity(
      {
        organizationId: ORG_A,
        type: "general_space",
        name: "The Gym",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    gym = made.entityId;
  });

  afterAll(() => h.close());

  it("refuses belts at a general space", async () => {
    expect(
      await rejectionCode(h.as(OWNER, ORG_A, withEntity(gym)).rank.mine()),
    ).toBe("FORBIDDEN");
  });

  it("refuses the curriculum at a general space", async () => {
    expect(
      await rejectionCode(
        h.as(OWNER, ORG_A, withEntity(gym)).curriculum.board(),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        h.as(OWNER, ORG_A, withEntity(gym)).curriculum.createTrack({
          name: "Fundamentals",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("refuses on the entity the header names, not the one the session holds", async () => {
    await expect(
      h.as(OWNER, ORG_A, withEntity(ORG_A)).rank.mine(),
    ).resolves.toBeDefined();
  });

  it("still runs both at the BJJ academy", async () => {
    const board = await h
      .as(OWNER, ORG_A, withEntity(ORG_A))
      .curriculum.board();
    expect(board.tracks.length).toBeGreaterThan(0);
  });

  it("refuses optional modules until the gym turns them on", async () => {
    await h.exec
      .update(organization)
      .set({ curriculumEnabled: false, referralsEnabled: false })
      .where(eq(organization.id, ORG_A));
    try {
      const api = h.as(OWNER, ORG_A, withEntity(ORG_A));
      expect(await rejectionCode(api.curriculum.board())).toBe("FORBIDDEN");
      expect(await rejectionCode(api.referral.dashboard())).toBe("FORBIDDEN");
      await h.as(OWNER, ORG_A).organization.setModules({
        curriculumEnabled: true,
        referralsEnabled: true,
      });
      await expect(api.curriculum.board()).resolves.toBeDefined();
      await expect(api.referral.dashboard()).resolves.toBeDefined();
    } finally {
      await h.exec
        .update(organization)
        .set({ curriculumEnabled: true, referralsEnabled: true })
        .where(eq(organization.id, ORG_A));
    }
  });
});

describe("switching a branch onto memberships", () => {
  const BOSS = "u_switch_owner";
  const HAND = "u_switch_coach";
  const SAM = "u_switch_sam";
  const NOBODY = "u_switch_stranger";
  const ORG_S = "org_switch";
  const ORG_T = "org_switch_other";
  let h: Harness;
  let second: string;

  const owner = () => h.as(BOSS, ORG_S);

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG_S,
        code: "100011",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: HAND, role: "instructor", status: "active" },
          { userId: SAM, role: "student", status: "active" },
        ],
      },
      {
        id: ORG_T,
        code: "100012",
        members: [{ userId: NOBODY, role: "owner", status: "active" }],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG_S,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: BOSS,
      },
      h.exec,
    );
    second = made.entityId;
  });

  afterAll(() => h.close());

  it("refuses a coach and a student", async () => {
    for (const user of [HAND, SAM]) {
      expect([
        user,
        await rejectionCode(
          h.as(user, ORG_S).entity.setMembershipEnforced({
            entityId: ORG_S,
            enforced: true,
          }),
        ),
      ]).toEqual([user, "FORBIDDEN"]);
    }
  });

  it("refuses an entity of another organization", async () => {
    expect(
      await rejectionCode(
        owner().entity.activationPreview({ entityId: ORG_T }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        owner().entity.setMembershipEnforced({
          entityId: ORG_T,
          enforced: true,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("gives an entity that does not exist the same answer as a foreign one", async () => {
    expect(
      await rejectionCode(
        owner().entity.activationPreview({ entityId: "no_such_branch" }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("names the active members no membership covers", async () => {
    const preview = await owner().entity.activationPreview({
      entityId: ORG_S,
    });
    expect(preview.enforced).toBe(false);
    expect(preview.activeMembers).toBe(1);
    expect(preview.uncovered.map((m) => m.userId).sort()).toEqual([
      personId(ORG_S, SAM),
    ]);
  });

  it("counts nobody once a plan covers the branch", async () => {
    const plan = await owner().accessPlan.create({
      name: "Everything",
      entityIds: [ORG_S],
    });
    await owner().accessPlan.assign({ userId: SAM, planId: plan.id });
    const preview = await owner().entity.activationPreview({
      entityId: ORG_S,
    });
    expect(preview.uncovered).toEqual([]);
  });

  it("reads one branch at a time", async () => {
    const preview = await owner().entity.activationPreview({
      entityId: second,
    });
    expect([preview.entityId, preview.activeMembers]).toEqual([second, 0]);
  });

  it("keeps the first timestamp when switched on twice", async () => {
    await owner().entity.setMembershipEnforced({
      entityId: ORG_S,
      enforced: true,
    });
    const stamped = await h.pg.query<{ at: string }>(
      `SELECT membership_enforced_at AS at FROM "entity" WHERE id = '${ORG_S}'`,
    );
    await owner().entity.setMembershipEnforced({
      entityId: ORG_S,
      enforced: true,
    });
    const again = await h.pg.query<{ at: string }>(
      `SELECT membership_enforced_at AS at FROM "entity" WHERE id = '${ORG_S}'`,
    );
    expect(again.rows[0]?.at).toEqual(stamped.rows[0]?.at);
  });

  it("tells the branch screens which gate it runs on", async () => {
    expect((await owner().academy.current())?.membershipEnforced).toBe(true);
    const preview = await owner().entity.activationPreview({
      entityId: ORG_S,
    });
    expect(preview.enforced).toBe(true);
  });

  it("stops payment enforcement when switched off", async () => {
    const off = await owner().entity.setMembershipEnforced({
      entityId: ORG_S,
      enforced: false,
    });
    expect(off.enforced).toBe(false);
    expect((await owner().academy.current())?.membershipEnforced).toBe(false);
  });
});
