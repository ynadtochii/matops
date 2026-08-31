import { afterEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const A = "academy_A";
const OWNER = "u_owner";
const COACH = "u_coach";
const STUDENT = "u_student";
const SOON = "aaaaaaaa-0000-4000-8000-000000000001";
const FAR = "aaaaaaaa-0000-4000-8000-000000000002";

let open: Harness | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function base(): Promise<Harness> {
  const h = await harness();
  open = h;
  await seedAcademies(h.pg, [
    {
      id: A,
      code: "100001",
      members: [
        { userId: OWNER, role: "owner", status: "active" },
        { userId: COACH, role: "instructor", status: "active" },
        { userId: STUDENT, role: "student", status: "active" },
      ],
    },
  ]);
  return h;
}

describe("the links staff hand to someone asking about training", () => {
  it("lets an instructor read both links, and a student neither", async () => {
    const h = await base();
    await h.as(OWNER, A).academy.setPublicApi({ enabled: true });

    const coachLinks = await h.as(COACH, A).academy.shareLinks();
    expect(coachLinks.publicCode).toBe("100001");
    await expect(h.as(COACH, A).invite.list()).resolves.toBeInstanceOf(Array);

    expect(await rejectionCode(h.as(STUDENT, A).academy.shareLinks())).toBe(
      "FORBIDDEN",
    );
    expect(await rejectionCode(h.as(STUDENT, A).invite.list())).toBe(
      "FORBIDDEN",
    );
  });

  it("never hands the publishable key to an instructor", async () => {
    const h = await base();
    await h.as(OWNER, A).academy.setPublicApi({ enabled: true });

    const links = await h.as(COACH, A).academy.shareLinks();
    expect(Object.keys(links).sort()).toEqual([
      "bookingEnabled",
      "hasSharedClass",
      "publicCode",
    ]);
    expect(await rejectionCode(h.as(COACH, A).academy.publicApi())).toBe(
      "FORBIDDEN",
    );
  });

  it("reports the master switch, so staff know the link is dead", async () => {
    const h = await base();
    expect((await h.as(COACH, A).academy.shareLinks()).bookingEnabled).toBe(
      false,
    );

    await h.as(OWNER, A).academy.setPublicApi({ enabled: true });
    expect((await h.as(COACH, A).academy.shareLinks()).bookingEnabled).toBe(
      true,
    );
  });

  it("only counts a shared class the visitor's own week would show", async () => {
    const h = await base();
    await h.as(OWNER, A).academy.setPublicApi({ enabled: true });
    await seedClasses(h.pg, [
      {
        id: FAR,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: 60 * 24 * 8,
        publicBookable: true,
      },
    ]);
    expect((await h.as(COACH, A).academy.shareLinks()).hasSharedClass).toBe(
      false,
    );

    await seedClasses(h.pg, [
      {
        id: SOON,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: 60 * 24 * 2,
        publicBookable: true,
      },
    ]);
    expect((await h.as(COACH, A).academy.shareLinks()).hasSharedClass).toBe(
      true,
    );
  });

  it("does not count a class nobody ticked as shared", async () => {
    const h = await base();
    await h.as(OWNER, A).academy.setPublicApi({ enabled: true });
    await seedClasses(h.pg, [
      {
        id: SOON,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: 60 * 24 * 2,
        publicBookable: false,
      },
    ]);
    expect((await h.as(COACH, A).academy.shareLinks()).hasSharedClass).toBe(
      false,
    );
  });
});
