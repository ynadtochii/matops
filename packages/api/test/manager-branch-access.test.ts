import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity, eq, provisionOrganization } from "@matops/db";
import { entityMembership } from "@matops/db/schema";

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

  it("adds somebody at one branch without touching their role at another", async () => {
    // STUDENT is an instructor at GYM after the test above. Putting them on
    // the second mat as a student must write a row THERE, not overwrite the
    // one they hold at GYM: the two branches are separate decisions (ADR 129).
    await at(MANAGER, GYM).entity.setBranchRole({
      entityId: second,
      userId: STUDENT,
      role: "student",
    });

    const rows = await h.exec
      .select({
        entityId: entityMembership.entityId,
        role: entityMembership.role,
      })
      .from(entityMembership)
      .where(eq(entityMembership.userId, STUDENT));
    const roleAt = (id: string) => rows.find((r) => r.entityId === id)?.role;
    expect([roleAt(GYM), roleAt(second)]).toEqual(["instructor", "student"]);
  });

  it("reaches nothing in another gym", async () => {
    expect(await rejectionCode(at(MANAGER, OTHER).entity.current())).toBe(
      "FORBIDDEN",
    );
    expect(await rejectionCode(at(OUTSIDER, GYM, OTHER).entity.current())).toBe(
      "FORBIDDEN",
    );
  });

  it("cannot change an owner's branch status", async () => {
    const input = { memberId: memberId(GYM, OWNER) };
    expect(
      await rejectionCode(at(MANAGER, GYM).membership.suspend(input)),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(at(MANAGER, GYM).membership.archive(input)),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(at(MANAGER, GYM).membership.restore(input)),
    ).toBe("FORBIDDEN");
  });

  it("refuses branch changes that cannot remove inherited staff access", async () => {
    const input = { memberId: memberId(GYM, OWNER) };
    expect(await rejectionCode(at(OWNER, GYM).membership.suspend(input))).toBe(
      "PRECONDITION_FAILED",
    );
    expect(await rejectionCode(at(OWNER, GYM).membership.archive(input))).toBe(
      "PRECONDITION_FAILED",
    );
    expect(
      await rejectionCode(
        at(OWNER, GYM).membership.setRole({ ...input, role: "student" }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("does not create a student branch record for organization staff", async () => {
    expect(
      await rejectionCode(
        at(OWNER, GYM).entity.setBranchRole({
          entityId: second,
          userId: MANAGER,
          role: "student",
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("keeps a branch owner role above an organization manager role", async () => {
    await pg.exec(
      `UPDATE "member" SET role = 'manager' WHERE user_id = '${OWNER}' AND organization_id = '${GYM}';`,
    );
    try {
      const current = await at(OWNER, GYM).entity.current();
      const staff = await at(OWNER, GYM).membership.staff();
      expect(current.role).toBe("owner");
      expect(staff.find((row) => row.userId === OWNER)?.role).toBe("owner");
    } finally {
      await pg.exec(
        `UPDATE "member" SET role = 'owner' WHERE user_id = '${OWNER}' AND organization_id = '${GYM}';`,
      );
    }
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
