import { describe, expect, it } from "vitest";

import { canCreateGym } from "../src/gym-creator";

describe("canCreateGym", () => {
  it("lets a listed email in", () => {
    expect(canCreateGym("owner@alma.pt", "owner@alma.pt")).toBe(true);
  });

  it("matches any entry in a comma-separated list", () => {
    expect(canCreateGym("b@gym.com", "a@gym.com,b@gym.com,c@gym.com")).toBe(
      true,
    );
  });

  it("ignores case and spaces", () => {
    expect(canCreateGym(" Owner@Alma.PT ", "a@gym.com , owner@alma.pt ")).toBe(
      true,
    );
  });

  it("refuses an email that is not listed", () => {
    expect(canCreateGym("stranger@x.com", "owner@alma.pt")).toBe(false);
  });

  it("refuses everyone when the list is unset or empty", () => {
    expect(canCreateGym("owner@alma.pt", undefined)).toBe(false);
    expect(canCreateGym("owner@alma.pt", "")).toBe(false);
    expect(canCreateGym("owner@alma.pt", " , ")).toBe(false);
  });

  it("refuses an empty email even when the list has an empty entry", () => {
    expect(canCreateGym("", "owner@alma.pt,")).toBe(false);
  });

  it("does not match on part of an entry", () => {
    expect(canCreateGym("owner@alma.p", "owner@alma.pt")).toBe(false);
  });
});
