import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { requireClassFacts } from "../src/classes";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const ACAD = "acad_classes";
const OWNER = "u_classes_owner";
const CLASS = "aaaaaaaa-0000-4000-8000-000000000301";

let h: Harness;

beforeAll(async () => {
  h = await harness();
  await seedAcademies(h.pg, [
    {
      id: ACAD,
      code: "700040",
      members: [{ userId: OWNER, role: "owner", status: "active" }],
    },
  ]);
  await seedClasses(h.pg, [
    {
      id: CLASS,
      academyId: ACAD,
      instructorId: OWNER,
      startsInMinutes: 60,
    },
  ]);
});

afterAll(() => h.close());

describe("requireClassFacts", () => {
  it("returns the three facts every caller checks", async () => {
    const facts = await requireClassFacts(h.exec, CLASS);
    expect(facts.status).toBe("scheduled");
    expect(facts.deletedAt).toBeNull();
    expect(facts.startsAt).toBeInstanceOf(Date);
  });

  it("throws NOT_FOUND for a class that is not there", async () => {
    expect(
      await rejectionCode(
        requireClassFacts(h.exec, "aaaaaaaa-0000-4000-8000-0000000003ff"),
      ),
    ).toBe("NOT_FOUND");
  });
});
