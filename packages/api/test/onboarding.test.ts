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

async function codeOf(h: Harness, academyId: string): Promise<string> {
  const res = await h.pg.query<{ public_code: string }>(
    `SELECT public_code FROM "organization" WHERE id = $1`,
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
    `SELECT role, status, invited_role FROM "member"
      WHERE organization_id = $1 AND user_id = $2`,
    [academyId, userId],
  );
  return res.rows[0] ?? { role: "none", status: "none", invited_role: null };
}

const PERSON = { firstName: "Ana", lastName: "Silva", phone: "+351911111111" };

describe("start a gym", () => {
  it("makes the creator a working owner with a six-digit code", async () => {
    const h = await base();
    const { academyId } = await h
      .as(OWNER, null)
      .academy.create({ name: "Alma Jiu-Jitsu" });

    expect(await membership(h, academyId, OWNER)).toMatchObject({
      role: "owner",
      status: "active",
    });
    expect(await codeOf(h, academyId)).toMatch(/^\d{6}$/);
    expect(h.activeOrgOf(OWNER)).toBe(academyId);
  });

  it("gives two gyms two different codes", async () => {
    const h = await base();
    const a = await h.as(OWNER, null).academy.create({ name: "Alma" });
    const b = await h.as(COACH, null).academy.create({ name: "Beta" });
    expect(await codeOf(h, a.academyId)).not.toBe(await codeOf(h, b.academyId));
  });

  it("refuses a signed-out visitor", async () => {
    const h = await base();
    const anon = h.ctxFor(OWNER, null);
    const caller = { ...anon, session: null } as typeof anon;
    const { appRouter } = await import("../src/root");
    expect(
      await rejectionCode(
        appRouter.createCaller(caller).academy.create({ name: "Nope" }),
      ),
    ).toBe("UNAUTHORIZED");
  });
});

describe("joining a gym", () => {
  it("lands a student pending, with no academy role until approval", async () => {
    const h = await base();
    const { academyId } = await h.as(OWNER, null).academy.create({ name: "Alma" });
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
    const { academyId } = await h.as(OWNER, null).academy.create({ name: "Alma" });
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
    const { academyId } = await h.as(OWNER, null).academy.create({ name: "Alma" });
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
    const { academyId } = await h.as(OWNER, null).academy.create({ name: "Alma" });
    const invite = await h
      .as(OWNER, academyId)
      .invite.create({ role: "student" });

    await h.as(STUDENT, null).membership.join({ token: invite.token, ...PERSON });
    const again = await h
      .as(STUDENT, null)
      .membership.join({ token: invite.token, ...PERSON });

    expect(again.alreadyMember).toBe(true);
    const rows = await h.pg.query(
      `SELECT id FROM "member" WHERE organization_id = $1 AND user_id = $2`,
      [academyId, STUDENT],
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("refuses a token that was never minted", async () => {
    const h = await base();
    await h.as(OWNER, null).academy.create({ name: "Alma" });
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
    const { academyId } = await h.as(OWNER, null).academy.create({ name: "Alma" });
    const first = await h.as(OWNER, academyId).invite.create({ role: "student" });
    const second = await h.as(OWNER, academyId).invite.rotate({ role: "student" });

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
    const { academyId } = await h.as(OWNER, null).academy.create({ name: "Alma" });
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
    await h.as(OWNER, null).academy.create({ name: "Alma" });
    expect(
      await rejectionCode(
        h.as(STUDENT, null).membership.joinByCode({ code: "000000", ...PERSON }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("switching the active academy", () => {
  it("switches to a gym the caller belongs to", async () => {
    const h = await base();
    const { academyId } = await h.as(OWNER, null).academy.create({ name: "Alma" });
    const code = await codeOf(h, academyId);
    await h.as(STUDENT, null).membership.joinByCode({ code, ...PERSON });

    await expect(
      h.as(STUDENT, null).academy.setActive({ academyId }),
    ).resolves.toEqual({ ok: true });
    expect(h.activeOrgOf(STUDENT)).toBe(academyId);
  });

  it("refuses a gym the caller does not belong to", async () => {
    const h = await base();
    const { academyId } = await h.as(OWNER, null).academy.create({ name: "Alma" });

    expect(
      await rejectionCode(h.as(STRANGER, null).academy.setActive({ academyId })),
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
