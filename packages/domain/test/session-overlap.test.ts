import { describe, expect, it } from "vitest";

import type { SessionSpan } from "../src/session-overlap";
import {
  findOverlap,
  firstClash,
  sessionEnd,
  spansOverlap,
} from "../src/session-overlap";

const at = (iso: string, minutes = 60, id?: string): SessionSpan => ({
  id,
  startsAt: new Date(iso),
  durationMinutes: minutes,
});

describe("spansOverlap", () => {
  it("sees a straight clash", () => {
    expect(
      spansOverlap(at("2026-09-01T10:00:00Z"), at("2026-09-01T10:30:00Z")),
    ).toBe(true);
  });

  it("lets back-to-back sessions through", () => {
    expect(
      spansOverlap(at("2026-09-01T10:00:00Z"), at("2026-09-01T11:00:00Z")),
    ).toBe(false);
  });

  it("sees one session swallowing another", () => {
    expect(
      spansOverlap(
        at("2026-09-01T10:00:00Z", 180),
        at("2026-09-01T11:00:00Z", 30),
      ),
    ).toBe(true);
  });

  it("is the same answer whichever way round it is asked", () => {
    const a = at("2026-09-01T10:00:00Z", 90);
    const b = at("2026-09-01T11:00:00Z", 30);
    expect(spansOverlap(a, b)).toBe(spansOverlap(b, a));
  });

  it("leaves sessions on different days alone", () => {
    expect(
      spansOverlap(at("2026-09-01T10:00:00Z"), at("2026-09-02T10:00:00Z")),
    ).toBe(false);
  });

  it("ends a session where its duration says", () => {
    expect(sessionEnd(at("2026-09-01T10:00:00Z", 45)).toISOString()).toBe(
      "2026-09-01T10:45:00.000Z",
    );
  });
});

describe("findOverlap", () => {
  const existing = [
    at("2026-09-01T09:00:00Z", 60, "a"),
    at("2026-09-01T18:00:00Z", 60, "b"),
  ];

  it("names the session in the way", () => {
    expect(findOverlap(at("2026-09-01T18:30:00Z"), existing)?.id).toBe("b");
  });

  it("finds nothing in a free slot", () => {
    expect(findOverlap(at("2026-09-01T12:00:00Z"), existing)).toBeUndefined();
  });

  it("never trips a session over its own old row", () => {
    const moved = at("2026-09-01T09:05:00Z", 60, "a");
    expect(findOverlap(moved, existing)).toBeUndefined();
  });
});

describe("firstClash", () => {
  it("names the first proposed session that runs into an existing one", () => {
    const hit = firstClash(
      [at("2026-09-01T12:00:00Z"), at("2026-09-01T18:30:00Z")],
      [at("2026-09-01T18:00:00Z", 60, "b")],
    );
    expect([hit?.proposed.startsAt.toISOString(), hit?.clashesWith.id]).toEqual(
      ["2026-09-01T18:30:00.000Z", "b"],
    );
  });

  it("catches a run of new sessions clashing with each other", () => {
    const hit = firstClash(
      [at("2026-09-01T10:00:00Z", 120), at("2026-09-01T11:00:00Z")],
      [],
    );
    expect(hit?.proposed.startsAt.toISOString()).toBe(
      "2026-09-01T11:00:00.000Z",
    );
  });

  it("is happy with a full, tidy day", () => {
    expect(
      firstClash(
        [
          at("2026-09-01T10:00:00Z"),
          at("2026-09-01T11:00:00Z"),
          at("2026-09-01T12:00:00Z"),
        ],
        [],
      ),
    ).toBeUndefined();
  });
});
