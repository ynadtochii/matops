import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity, provisionOrganization } from "@matops/db";

import type { Harness } from "./helpers";
import { harness, memberId, rejectionCode, seedAcademies } from "./helpers";

const GYM = "org_mgr_branch";
const OTHER = "org_mgr_other";
const OWNER = "u_mgr_owner";
const MANAGER = "u_mgr_manager";
const COACH = "u_mgr_coach";
const STUDENT = "u_mgr_student";
const OUTSIDER = "u_mgr_outsider";

function withEntity(id: string): Headers {
  const headers = new Headers();
  headers.set("x-matops-entity", id);
  return headers;
}

describe("a gym manager at a branch", () => {
  let h: Harness;
  let pg: PGlite;
  let second: string;

  const at = (user: string, entityId: string, organizationId = GYM) =>
    h.as(user, organizationId, withEntity(entityId));

  beforeAll(async () => {
    h = await harness();
    pg = h.pg;
    await seedAcademies(pg, [
      {
        id: GYM,
        code: "700190",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "700191",
        members: [{ userId: OUTSIDER, role: "owner", status: "active" }],
      },
    ]);
    await pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('${MANAGER}', 'Mel Manager', '${MANAGER}@test.local', true, now(), now());
      INSERT INTO "member" (id, organization_id, user_id, role, created_at)
        VALUES ('mem_${GYM}_${MANAGER}', '${GYM}', '${MANAGER}', 'manager', now());
    `);
    await provisionOrganization(
      { organizationId: GYM, ownerUserId: OWNER },
      h.exec,
    );
    const made = await createEntity(
      {
        organizationId: GYM,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    second = made.entityId;
  });

  afterAll(() => h.close());

  it("enters a branch it holds no membership at, as a manager", async () => {
    for (const entityId of [GYM, second]) {
      const current = await at(MANAGER, entityId).entity.current();
      expect([entityId, current.id, current.role]).toEqual([
        entityId,
        entityId,
        "manager",
      ]);
    }
  });

  it("runs the schedule, the roster and the money at that branch", async () => {
    await expect(at(MANAGER, second).stats.dashboard()).resolves.toBeDefined();
    await expect(at(MANAGER, second).membership.staff()).resolves.toBeDefined();
    await expect(at(MANAGER, second).payments.plans()).resolves.toBeDefined();
    await expect(at(MANAGER, second).academy.settings()).resolves.toBeDefined();
    await expect(at(MANAGER, second).dropIn.list()).resolves.toBeDefined();
  });

  it("is not enrolled as a student by managing the branch", async () => {
    const roster = await at(MANAGER, second).membership.members();
    expect(roster.map((r) => r.userId)).not.toContain(MANAGER);
  });

  it("is refused the four protected actions", async () => {
    expect(
      await rejectionCode(
        at(MANAGER, second).academy.remove({ confirm: "delete Second Mat" }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        at(MANAGER, GYM).membership.purge({
          memberId: memberId(GYM, STUDENT),
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        at(MANAGER, GYM).membership.promote({
          memberId: memberId(GYM, COACH),
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        at(MANAGER, GYM).membership.setRole({
          memberId: memberId(GYM, OWNER),
          role: "instructor",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("may still assign an instructor, which is ordinary work", async () => {
    await expect(
      at(MANAGER, GYM).membership.setRole({
        memberId: memberId(GYM, STUDENT),
        role: "instructor",
      }),
    ).resolves.toBeDefined();
  });

  it("reaches nothing in another gym", async () => {
    expect(await rejectionCode(at(MANAGER, OTHER).entity.current())).toBe(
      "FORBIDDEN",
    );
    expect(await rejectionCode(at(OUTSIDER, GYM, OTHER).entity.current())).toBe(
      "FORBIDDEN",
    );
  });

  it("loses branch access the moment the gym membership goes", async () => {
    await pg.exec(
      `UPDATE "member" SET role = 'student' WHERE id = 'mem_${GYM}_${MANAGER}';`,
    );
    expect(await rejectionCode(at(MANAGER, second).entity.current())).toBe(
      "FORBIDDEN",
    );
  });
});
