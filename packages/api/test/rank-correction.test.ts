import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, memberId, seedAcademies } from "./helpers";

const ACADEMY = "academy_rank_correction";
const OWNER = "user_rank_owner";
const STUDENT = "user_rank_student";

describe("rank correction history", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACADEMY,
        code: "800075",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  it("keeps the previous rank, actor, and reason when staff clears it", async () => {
    const member = memberId(ACADEMY, STUDENT);
    const caller = h.as(OWNER, ACADEMY);
    await caller.rank.set({
      memberId: member,
      discipline: "bjj",
      belt: "White",
      stripes: 2,
    });
    await caller.rank.clear({
      memberId: member,
      discipline: "bjj",
      reason: "Recorded for the wrong student",
    });

    const result = await caller.rank.forMember({ memberId: member });
    expect(result.ranks).toEqual([]);
    expect(result.corrections[0]).toMatchObject({
      discipline: "bjj",
      fromBelt: "White",
      fromStripes: 2,
      toBelt: null,
      toStripes: null,
      reason: "Recorded for the wrong student",
      correctedBy: OWNER,
    });
  });
});
