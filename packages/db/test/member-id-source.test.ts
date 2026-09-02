import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getAcademyMembership,
  getMemberById,
  getMemberIdForUser,
  listMembersOf,
} from "../src/membership";
import { createEntity, provisionOrganization } from "../src/provision";
import { entityMembership } from "../src/schema";
import { execOn, freshDb } from "./helpers";

const ORG = "org_alma";
const OWNER = "u_owner";
const STUDENT = "u_student";
const ORG_ONLY = "u_org_only";

describe("member ids come from entity_membership", () => {
  let pg: PGlite;
  let secondEntity: string;

  beforeAll(async () => {
    pg = await freshDb([]);
    await pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
        ('${OWNER}', 'Owner', 'owner@test.local', true, now(), now()),
        ('${STUDENT}', 'Student', 'student@test.local', true, now(), now()),
        ('${ORG_ONLY}', 'Org Only', 'orgonly@test.local', true, now(), now());
      INSERT INTO "organization" (id, name, slug, public_code, created_at)
        VALUES ('${ORG}', 'Alma', 'alma', '100001', now());
      INSERT INTO "member" (id, organization_id, user_id, role, status, created_at) VALUES
        ('mem_owner', '${ORG}', '${OWNER}', 'owner', 'active', now()),
        ('mem_student', '${ORG}', '${STUDENT}', 'student', 'active', now()),
        ('mem_org_only', '${ORG}', '${ORG_ONLY}', 'student', 'active', now());
    `);
    const exec = execOn(pg);
    await provisionOrganization(
      { organizationId: ORG, ownerUserId: OWNER },
      exec,
    );
    await exec.insert(entityMembership).values({
      id: "emem_student",
      organizationId: ORG,
      entityId: ORG,
      userId: STUDENT,
      role: "student",
      status: "active",
      joinedAt: new Date(),
    });
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: STUDENT,
      },
      exec,
    );
    secondEntity = made.entityId;
  });

  afterAll(async () => {
    await pg.close();
  });

  it("lists the entity membership id, never the Better Auth member id", async () => {
    const rows = await listMembersOf(ORG, execOn(pg));
    const student = rows.find((r) => r.userId === STUDENT);
    expect(student?.memberId).toBe("emem_student");
  });

  it("leaves out an organization member with no membership of this entity", async () => {
    const rows = await listMembersOf(ORG, execOn(pg));
    expect(rows.map((r) => r.userId)).not.toContain(ORG_ONLY);
  });

  it("gives one person a different id at each entity", async () => {
    const exec = execOn(pg);
    const here = await getMemberIdForUser(STUDENT, ORG, exec);
    const there = await getMemberIdForUser(STUDENT, secondEntity, exec);
    expect(here).toBe("emem_student");
    expect(there).not.toBeNull();
    expect(there).not.toBe(here);
  });

  it("reads a membership back by its own id, scoped to its entity", async () => {
    const row = await getMemberById("emem_student", execOn(pg));
    expect(row).toMatchObject({
      id: "emem_student",
      academyId: ORG,
      userId: STUDENT,
      role: "student",
    });
    expect(await getMemberById("mem_student", execOn(pg))).toBeNull();
  });

  it("hands the academy tier the entity membership id", async () => {
    const membership = await getAcademyMembership(STUDENT, ORG, execOn(pg));
    expect(membership?.memberId).toBe("emem_student");
  });

  it("refuses a note naming a membership at another entity", async () => {
    const elsewhere = await getMemberIdForUser(
      STUDENT,
      secondEntity,
      execOn(pg),
    );
    await expect(
      pg.exec(`INSERT INTO "member_note" (academy_id, member_id, body, author_id)
               VALUES ('${ORG}', '${elsewhere}', 'wrong mat', '${OWNER}')`),
    ).rejects.toThrow(/member_note_membership/);
  });

  it("takes the same note at the entity the membership belongs to", async () => {
    await pg.exec(`INSERT INTO "member_note" (academy_id, member_id, body, author_id)
             VALUES ('${ORG}', 'emem_student', 'right mat', '${OWNER}')`);
    const res = await pg.query<{ n: number }>(
      `SELECT count(*)::int n FROM "member_note" WHERE member_id = 'emem_student'`,
    );
    expect(res.rows[0]?.n).toBe(1);
  });

  it("refuses a membership of a closed academy", async () => {
    await pg.exec(
      `UPDATE "entity" SET deleted_at = now() WHERE id = '${secondEntity}'`,
    );
    expect(
      await getAcademyMembership(STUDENT, secondEntity, execOn(pg)),
    ).toBeNull();
  });
});
