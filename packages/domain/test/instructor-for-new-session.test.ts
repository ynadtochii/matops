import { describe, expect, it } from "vitest";

import { instructorForNewSession } from "../src/class-edit";

describe("instructorForNewSession", () => {
  const me = "usr_me";

  it("credits the staff member who saved a BJJ class", () => {
    expect(instructorForNewSession("bjj_academy", undefined, me)).toBe(me);
    expect(instructorForNewSession("bjj_academy", null, me)).toBe(me);
  });

  it("credits nobody at a general space", () => {
    expect(instructorForNewSession("general_space", undefined, me)).toBeNull();
    expect(instructorForNewSession("general_space", null, me)).toBeNull();
  });

  it("keeps an id the caller sent, whatever the type", () => {
    for (const type of ["bjj_academy", "general_space"]) {
      expect([type, instructorForNewSession(type, "usr_ana", me)]).toEqual([
        type,
        "usr_ana",
      ]);
    }
  });

  it("credits nobody for a type it does not know", () => {
    expect(instructorForNewSession("sauna", undefined, me)).toBeNull();
  });
});
