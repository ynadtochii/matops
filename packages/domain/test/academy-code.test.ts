import { describe, expect, it } from "vitest";

import {
  ACADEMY_CODE_LENGTH,
  CODE_JOIN_ROLE,
  isValidAcademyCode,
} from "../src/academy-code";

describe("academy code", () => {
  it("accepts exactly six digits", () => {
    expect(isValidAcademyCode("482913")).toBe(true);
    expect(isValidAcademyCode("000000")).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isValidAcademyCode("12345")).toBe(false); // too short
    expect(isValidAcademyCode("1234567")).toBe(false); // too long
    expect(isValidAcademyCode("")).toBe(false);
    expect("482913".length).toBe(ACADEMY_CODE_LENGTH);
  });

  it("rejects non-digits", () => {
    expect(isValidAcademyCode("48a913")).toBe(false);
    expect(isValidAcademyCode("48 913")).toBe(false);
    expect(isValidAcademyCode(" 482913")).toBe(false); // must normalize first
  });

  it("code joins always grant the student role", () => {
    expect(CODE_JOIN_ROLE).toBe("student");
  });
});
