import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setMemberRoleIfNotLastOwner } from "../src/membership";
import { createEntity, provisionOrganization } from "../src/provision";
import { entityMembership, member } from "../src/schema";
import { execOn, freshDb } from "./helpers";

const ORG = "org_alma";
const OWNER = "u_owner";
const COACH = "u_coach";

describe("never ownerless, at both levels", () => {
  let pg: PGlite;
  let secondEntity: string;

  beforeAll(async () => {
    pg = await freshDb();
    await pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
        ('${OWNER}', 'Owner', 'owner@test.local', true, now(), now()),
        ('${COACH}', 'Coach', 'coach@test.local', true, now(), now());
      INSERT INTO "organization" (id, name, slug, public_code, created_at)
        VALUES ('${ORG}', 'Alma', 'alma', '100001', now());
      INSERT INTO "member" (id, organization_id, user_id, role, status, created_at) VALUES
        ('mem_owner', '${ORG}', '${OWNER}', 'owner', 'active', now()),
        ('mem_coach', '${ORG}', '${COACH}', 'instructor', 'active', now());
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
    // The coach runs the second mat but is only an instructor of the
    // organization: two owners on that mat, one owner in the organization.
    await exec.insert(entityMembership).values({
      organizationId: ORG,
      entityId: secondEntity,
      userId: COACH,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
  });

  afterAll(() => pg.close());

  it("refuses a demotion the entity check alone would allow", async () => {
    const result = await setMemberRoleIfNotLastOwner(
      secondEntity,
      "mem_owner",
      "instructor",
      execOn(pg),
    );
    expect(result.ok).toBe(false);
  });

  it("wrote nothing when it refused", async () => {
    const rows = await execOn(pg)
      .select()
      .from(member)
      .where(eq(member.id, "mem_owner"));
    expect(rows[0]?.role).toBe("owner");
  });

  it("allows it once the organization has a second owner", async () => {
    const exec = execOn(pg);
    await exec
      .update(member)
      .set({ role: "owner" })
      .where(eq(member.id, "mem_coach"));

    const result = await setMemberRoleIfNotLastOwner(
      secondEntity,
      "mem_owner",
      "instructor",
      exec,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses stripping the entity of its last owner even when the organization has spares", async () => {
    const result = await setMemberRoleIfNotLastOwner(
      ORG,
      "mem_owner",
      "student",
      execOn(pg),
    );
    expect(result.ok).toBe(false);
  });
});
