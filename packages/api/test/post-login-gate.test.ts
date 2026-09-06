import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postLoginTarget } from "@matops/domain";

import type { Harness } from "./helpers";
import { harness, rejectionCode } from "./helpers";

const ORG = "org_alma";
const OWNER = "u_owner";
const STUDENT = "u_student";
const STRANGER = "u_stranger";

describe("a session that names no gym", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness([
      {
        id: ORG,
        code: "100001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  it("cannot reach the organization tier, which is why a gate exists", async () => {
    expect(await rejectionCode(h.as(OWNER, null).entity.list())).toBe(
      "FORBIDDEN",
    );
  });

  it("still lists the gyms the person belongs to", async () => {
    const mine = await h.as(OWNER, null).academy.memberships();
    expect(mine.map((m) => m.academyId)).toEqual([ORG]);
  });

  it("names the organization the gate has to activate", async () => {
    const [mine] = await h.as(STUDENT, null).academy.memberships();
    expect(mine?.organizationId).toBe(ORG);
  });

  it("opens the gym the gate picked", async () => {
    await h.as(OWNER, null).academy.setActive({ academyId: ORG });
    expect(h.activeOrgOf(OWNER)).toBe(ORG);
  });

  it("offers a stranger nothing to open", async () => {
    expect(await h.as(STRANGER, null).academy.memberships()).toEqual([]);
  });

  it("refuses a gym the caller does not belong to", async () => {
    expect(
      await rejectionCode(
        h.as(STRANGER, null).academy.setActive({ academyId: ORG }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("an owner whose gym has no branch yet", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await h.pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('${OWNER}', 'Owner', 'owner@test.local', true, now(), now()),
               ('${STUDENT}', 'Student', 'student@test.local', true, now(), now());
      INSERT INTO "organization" (id, name, slug, created_at)
        VALUES ('${ORG}', 'Half Made', 'half-made', now());
      INSERT INTO "member" (id, organization_id, user_id, role, created_at)
        VALUES ('mem_owner', '${ORG}', '${OWNER}', 'owner', now()),
               ('mem_student', '${ORG}', '${STUDENT}', 'member', now());
    `);
  });

  afterAll(() => h.close());

  // A zero-branch gym is a normal onboarding state now, so nothing repairs it
  // behind the owner's back: `organizationsMissingEntity` and the repair loop
  // went with ADR 128. The gate reads the gyms they RUN instead.
  it("belongs to no branch, because there is none", async () => {
    expect(await h.as(OWNER, null).academy.memberships()).toEqual([]);
  });

  it("is still offered its own gym, which is what stops the dead end", async () => {
    const mine = await h.as(OWNER, null).organization.mine();
    expect(mine.map((o) => o.organizationId)).toEqual([ORG]);
    expect(postLoginTarget([], mine)).toMatchObject({
      kind: "openGym",
      organizationId: ORG,
    });
  });

  it("offers nothing to somebody who does not run that gym", async () => {
    expect(await h.as(STUDENT, null).academy.memberships()).toEqual([]);
    expect(await h.as(STUDENT, null).organization.mine()).toEqual([]);
  });
});
