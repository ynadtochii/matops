import { afterEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode } from "./helpers";

const OWNER = "u_owner";
const STUDENT = "u_student";
const COACH = "u_coach";
const STRANGER = "u_stranger";

let open: Harness | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function base(): Promise<Harness> {
  const h = await harness();
  open = h;
  await h.pg.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES
      ('${OWNER}', 'Owner', 'owner@test.local', true, now(), now()),
      ('${STUDENT}', 'Student', 'student@test.local', true, now(), now()),
      ('${COACH}', 'Coach', 'coach@test.local', true, now(), now()),
      ('${STRANGER}', 'Stranger', 'stranger@test.local', true, now(), now());
  `);
  return h;
}

async function startGym(
  h: Harness,
  userId: string,
  name = "Alma",
): Promise<{ organizationId: string; academyId: string }> {
  const { organizationId } = await h
    .as(userId, null)
    .organization.create({ name });
  const { entityId } = await h
    .as(userId, null)
    .entity.create({ type: "bjj_academy", name });
  return { organizationId, academyId: entityId };
}

async function codeOf(h: Harness, academyId: string): Promise<string> {
  const res = await h.pg.query<{ public_code: string }>(
    `SELECT public_code FROM "entity" WHERE id = $1`,
    [academyId],
  );
  return res.rows[0]?.public_code ?? "";
}

async function membership(
  h: Harness,
  academyId: string,
  userId: string,
): Promise<{ role: string; status: string; invited_role: string | null }> {
  const res = await h.pg.query<{
    role: string;
    status: string;
    invited_role: string | null;
  }>(
    `SELECT role, status, invited_role FROM "entity_membership"
      WHERE entity_id = $1 AND user_id = $2`,
    [academyId, userId],
  );
  return res.rows[0] ?? { role: "none", status: "none", invited_role: null };
}

const PERSON = { firstName: "Ana", lastName: "Silva", phone: "+351911111111" };

describe("start a gym", () => {
  it("writes the organization and no branch", async () => {
    const h = await base();
    const { organizationId } = await h
      .as(OWNER, null)
      .organization.create({ name: "Alma Jiu-Jitsu" });

    const entities = await h.pg.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "entity" WHERE organization_id = $1`,
      [organizationId],
    );
    expect(entities.rows[0]?.n).toBe("0");
    expect(h.activeOrgOf(OWNER)).toBe(organizationId);
  });

  it("leaves a gym with no branch alone, instead of repairing it", async () => {
    const h = await base();
    const { organizationId } = await h
      .as(OWNER, null)
      .organization.create({ name: "Alma" });

    expect(await h.as(OWNER, null).academy.memberships()).toEqual([]);

    const entities = await h.pg.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "entity" WHERE organization_id = $1`,
      [organizationId],
    );
    expect(entities.rows[0]?.n).toBe("0");
  });

  it("lets the owner open the gym with no branch, so the overview can load", async () => {
    const h = await base();
    const { organizationId } = await h
      .as(OWNER, null)
      .organization.create({ name: "Alma" });

    await expect(h.as(OWNER, null).entity.list()).resolves.toMatchObject({
      organizationId,
      canCreateBranches: true,
      entities: [],
    });
  });

  it("makes the creator a working owner of the first branch, with a six-digit code", async () => {
    const h = await base();
    const { academyId } = await startGym(h, OWNER, "Alma Jiu-Jitsu");

    expect(await membership(h, academyId, OWNER)).toMatchObject({
      role: "owner",
      status: "active",
    });
    expect(await codeOf(h, academyId)).toMatch(/^\d{6}$/);
  });

  it("stores the time zone picked at setup and starts with approval-only booking", async () => {
    const h = await base();
    await h.as(OWNER, null).organization.create({ name: "Alma" });
    const { entityId } = await h.as(OWNER, null).entity.create({
      type: "bjj_academy",
      name: "Alma",
      timeZone: "Europe/Lisbon",
    });
    const row = await h.pg.query<{
      time_zone: string | null;
      membership_enforced_at: string | null;
    }>(`SELECT time_zone, membership_enforced_at FROM "entity" WHERE id = $1`, [
      entityId,
    ]);
    expect(row.rows[0]).toEqual({
      time_zone: "Europe/Lisbon",
      membership_enforced_at: null,
    });
  });

  it("refuses a time zone the runtime does not know", async () => {
    const h = await base();
    await h.as(OWNER, null).organization.create({ name: "Alma" });
    expect(
      await rejectionCode(
        h.as(OWNER, null).entity.create({
          type: "bjj_academy",
          name: "Alma",
          timeZone: "Mars/Olympus",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("resumes a gym with no academy without making a second gym", async () => {
    const h = await base();
    const { organizationId } = await h
      .as(OWNER, null)
      .organization.create({ name: "Alma" });
    await expect(h.as(OWNER, null).organization.mine()).resolves.toEqual([
      { organizationId, name: "Alma" },
    ]);
    const { entityId } = await h
      .as(OWNER, null)
      .entity.create({ type: "bjj_academy", name: "Alma" });
    expect(entityId).toBe(organizationId);
    const orgs = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "organization"`,
    );
    expect(orgs.rows[0]?.n).toBe(1);
  });

  it("gives two gyms two different codes", async () => {
    const h = await base();
    const a = await startGym(h, OWNER, "Alma");
    const b = await startGym(h, COACH, "Beta");
    expect(await codeOf(h, a.academyId)).not.toBe(await codeOf(h, b.academyId));
  });

  it("refuses a signed-out visitor", async () => {
    const h = await base();
    const anon = h.ctxFor(OWNER, null);
    const caller = { ...anon, session: null } as typeof anon;
    const { appRouter } = await import("../src/root");
    expect(
      await rejectionCode(
        appRouter.createCaller(caller).organization.create({ name: "Nope" }),
      ),
    ).toBe("UNAUTHORIZED");
  });
});

describe("joining a gym", () => {
  it("lands a student pending, with no academy role until approval", async () => {
    const h = await base();
    const { academyId } = await startGym(h, OWNER);
    const invite = await h
      .as(OWNER, academyId)
      .invite.create({ role: "student" });

    const joined = await h
      .as(STUDENT, null)
      .membership.join({ token: invite.token, ...PERSON });

    expect(joined).toMatchObject({ academyId, alreadyMember: false });
    expect(await membership(h, academyId, STUDENT)).toMatchObject({
      status: "pending",
      invited_role: "student",
    });
    expect(await membership(h, academyId, STUDENT)).not.toMatchObject({
      role: "student",
    });
  });

  it("carries the invited role so approval grants the right one", async () => {
    const h = await base();
    const { academyId } = await startGym(h, OWNER);
    const invite = await h
      .as(OWNER, academyId)
      .invite.create({ role: "instructor" });

    await h.as(COACH, null).membership.join({ token: invite.token, ...PERSON });
    expect(await membership(h, academyId, COACH)).toMatchObject({
      status: "pending",
      invited_role: "instructor",
    });
  });

  it("saves the name and phone the joiner typed", async () => {
    const h = await base();
    const { academyId } = await startGym(h, OWNER);
    const invite = await h
      .as(OWNER, academyId)
      .invite.create({ role: "student" });
    await h
      .as(STUDENT, null)
      .membership.join({ token: invite.token, ...PERSON });

    const res = await h.pg.query<{ name: string; phone: string | null }>(
      `SELECT name, phone FROM "user" WHERE id = $1`,
      [STUDENT],
    );
    expect(res.rows[0]).toMatchObject({
      name: "Ana Silva",
      phone: "+351911111111",
    });
  });

  it("is idempotent, so a second tap on the link changes nothing", async () => {
    const h = await base();
    const { organizationId, academyId } = await startGym(h, OWNER);
    const invite = await h
      .as(OWNER, academyId)
      .invite.create({ role: "student" });

    await h
      .as(STUDENT, null)
      .membership.join({ token: invite.token, ...PERSON });
    const again = await h
      .as(STUDENT, null)
      .membership.join({ token: invite.token, ...PERSON });

    expect(again.alreadyMember).toBe(true);
    const rows = await h.pg.query(
      `SELECT id FROM "member" WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, STUDENT],
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("refuses a token that was never minted", async () => {
    const h = await base();
    await startGym(h, OWNER);
    expect(
      await rejectionCode(
        h
          .as(STUDENT, null)
          .membership.join({ token: "not-a-real-token", ...PERSON }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("refuses a rotated token, and accepts the one that replaced it", async () => {
    const h = await base();
    const { academyId } = await startGym(h, OWNER);
    const first = await h
      .as(OWNER, academyId)
      .invite.create({ role: "student" });
    const second = await h
      .as(OWNER, academyId)
      .invite.rotate({ role: "student" });

    expect(second.token).not.toBe(first.token);
    expect(
      await rejectionCode(
        h.as(STUDENT, null).membership.join({ token: first.token, ...PERSON }),
      ),
    ).toBe("NOT_FOUND");
    await expect(
      h.as(STUDENT, null).membership.join({ token: second.token, ...PERSON }),
    ).resolves.toMatchObject({ academyId });
  });
});

describe("joining by the six-digit code", () => {
  it("lands a student pending as a student", async () => {
    const h = await base();
    const { academyId } = await startGym(h, OWNER);
    const code = await codeOf(h, academyId);

    const joined = await h.as(STUDENT, null).membership.joinByCode({
      code,
      ...PERSON,
    });

    expect(joined.academyId).toBe(academyId);
    expect(await membership(h, academyId, STUDENT)).toMatchObject({
      status: "pending",
      invited_role: "student",
    });
  });

  it("refuses a code no gym has", async () => {
    const h = await base();
    await startGym(h, OWNER);
    expect(
      await rejectionCode(
        h
          .as(STUDENT, null)
          .membership.joinByCode({ code: "000000", ...PERSON }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("switching the active academy", () => {
  it("switches to a gym the caller belongs to", async () => {
    const h = await base();
    const { organizationId, academyId } = await startGym(h, OWNER);
    const code = await codeOf(h, academyId);
    await h.as(STUDENT, null).membership.joinByCode({ code, ...PERSON });

    await expect(
      h.as(STUDENT, null).academy.setActive({ academyId }),
    ).resolves.toEqual({ ok: true });
    expect(h.activeOrgOf(STUDENT)).toBe(organizationId);
  });

  it("refuses a gym the caller does not belong to", async () => {
    const h = await base();
    const { academyId } = await startGym(h, OWNER);

    expect(
      await rejectionCode(
        h.as(STRANGER, null).academy.setActive({ academyId }),
      ),
    ).toBe("NOT_FOUND");
    expect(h.activeOrgOf(STRANGER)).toBeUndefined();
  });

  it("gives a missing academy the same answer as a foreign one", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as(STRANGER, null).academy.setActive({ academyId: "org_nope" }),
      ),
    ).toBe("NOT_FOUND");
  });
});
