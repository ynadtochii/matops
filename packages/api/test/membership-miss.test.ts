import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const CLASS_A = "aaaaaaaa-0000-4000-8000-000000000201";

let h: Harness;

beforeAll(async () => {
  h = await harness();
  await seedAcademies(h.pg, [
    {
      id: "org_a",
      code: "100001",
      members: [
        { userId: "usr_owner_a", role: "owner", status: "active" },
        { userId: "usr_student_a", role: "student", status: "active" },
      ],
    },
    {
      id: "org_b",
      code: "100002",
      members: [{ userId: "usr_owner_b", role: "owner", status: "active" }],
    },
  ]);
  await seedClasses(h.pg, [
    {
      id: CLASS_A,
      academyId: "org_a",
      instructorId: "usr_owner_a",
      startsInMinutes: -30,
    },
  ]);
});

afterAll(async () => {
  await h.close();
});

describe("a user who is not in the academy", () => {
  it("cannot switch into an academy they do not belong to", async () => {
    expect(
      await rejectionCode(
        h.as("usr_owner_a", "org_a").academy.setActive({ academyId: "org_b" }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("answers the same for an academy that does not exist", async () => {
    expect(
      await rejectionCode(
        h.as("usr_owner_a", "org_a").academy.setActive({ academyId: "org_zz" }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("cannot be added as a walk-in", async () => {
    expect(
      await rejectionCode(
        h.as("usr_owner_a", "org_a").attendance.addWalkIn({
          classId: CLASS_A,
          studentId: "usr_owner_b",
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("still lets a real member be added as a walk-in", async () => {
    await expect(
      h.as("usr_owner_a", "org_a").attendance.addWalkIn({
        classId: CLASS_A,
        studentId: "usr_student_a",
      }),
    ).resolves.toBeDefined();
  });
});
