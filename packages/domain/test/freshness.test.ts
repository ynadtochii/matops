import { describe, expect, it } from "vitest";

import {
  DEFAULT_STALE_MS,
  staleTimeForQueryKey,
  staleTimeMs,
} from "../src/freshness";

describe("staleTimeMs", () => {
  it("gives reference namespaces five minutes", () => {
    for (const path of [
      "academy.current",
      "academy.memberships",
      "academy.settings",
      "template.list",
      "rank.mine",
      "invite.resolve",
    ]) {
      expect(staleTimeMs(path)).toBe(300_000);
    }
  });

  it("gives stats two minutes", () => {
    for (const path of ["stats.dashboard", "stats.coaches"]) {
      expect(staleTimeMs(path)).toBe(120_000);
    }
  });

  it("gives badge counters one minute", () => {
    expect(staleTimeMs("notification.unreadCount")).toBe(60_000);
    expect(staleTimeMs("payments.claims")).toBe(60_000);
  });

  it("lets a full path override its namespace", () => {
    expect(staleTimeMs("payments.plans")).toBe(300_000);
    expect(staleTimeMs("payments.myDues")).toBe(DEFAULT_STALE_MS);
  });

  it("defaults anything a person can change mid-session", () => {
    for (const path of [
      "membership.members",
      "booking.mine",
      "class.week",
      "attendance.list",
      "dropIn.list",
    ]) {
      expect(staleTimeMs(path)).toBe(DEFAULT_STALE_MS);
    }
  });

  it("defaults an unknown procedure rather than caching it for minutes", () => {
    expect(staleTimeMs("somethingNew.list")).toBe(DEFAULT_STALE_MS);
    expect(staleTimeMs("")).toBe(DEFAULT_STALE_MS);
  });
});

describe("staleTimeForQueryKey", () => {
  it("reads the path out of a tRPC query key", () => {
    expect(
      staleTimeForQueryKey([["academy", "current"], { type: "query" }]),
    ).toBe(300_000);
    expect(
      staleTimeForQueryKey([
        ["stats", "gym"],
        { type: "query", input: { academyId: "a" } },
      ]),
    ).toBe(120_000);
  });

  it("defaults a key that is not a tRPC key", () => {
    expect(staleTimeForQueryKey(["session"])).toBe(DEFAULT_STALE_MS);
    expect(staleTimeForQueryKey([])).toBe(DEFAULT_STALE_MS);
    expect(staleTimeForQueryKey([[1, 2]])).toBe(DEFAULT_STALE_MS);
  });
});
