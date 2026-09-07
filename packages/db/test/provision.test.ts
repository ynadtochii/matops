import type { PGlite } from "@electric-sql/pglite";
import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity, provisionOrganization } from "../src/provision";
import {
  academyProfile,
  classTemplate,
  curriculumTrack,
  entity,
  entityMembership,
} from "../src/schema";
import { execOn, freshDb } from "./helpers";

const ORG = "org_alma";
const OWNER = "u_owner";

async function seedOrganization(pg: PGlite, id: string) {
  await pg.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ('${OWNER}', 'Owner', '${id}@test.local', true, now(), now())
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO "organization" (id, name, slug, created_at)
      VALUES ('${id}', 'Alma', 'alma-${id}', now());
  `);
}

describe("provisioning an organization", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG);
  });

  afterAll(() => pg.close());

  it("makes all four rows on the first run", async () => {
    const result = await provisionOrganization(
      { organizationId: ORG, ownerUserId: OWNER },
      execOn(pg),
    );
    expect(result.created.sort()).toEqual([
      "academy_profile",
      "curriculum_track",
      "entity",
      "entity_membership",
    ]);
  });

  it("gives the default entity the organization's own id", async () => {
    const rows = await execOn(pg).select().from(entity);
    expect(rows).toHaveLength(1);
    expect([rows[0]?.id, rows[0]?.isDefault]).toEqual([ORG, true]);
  });

  it("mints it a six-digit code of its own", async () => {
    const rows = await execOn(pg).select().from(entity);
    expect(rows[0]?.publicCode).toMatch(/^\d{6}$/);
    expect(rows[0]?.type).toBe("bjj_academy");
  });

  it("makes the creator an active owner of it", async () => {
    const rows = await execOn(pg).select().from(entityMembership);
    expect(rows).toHaveLength(1);
    expect([rows[0]?.userId, rows[0]?.role, rows[0]?.status]).toEqual([
      OWNER,
      "owner",
      "active",
    ]);
  });

  it("creates nothing on a second run", async () => {
    const again = await provisionOrganization(
      { organizationId: ORG, ownerUserId: OWNER },
      execOn(pg),
    );
    expect(again.created).toEqual([]);
    expect(again.entityId).toBe(ORG);
  });

  it("leaves exactly one of each row after the retry", async () => {
    const exec = execOn(pg);
    expect(await exec.select().from(entity)).toHaveLength(1);
    expect(await exec.select().from(academyProfile)).toHaveLength(1);
    expect(await exec.select().from(entityMembership)).toHaveLength(1);
    expect(await exec.select().from(curriculumTrack)).toHaveLength(1);
  });

  it("refuses an organization that does not exist", async () => {
    await expect(
      provisionOrganization(
        { organizationId: "nope", ownerUserId: OWNER },
        execOn(pg),
      ),
    ).rejects.toThrow(/no live organization/);
  });
});

describe("repairing a half-provisioned organization", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG);
  });

  afterAll(() => pg.close());

  it("makes only the steps that are missing", async () => {
    const exec = execOn(pg);
    await exec.insert(entity).values({
      id: ORG,
      organizationId: ORG,
      type: "bjj_academy",
      name: "Alma",
      slug: "alma",
      isDefault: true,
      publicCode: "100001",
    });

    const result = await provisionOrganization(
      { organizationId: ORG, ownerUserId: OWNER },
      exec,
    );

    expect(result.created.sort()).toEqual([
      "academy_profile",
      "curriculum_track",
      "entity_membership",
    ]);
  });
});

describe("adding a second entity", () => {
  let pg: PGlite;
  let secondId: string;

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG);
    await provisionOrganization(
      { organizationId: ORG, ownerUserId: OWNER },
      execOn(pg),
    );
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    secondId = made.entityId;
  });

  afterAll(() => pg.close());

  it("gives it its own id, and never the organization's", () => {
    expect(secondId).not.toBe(ORG);
  });

  it("gives it its own public code", async () => {
    const rows = await execOn(pg).select().from(entity);
    const codes = rows.map((r) => r.publicCode);
    expect(new Set(codes).size).toBe(2);
  });

  it("does not make it the default", async () => {
    const rows = await execOn(pg).select().from(entity);
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it("gives it its own curriculum track and owner membership", async () => {
    const exec = execOn(pg);
    const tracks = await exec.select().from(curriculumTrack);
    const memberships = await exec.select().from(entityMembership);
    expect(tracks.map((t) => t.academyId).sort()).toEqual(
      [ORG, secondId].sort(),
    );
    expect(memberships.map((m) => m.entityId).sort()).toEqual(
      [ORG, secondId].sort(),
    );
  });
});

describe("adding a general space", () => {
  let pg: PGlite;
  let gymId: string;

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG);
    await provisionOrganization(
      { organizationId: ORG, ownerUserId: OWNER },
      execOn(pg),
    );
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "general_space",
        name: "The Gym",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    gymId = made.entityId;
  });

  afterAll(() => pg.close());

  it("makes only the entity and the owner membership", async () => {
    const again = await createEntity(
      {
        organizationId: ORG,
        type: "general_space",
        name: "The Sauna",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    expect(again.created.sort()).toEqual(["entity", "entity_membership"]);
  });

  it("gives it no academy profile", async () => {
    const rows = await execOn(pg).select().from(academyProfile);
    expect(rows.map((r) => r.entityId)).toEqual([ORG]);
  });

  it("gives it no curriculum track", async () => {
    const rows = await execOn(pg).select().from(curriculumTrack);
    expect(rows.map((r) => r.academyId)).toEqual([ORG]);
  });

  it("enforces shared memberships from the moment it opens", async () => {
    const rows = await execOn(pg).select().from(entity);
    const gymRow = rows.find((r) => r.id === gymId);
    const matRow = rows.find((r) => r.id === ORG);
    expect(gymRow?.membershipEnforcedAt).toBeInstanceOf(Date);
    expect(matRow?.membershipEnforcedAt).toBeNull();
  });

  it("still gives it its own code and an active owner", async () => {
    const exec = execOn(pg);
    const rows = await exec.select().from(entity);
    const gym = rows.find((r) => r.id === gymId);
    expect(gym?.publicCode).toMatch(/^\d{6}$/);
    expect(gym?.type).toBe("general_space");
    const memberships = await exec.select().from(entityMembership);
    expect(memberships.find((m) => m.entityId === gymId)?.status).toBe(
      "active",
    );
  });
});

describe("the first branch of a gym that has none", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG);
  });

  afterAll(() => pg.close());

  it("takes the organization's own id, so a printed link still resolves", async () => {
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Alma",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    expect(made.entityId).toBe(ORG);
  });

  it("runs on shared memberships from its first day", async () => {
    const rows = await execOn(pg).select().from(entity);
    expect(rows.find((r) => r.id === ORG)?.membershipEnforcedAt).toBeInstanceOf(
      Date,
    );
  });

  it("gets every row a mat needs, without provisionOrganization", async () => {
    const exec = execOn(pg);
    expect(
      (await exec.select().from(academyProfile)).map((r) => r.entityId),
    ).toEqual([ORG]);
    expect(
      (await exec.select().from(curriculumTrack)).map((r) => r.academyId),
    ).toEqual([ORG]);
    expect(
      (await exec.select().from(entityMembership)).map((r) => ({
        entityId: r.entityId,
        userId: r.userId,
        role: r.role,
        status: r.status,
      })),
    ).toEqual([
      { entityId: ORG, userId: OWNER, role: "owner", status: "active" },
    ]);
  });

  it("is the default branch, and the only one", async () => {
    const rows = await execOn(pg).select().from(entity);
    expect(rows.filter((r) => r.isDefault).map((r) => r.id)).toEqual([ORG]);
  });

  it("gives the branch after it a random id and no default flag", async () => {
    const second = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "South Mat",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    expect(second.entityId).not.toBe(ORG);
    const rows = await execOn(pg).select().from(entity);
    expect(rows.filter((r) => r.isDefault).map((r) => r.id)).toEqual([ORG]);
    expect(rows).toHaveLength(2);
  });
});

describe("the first branch when the organization id is already taken", () => {
  let pg: PGlite;
  const ORG_B = "org_beta";

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG_B);
    await createEntity(
      {
        organizationId: ORG_B,
        type: "bjj_academy",
        name: "Gone",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    // Soft delete leaves the row, and with it the organization's id.
    await pg.query(`UPDATE "entity" SET deleted_at = now() WHERE id = $1`, [
      ORG_B,
    ]);
  });

  afterAll(() => pg.close());

  it("takes a fresh id rather than colliding with the deleted branch", async () => {
    const made = await createEntity(
      {
        organizationId: ORG_B,
        type: "bjj_academy",
        name: "Again",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    expect(made.entityId).not.toBe(ORG_B);
    expect(made.created).toContain("entity");
  });

  it("is still the default, because no LIVE branch existed", async () => {
    const rows = await execOn(pg)
      .select()
      .from(entity)
      .where(isNull(entity.deletedAt));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isDefault).toBe(true);
  });
});

describe("a branch created with a chosen id", () => {
  let pg: PGlite;
  const ORG_C = "org_gamma";

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG_C);
  });

  afterAll(() => pg.close());

  it("keeps the id the caller passed, even as the first branch", async () => {
    const made = await createEntity(
      {
        organizationId: ORG_C,
        entityId: "seed_pilot_gym",
        type: "general_space",
        name: "Pilot Gym floor",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    expect(made.entityId).toBe("seed_pilot_gym");
  });
});

describe("a first branch that is a general space", () => {
  let pg: PGlite;
  const ORG_D = "org_delta";

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG_D);
  });

  afterAll(() => pg.close());

  it("makes the entity and the creator's membership, and nothing BJJ", async () => {
    const made = await createEntity(
      {
        organizationId: ORG_D,
        type: "general_space",
        name: "The Gym",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );

    expect(made.created.sort()).toEqual(["entity", "entity_membership"]);
    const exec = execOn(pg);
    expect(await exec.select().from(academyProfile)).toHaveLength(0);
    expect(await exec.select().from(curriculumTrack)).toHaveLength(0);
    expect(
      (await exec.select().from(entityMembership)).map((r) => r.role),
    ).toEqual(["owner"]);
  });

  it("is still the default branch of its gym", async () => {
    const rows = await execOn(pg).select().from(entity);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isDefault).toBe(true);
  });
});

describe("retrying the first branch", () => {
  let pg: PGlite;
  const ORG_E = "org_epsilon";

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG_E);
  });

  afterAll(() => pg.close());

  it("writes nothing at all when the transaction fails", async () => {
    const exec = execOn(pg);
    await expect(
      createEntity(
        {
          organizationId: ORG_E,
          type: "bjj_academy",
          name: "Alma",
          // No such user, so the foreign key refuses the membership AFTER the
          // entity and the academy profile have already been inserted. What
          // this asserts is that those two go back as well.
          ownerUserId: "u_ghost",
        },
        exec,
      ),
    ).rejects.toThrow();

    expect(await exec.select().from(entity)).toHaveLength(0);
    expect(await exec.select().from(entityMembership)).toHaveLength(0);
    expect(await exec.select().from(academyProfile)).toHaveLength(0);
  });

  it("still takes the organization id on the attempt after that", async () => {
    const made = await createEntity(
      {
        organizationId: ORG_E,
        type: "bjj_academy",
        name: "Alma",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    expect(made.entityId).toBe(ORG_E);
    expect(made.created).toContain("entity");
  });

  it("repairs the same branch rather than making a second one", async () => {
    const exec = execOn(pg);
    await exec.delete(entityMembership);

    const again = await createEntity(
      {
        organizationId: ORG_E,
        entityId: ORG_E,
        type: "bjj_academy",
        name: "Alma",
        ownerUserId: OWNER,
      },
      exec,
    );

    expect(again.created).toEqual(["entity_membership"]);
    expect(await exec.select().from(entity)).toHaveLength(1);
    expect(await exec.select().from(entityMembership)).toHaveLength(1);
  });

  it("never writes a second default, whatever is retried", async () => {
    const exec = execOn(pg);
    await createEntity(
      {
        organizationId: ORG_E,
        type: "bjj_academy",
        name: "Alma",
        ownerUserId: OWNER,
      },
      exec,
    );

    const rows = await exec.select().from(entity);
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    expect(rows.find((r) => r.isDefault)?.id).toBe(ORG_E);
  });
});

describe("copying a branch's setup into a new one", () => {
  let pg: PGlite;
  const ORG_F = "org_zeta";
  const COACH = "u_coach";
  const STUDENT = "u_student";
  let sourceId: string;
  let copyId: string;

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG_F);
    await pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES
        ('${COACH}', 'Coach', 'coach@test.local', true, now(), now()),
        ('${STUDENT}', 'Student', 'student@test.local', true, now(), now())
      ON CONFLICT (id) DO NOTHING;
    `);

    const source = await createEntity(
      {
        organizationId: ORG_F,
        type: "bjj_academy",
        name: "North Mat",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
    sourceId = source.entityId;

    await pg.query(
      `INSERT INTO "entity_membership"
         (organization_id, entity_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, 'instructor', 'active', now()),
              ($1, $2, $4, 'student', 'active', now())`,
      [ORG_F, sourceId, COACH, STUDENT],
    );
    await pg.query(
      `INSERT INTO "class_template"
         (academy_id, instructor_id, title, days_of_week, starts_at_minutes,
          duration_minutes, time_zone, capacity, public_bookable)
       VALUES ($1, $2, 'Fundamentals', '{1,3}', 1080, 60, 'Europe/Lisbon', 20, true)`,
      [sourceId, COACH],
    );

    const copy = await createEntity(
      {
        organizationId: ORG_F,
        type: "bjj_academy",
        name: "South Mat",
        ownerUserId: OWNER,
        copyFromEntityId: sourceId,
      },
      execOn(pg),
    );
    copyId = copy.entityId;
  });

  afterAll(() => pg.close());

  it("copies the weekly template, as a plan with no classes yet", async () => {
    const rows = await execOn(pg)
      .select()
      .from(classTemplate)
      .where(eq(classTemplate.academyId, copyId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Fundamentals",
      daysOfWeek: [1, 3],
      startsAtMinutes: 1080,
      capacity: 20,
    });
    expect(rows[0]?.generatedUntil).toBeNull();
  });

  it("drops the source's public booking flag and curriculum track", async () => {
    const rows = await execOn(pg)
      .select()
      .from(classTemplate)
      .where(eq(classTemplate.academyId, copyId));

    expect(rows[0]?.publicBookable).toBe(false);
    expect(rows[0]?.curriculumTrackId).toBeNull();
  });

  it("copies the staff and leaves the students where they are", async () => {
    const rows = await execOn(pg)
      .select()
      .from(entityMembership)
      .where(eq(entityMembership.entityId, copyId));

    expect(
      rows
        .map((r) => ({ userId: r.userId, role: r.role }))
        .sort((a, b) => (a.userId ?? "").localeCompare(b.userId ?? "")),
    ).toEqual([
      { userId: COACH, role: "instructor" },
      { userId: OWNER, role: "owner" },
    ]);
  });

  it("is a normal branch, not a second default", async () => {
    const rows = await execOn(pg)
      .select()
      .from(entity)
      .where(eq(entity.id, copyId));
    expect(rows[0]?.isDefault).toBe(false);
  });
});

/**
 * Two simultaneous first-branch requests cannot be run here: that needs two
 * connections and this harness is a single-connection PGlite, the same limit
 * ADR 126 recorded for the last-place race. What IS testable is the invariant
 * the lock protects, so these assert the database's own second line of defence
 * rather than something that would pass for the wrong reason.
 */
describe("the one-default rule the first-branch lock protects", () => {
  let pg: PGlite;
  const ORG_G = "org_eta";

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG_G);
    await createEntity(
      {
        organizationId: ORG_G,
        type: "bjj_academy",
        name: "North Mat",
        ownerUserId: OWNER,
      },
      execOn(pg),
    );
  });

  afterAll(() => pg.close());

  it("refuses a second live default for one gym", async () => {
    await expect(
      pg.query(
        `INSERT INTO "entity" (id, organization_id, type, name, slug, is_default, public_code)
         VALUES ('e_rival', $1, 'bjj_academy', 'Rival', 'rival', true, '654321')`,
        [ORG_G],
      ),
    ).rejects.toThrow();
  });

  it("allows one again once the first is soft-deleted, which is the rule createEntity reads", async () => {
    await pg.query(`UPDATE "entity" SET deleted_at = now() WHERE id = $1`, [
      ORG_G,
    ]);
    await expect(
      pg.query(
        `INSERT INTO "entity" (id, organization_id, type, name, slug, is_default, public_code)
         VALUES ('e_next', $1, 'bjj_academy', 'Next', 'next', true, '654322')`,
        [ORG_G],
      ),
    ).resolves.toBeDefined();
  });
});
