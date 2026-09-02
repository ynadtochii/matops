import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity, provisionOrganization } from "../src/provision";
import {
  academyProfile,
  curriculumTrack,
  entity,
  entityMembership,
} from "../src/schema";
import { execOn, freshDb } from "./helpers";

const ORG = "org_alma";
const OWNER = "u_owner";

async function seedOrganization(pg: PGlite, id: string, code: string) {
  await pg.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ('${OWNER}', 'Owner', '${id}@test.local', true, now(), now())
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO "organization" (id, name, slug, public_code, created_at, time_zone)
      VALUES ('${id}', 'Alma', 'alma-${id}', '${code}', now(), 'Europe/Lisbon');
  `);
}

describe("provisioning an organization", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb([]);
    await seedOrganization(pg, ORG, "100001");
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

  it("gives the default entity the organization's own id and code", async () => {
    const rows = await execOn(pg).select().from(entity);
    expect(rows).toHaveLength(1);
    expect([rows[0]?.id, rows[0]?.publicCode, rows[0]?.isDefault]).toEqual([
      ORG,
      "100001",
      true,
    ]);
  });

  it("carries the organization's settings onto the entity", async () => {
    const rows = await execOn(pg).select().from(entity);
    expect(rows[0]?.timeZone).toBe("Europe/Lisbon");
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
    await seedOrganization(pg, ORG, "100001");
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
    await seedOrganization(pg, ORG, "100001");
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
