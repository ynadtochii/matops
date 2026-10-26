import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const A = "acad_switch_a";
const B = "acad_switch_b";
const OWNER_A = "u_switch_owner_a";
const MANAGER_A = "u_switch_manager_a";
const STUDENT_A = "u_switch_student_a";
const OWNER_B = "u_switch_owner_b";

describe("membership payments switch", () => {
  let h: Harness;

  const enforcedAt = async (id: string) =>
    (
      await h.pg.query<{ at: string | null }>(
        `SELECT membership_enforced_at AS at FROM "entity" WHERE id = '${id}'`,
      )
    ).rows[0]?.at ?? null;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: A,
        code: "700040",
        members: [
          { userId: OWNER_A, role: "owner", status: "active" },
          { userId: MANAGER_A, role: "manager", status: "active" },
          { userId: STUDENT_A, role: "student", status: "active" },
        ],
      },
      {
        id: B,
        code: "700041",
        members: [{ userId: OWNER_B, role: "owner", status: "active" }],
      },
    ]);
  });

  afterAll(() => h.close());

  it("refuses a manager and a student", async () => {
    for (const user of [MANAGER_A, STUDENT_A]) {
      expect([
        user,
        await rejectionCode(
          h.as(user, A).academy.setMembershipEnforced({ enforced: true }),
        ),
      ]).toEqual([user, "FORBIDDEN"]);
    }
    expect(await enforcedAt(A)).toBeNull();
  });

  it("turns payments on for the named academy only", async () => {
    const on = await h
      .as(OWNER_A, A)
      .academy.setMembershipEnforced({ enforced: true });
    expect(on.enforced).toBe(true);
    expect(
      (await h.as(STUDENT_A, A).academy.current())?.membershipEnforced,
    ).toBe(true);
    expect(await enforcedAt(B)).toBeNull();
  });

  it("keeps the first timestamp when turned on twice", async () => {
    const first = await enforcedAt(A);
    await h.as(OWNER_A, A).academy.setMembershipEnforced({ enforced: true });
    expect(await enforcedAt(A)).toEqual(first);
  });

  it("refuses an owner of another academy", async () => {
    expect(
      await rejectionCode(
        h.as(OWNER_B, A).academy.setMembershipEnforced({ enforced: false }),
      ),
    ).not.toBe("resolved without error");
    expect(await enforcedAt(A)).not.toBeNull();
  });

  it("turns payments off", async () => {
    const off = await h
      .as(OWNER_A, A)
      .academy.setMembershipEnforced({ enforced: false });
    expect(off.enforced).toBe(false);
    expect(await enforcedAt(A)).toBeNull();
    expect(
      (await h.as(STUDENT_A, A).academy.current())?.membershipEnforced,
    ).toBe(false);
  });
});
