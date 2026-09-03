import type { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setMemberRoleIfNotLastOwner } from "../src/membership";
import { createEntity, provisionOrganization } from "../src/provision";
import { entityMembership, member } from "../src/schema";
import { execOn, freshDb } from "./helpers";

const ORG = "org_alma";
const OWNER = "u_owner";
const COACH = "u_coach";

describe("never ownerless, one mat at a time", () => {
  let pg: PGlite;
  let secondEntity: string;
  let ownerAtSecond: string;
  let ownerAtDefault: string;

  beforeAll(async () => {
    pg = await freshDb([]);
    await pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
        ('${OWNER}', 'Owner', 'owner@test.local', true, now(), now()),
        ('${COACH}', 'Coach', 'coach@test.local', true, now(), now());
      INSERT INTO "organization" (id, name, slug, created_at)
        VALUES ('${ORG}', 'Alma', 'alma', now());
      INSERT INTO "member" (id, organization_id, user_id, role, created_at) VALUES
        ('mem_owner', '${ORG}', '${OWNER}', 'owner', now()),
        ('mem_coach', '${ORG}', '${COACH}', 'instructor', now());
    `);
    const exec = execOn(pg);
    await provisionOrganization(
      { organizationId: ORG, ownerUserId: OWNER },
      exec,
    );
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      exec,
    );
    secondEntity = made.entityId;
    await exec.insert(entityMembership).values({
      organizationId: ORG,
      entityId: secondEntity,
      userId: COACH,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
    const idAt = async (entityId: string) => {
      const rows = await exec
        .select({ id: entityMembership.id })
        .from(entityMembership)
        .where(
          and(
            eq(entityMembership.entityId, entityId),
            eq(entityMembership.userId, OWNER),
          ),
        );
      const row = rows[0];
      if (!row) throw new Error(`no owner membership at ${entityId}`);
      return row.id;
    };
    ownerAtSecond = await idAt(secondEntity);
    ownerAtDefault = await idAt(ORG);
  });

  afterAll(() => pg.close());

  it("refuses stripping a mat of its last active owner", async () => {
    const result = await setMemberRoleIfNotLastOwner(
      ORG,
      ownerAtDefault,
      "student",
      execOn(pg),
    );
    expect(result.ok).toBe(false);
  });

  it("wrote nothing when it refused", async () => {
    const rows = await execOn(pg)
      .select({ role: entityMembership.role })
      .from(entityMembership)
      .where(eq(entityMembership.id, ownerAtDefault));
    expect(rows[0]?.role).toBe("owner");
  });

  it("allows it at a mat that has a second owner", async () => {
    const result = await setMemberRoleIfNotLastOwner(
      secondEntity,
      ownerAtSecond,
      "instructor",
      execOn(pg),
    );
    expect(result.ok).toBe(true);
  });

  it("leaves the organization role alone, because nothing mirrors it now", async () => {
    const rows = await execOn(pg)
      .select({ role: member.role })
      .from(member)
      .where(eq(member.id, "mem_owner"));
    expect(rows[0]?.role).toBe("owner");
  });
});
