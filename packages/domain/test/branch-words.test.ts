import { describe, expect, it } from "vitest";

import {
  branchWords,
  openingLabel,
  sessionCount,
  shareActions,
} from "../src/branch-words";

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

describe("openingLabel", () => {
  it("names the place rather than the row", () => {
    expect(openingLabel("bjj_academy")).toBe("Opening your academy");
    expect(openingLabel("general_space")).toBe("Opening your space");
  });
});

describe("sessionCount", () => {
  it("leads with the count and spells the plural", () => {
    expect(sessionCount("bjj_academy", 3)).toBe("3 classes");
    expect(sessionCount("general_space", 2)).toBe("2 sessions");
  });

  it("keeps the singular at one, and says zero in the plural", () => {
    expect(sessionCount("bjj_academy", 1)).toBe("1 class");
    expect(sessionCount("bjj_academy", 0)).toBe("0 classes");
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
