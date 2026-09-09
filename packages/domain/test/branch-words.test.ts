import { describe, expect, it } from "vitest";

import { branchWords, shareActions } from "../src/branch-words";

describe("branchWords", () => {
  it("calls a BJJ branch an academy and its sessions classes", () => {
    expect(branchWords("bjj_academy")).toEqual({
      branch: "academy",
      branchPlural: "academies",
      session: "class",
      sessionPlural: "classes",
    });
  });

  it("calls anything else a space, with sessions", () => {
    expect(branchWords("general_space").branch).toBe("space");
    expect(branchWords("general_space").session).toBe("session");
  });

  it("treats a type it does not know as a space, never as a mat", () => {
    // A branch type nobody has implemented must not be described as an academy:
    // belts, curriculum and the visitor poster are all BJJ-only promises.
    expect(branchWords("sauna").branch).toBe("space");
  });
});
describe("shareActions", () => {
  it("offers a mat the trial booking, the drop-in poster and the join link", () => {
    expect(shareActions("bjj_academy")).toEqual(["booking", "checkin", "join"]);
  });

  it("offers a general space the join link only", () => {
    expect(shareActions("general_space")).toEqual(["join"]);
  });

  it("gives an unknown type the join link only", () => {
    expect(shareActions("sauna")).toEqual(["join"]);
  });

  it("offers joining at every type, so no branch can be unreachable", () => {
    for (const type of ["bjj_academy", "general_space", "sauna", ""]) {
      expect(shareActions(type)).toContain("join");
    }
  });
});
