import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity, eq } from "@matops/db";
import { academyProfile, entity, entityMembership } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, seedClasses } from "./helpers";

const ORG = "org_alma";
const OWNER = "u_owner";
const NOMAD = "u_nomad";

const CLASS_NORTH = "aaaaaaaa-0000-4000-8000-00000000000a";
const CLASS_SOUTH = "aaaaaaaa-0000-4000-8000-00000000000b";

describe("a public link names one academy, never its sibling", () => {
  let h: Harness;
  let south: string;
  let southCode: string;

  beforeAll(async () => {
    h = await harness([
      {
        id: ORG,
        code: "100001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: NOMAD, role: "student", status: "active" },
        ],
      },
    ]);

    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "South Mat",
        ownerUserId: OWNER,
      },
      h.exec,
    );
    south = made.entityId;

    const [row] = await h.exec
      .select({ code: entity.publicCode })
      .from(entity)
      .where(eq(entity.id, south));
    southCode = row?.code ?? "";

    await h.exec
      .update(academyProfile)
      .set({ publicBookingEnabled: true })
      .where(eq(academyProfile.entityId, ORG));
    await h.exec
      .update(academyProfile)
      .set({ publicBookingEnabled: true })
      .where(eq(academyProfile.entityId, south));
    await h.exec
      .update(entity)
      .set({ timeZone: "Europe/Kyiv" })
      .where(eq(entity.id, south));

    await h.exec.insert(entityMembership).values({
      id: "emem_south_nomad",
      organizationId: ORG,
      entityId: south,
      userId: NOMAD,
      role: "student",
      status: "active",
      joinedAt: new Date(),
    });

    await seedClasses(h.pg, [
      {
        id: CLASS_NORTH,
        academyId: ORG,
        instructorId: OWNER,
        title: "North Gi",
        startsInMinutes: 120,
        publicBookable: true,
      },
      {
        id: CLASS_SOUTH,
        academyId: south,
        instructorId: OWNER,
        title: "South No-gi",
        startsInMinutes: 180,
        publicBookable: true,
      },
    ]);
  });

  afterAll(() => h.close());

  it("gives the two mats different six-digit codes", () => {
    expect(southCode).toHaveLength(6);
    expect(southCode).not.toBe("100001");
  });

  it("resolves a code to the academy that owns it", async () => {
    const found = await h
      .as(NOMAD, ORG)
      .academy.findByCode({ code: southCode });
    expect([found?.academyId, found?.name]).toEqual([south, "South Mat"]);
  });

  it("tells a walk-in which mat the poster belongs to", async () => {
    const info = await h.as(NOMAD, ORG).dropIn.academyInfo({
      academyId: south,
    });
    expect([info.name, info.timeZone]).toEqual(["South Mat", "Europe/Kyiv"]);
  });

  it("renames one mat and leaves its sibling alone", async () => {
    await h
      .as(
        OWNER,
        ORG,
        (() => {
          const headers = new Headers();
          headers.set("x-matops-entity", south);
          return headers;
        })(),
      )
      .academy.rename({ name: "South Mat, renamed" });

    const rows = await h.exec
      .select({ id: entity.id, name: entity.name })
      .from(entity);
    const byId = new Map(rows.map((r) => [r.id, r.name]));
    expect(byId.get(south)).toBe("South Mat, renamed");
    expect(byId.get(ORG)).toBe("Academy org_alma");
  });

  it("lists both mats for a student who trains at both", async () => {
    const mine = await h.as(NOMAD, ORG).academy.listMineStudent();
    expect(mine.map((a) => a.academyId).sort()).toEqual([ORG, south].sort());
  });

  it("follows the header when the student switches mat", async () => {
    const named = (id: string) => {
      const headers = new Headers();
      headers.set("x-matops-entity", id);
      return headers;
    };
    const north = await h.as(NOMAD, ORG, named(ORG)).academy.current();
    const other = await h.as(NOMAD, ORG, named(south)).academy.current();
    expect([north?.academyId, other?.academyId]).toEqual([ORG, south]);
    expect(other?.timeZone).toBe("Europe/Kyiv");
  });
});
