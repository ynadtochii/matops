import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, createEntity, eq } from "@matops/db";
import {
  academyInvite,
  entityMembership,
  member,
  user,
} from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, memberId, seedAcademies } from "./helpers";

const ORG = "org_a";
const OWNER = "u_owner";
const JOINER = "u_joiner";

const PROFILE = { firstName: "Pat", lastName: "Lee", phone: "+351912345678" };

describe("joining through an invite link", () => {
  let h: Harness;
  let token: string;
  let secondEntity: string;
  let secondToken: string;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "100001",
        members: [{ userId: OWNER, role: "owner", status: "active" }],
      },
    ]);
    await h.pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('${JOINER}', 'Joiner', 'joiner@test.local', true, now(), now());
    `);

    const link = await h.as(OWNER, ORG).invite.create({ role: "student" });
    token = link.token;

    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    secondEntity = made.entityId;
    const secondLink = await h.exec
      .insert(academyInvite)
      .values({
        academyId: secondEntity,
        role: "student",
        token: "second-mat-token",
        createdBy: OWNER,
      })
      .returning();
    secondToken = secondLink[0]?.token ?? "";
  });

  afterAll(() => h.close());

  async function entityRows(userId: string) {
    return h.exec
      .select()
      .from(entityMembership)
      .where(eq(entityMembership.userId, userId));
  }

  it("makes one organization membership and one pending entity membership", async () => {
    const result = await h
      .as(JOINER, null)
      .membership.join({ token, ...PROFILE });
    expect(result.status).toBe("pending");

    const orgRows = await h.exec
      .select()
      .from(member)
      .where(eq(member.userId, JOINER));
    expect(orgRows).toHaveLength(1);

    const rows = await entityRows(JOINER);
    expect(rows).toHaveLength(1);
    expect([rows[0]?.entityId, rows[0]?.status, rows[0]?.role]).toEqual([
      ORG,
      "pending",
      "member",
    ]);
    expect(rows[0]?.invitedRole).toBe("student");
  });

  it("is idempotent, so a second tap adds no second row", async () => {
    const again = await h
      .as(JOINER, ORG)
      .membership.join({ token, ...PROFILE });
    expect(again.alreadyMember).toBe(true);
    expect(await entityRows(JOINER)).toHaveLength(1);
  });

  it("joins a sibling entity without touching the first membership", async () => {
    await h.exec
      .update(entityMembership)
      .set({ status: "active", role: "student" })
      .where(
        and(
          eq(entityMembership.userId, JOINER),
          eq(entityMembership.entityId, ORG),
        ),
      );

    await h.as(JOINER, ORG).membership.join({ token: secondToken, ...PROFILE });

    const rows = await entityRows(JOINER);
    expect(rows).toHaveLength(2);

    const first = rows.find((r) => r.entityId === ORG);
    const second = rows.find((r) => r.entityId === secondEntity);
    expect([first?.status, first?.role]).toEqual(["active", "student"]);
    expect([second?.status, second?.role]).toEqual(["pending", "member"]);
  });

  it("reuses the one organization membership across both entities", async () => {
    const orgRows = await h.exec
      .select()
      .from(member)
      .where(eq(member.userId, JOINER));
    expect(orgRows).toHaveLength(1);
  });
});

describe("owner actions write the entity membership", () => {
  let h: Harness;
  let secondEntity: string;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "100001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          {
            userId: JOINER,
            role: "member",
            status: "pending",
            invitedRole: "student",
          },
        ],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    secondEntity = made.entityId;
    await h.exec.insert(entityMembership).values({
      organizationId: ORG,
      entityId: secondEntity,
      userId: JOINER,
      role: "student",
      status: "active",
      joinedAt: new Date(),
    });
  });

  afterAll(() => h.close());

  const rowFor = async (entityId: string) =>
    (
      await h.exec
        .select()
        .from(entityMembership)
        .where(
          and(
            eq(entityMembership.entityId, entityId),
            eq(entityMembership.userId, JOINER),
          ),
        )
    )[0];

  it("grants the invited role on approval", async () => {
    await h
      .as(OWNER, ORG)
      .membership.approve({ memberId: memberId(ORG, JOINER) });
    const row = await rowFor(ORG);
    expect([row?.role, row?.status]).toEqual(["student", "active"]);
    expect(row?.joinedAt).not.toBeNull();
  });

  it("leaves the organization row alone, because it only records belonging", async () => {
    const orgRow = (
      await h.exec.select().from(member).where(eq(member.userId, JOINER))
    )[0];
    expect(orgRow?.role).toBe("member");
  });

  it("suspends at one entity and leaves the sibling alone", async () => {
    await h
      .as(OWNER, ORG)
      .membership.suspend({ memberId: memberId(ORG, JOINER) });
    expect((await rowFor(ORG))?.status).toBe("suspended");
    expect((await rowFor(secondEntity))?.status).toBe("active");
  });

  it("restores the same one entity", async () => {
    await h
      .as(OWNER, ORG)
      .membership.restore({ memberId: memberId(ORG, JOINER) });
    expect((await rowFor(ORG))?.status).toBe("active");
    expect((await rowFor(secondEntity))?.status).toBe("active");
  });

  it("refuses to strip the entity of its last active owner", async () => {
    const refused = await h
      .as(OWNER, ORG)
      .membership.setRole({ memberId: memberId(ORG, OWNER), role: "student" })
      .then(() => "allowed")
      .catch((e: { code?: string }) => e.code ?? "threw");
    expect(refused).toBe("PRECONDITION_FAILED");
  });
});

describe("erasing a member from one entity", () => {
  let h: Harness;
  let secondEntity: string;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "100001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: JOINER, role: "student", status: "active" },
        ],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    secondEntity = made.entityId;
    await h.exec.insert(entityMembership).values({
      organizationId: ORG,
      entityId: secondEntity,
      userId: JOINER,
      role: "student",
      status: "active",
      joinedAt: new Date(),
    });

    await h
      .as(OWNER, ORG)
      .membership.purge({ memberId: memberId(ORG, JOINER) });
  });

  afterAll(() => h.close());

  it("takes away the membership of that entity only", async () => {
    const rows = await h.exec
      .select()
      .from(entityMembership)
      .where(eq(entityMembership.userId, JOINER));
    expect(rows.map((r) => r.entityId)).toEqual([secondEntity]);
  });

  it("keeps the organization membership that is their way into the other mat", async () => {
    const rows = await h.exec
      .select()
      .from(member)
      .where(eq(member.userId, JOINER));
    expect(rows).toHaveLength(1);
  });

  it("keeps their sign-in account", async () => {
    const rows = await h.exec.select().from(user).where(eq(user.id, JOINER));
    expect(rows).toHaveLength(1);
  });
});

describe("an invite link names one entity", () => {
  let h: Harness;
  let secondEntity: string;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "100001",
        members: [{ userId: OWNER, role: "owner", status: "active" }],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    secondEntity = made.entityId;
    await h.exec.insert(academyInvite).values({
      academyId: secondEntity,
      role: "student",
      token: "second-mat-token",
      createdBy: OWNER,
    });
  });

  afterAll(() => h.close());

  it("resolves the entity it was minted for, not the default one", async () => {
    const resolved = await h
      .as("nobody", null)
      .invite.resolve({ token: "second-mat-token" });
    expect(resolved.academyId).toBe(secondEntity);
    expect(resolved.academyName).toBe("Second Mat");
  });

  it("names the organization above it, which the join flow needs", async () => {
    const resolved = await h
      .as("nobody", null)
      .invite.resolve({ token: "second-mat-token" });
    expect(resolved.organizationId).toBe(ORG);
  });

  it("keeps resolving when a SIBLING academy closes", async () => {
    await h.as(OWNER, ORG).academy.remove({
      confirm: `delete Academy ${ORG}`,
    });
    const resolved = await h
      .as("nobody", null)
      .invite.resolve({ token: "second-mat-token" });
    expect(resolved.academyId).toBe(secondEntity);
  });

  it("stops resolving once its own academy closes", async () => {
    const headers = new Headers();
    headers.set("x-matops-entity", secondEntity);
    await h.as(OWNER, ORG, headers).academy.remove({
      confirm: "delete Second Mat",
    });
    const code = await h
      .as("nobody", null)
      .invite.resolve({ token: "second-mat-token" })
      .then(() => "resolved")
      .catch((e: { code?: string }) => e.code ?? "threw");
    expect(code).toBe("NOT_FOUND");
  });
});
