import { describe, expect, it } from "vitest";

import { postLoginTarget } from "../src/entity";

const mat = {
  academyId: "e_north",
  organizationId: "org_a",
  name: "North Mat",
};
const gymFloor = {
  academyId: "e_gym",
  organizationId: "org_a",
  name: "The Gym",
};
const other = { academyId: "e_beta", organizationId: "org_b", name: "Beta" };

describe("postLoginTarget", () => {
  it("sends a person with nothing at all to the join screen", () => {
    expect(postLoginTarget([], [])).toEqual({ kind: "join" });
  });

  it("opens the gym of an owner who has no branch yet", () => {
    expect(
      postLoginTarget([], [{ organizationId: "org_a", name: "Alma" }]),
    ).toEqual({ kind: "openGym", organizationId: "org_a", name: "Alma" });
  });

  it("prefers an owned gym over the join screen, which is the dead end", () => {
    const target = postLoginTarget(
      [],
      [{ organizationId: "org_a", name: "Alma" }],
    );
    expect(target.kind).not.toBe("join");
  });

  it("opens the one branch a student belongs to", () => {
    expect(postLoginTarget([mat], [])).toEqual({
      kind: "openBranch",
      academyId: "e_north",
      name: "North Mat",
    });
  });

  it("counts gyms, not branches, so two mats of one gym ask nothing", () => {
    expect(postLoginTarget([mat, gymFloor], [])).toMatchObject({
      kind: "openBranch",
      academyId: "e_north",
    });
  });

  it("asks which gym when the person belongs to two", () => {
    expect(postLoginTarget([mat, other], [])).toEqual({
      kind: "pick",
      gyms: [mat, other],
    });
  });

  it("ignores an owned gym once a branch tie exists", () => {
    expect(
      postLoginTarget([mat], [{ organizationId: "org_a", name: "Alma" }]),
    ).toMatchObject({ kind: "openBranch" });
  });
});
