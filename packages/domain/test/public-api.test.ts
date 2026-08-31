import { describe, expect, it } from "vitest";

import {
  BOOKING_CUTOFF_MINUTES,
  isPubliclyBookable,
  originAllowed,
  PUBLIC_ERROR_STATUS,
  publicClassView,
  publicClassWindow,
  publicInstant,
} from "../src/public-api";

const NOW = new Date("2026-09-01T10:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("publicClassWindow", () => {
  it("defaults to the next seven days from now", () => {
    const res = publicClassWindow({}, NOW);
    expect(res).toMatchObject({ ok: true, from: NOW });
    if (!res.ok) throw new Error("expected a window");
    expect(res.to.toISOString()).toBe("2026-09-08T10:00:00.000Z");
  });

  it("takes a start date and defaults the end seven days later", () => {
    const res = publicClassWindow({ from: "2026-10-01" }, NOW);
    if (!res.ok) throw new Error("expected a window");
    expect(res.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(res.to.toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });

  it("refuses a range longer than 31 days", () => {
    expect(
      publicClassWindow({ from: "2026-10-01", to: "2026-12-01" }, NOW),
    ).toMatchObject({ ok: false, field: "to" });
  });

  it("refuses an end before the start", () => {
    expect(
      publicClassWindow({ from: "2026-10-01", to: "2026-09-01" }, NOW),
    ).toMatchObject({ ok: false, field: "to" });
  });

  it("refuses a date that is not YYYY-MM-DD", () => {
    expect(publicClassWindow({ from: "01/10/2026" }, NOW)).toMatchObject({
      ok: false,
      field: "from",
    });
  });
});

describe("isPubliclyBookable", () => {
  it("is open well before the class", () => {
    expect(isPubliclyBookable(minutes(120), NOW)).toBe(true);
  });

  it("closes inside the cut-off", () => {
    expect(isPubliclyBookable(minutes(BOOKING_CUTOFF_MINUTES), NOW)).toBe(
      false,
    );
    expect(isPubliclyBookable(minutes(BOOKING_CUTOFF_MINUTES + 1), NOW)).toBe(
      true,
    );
  });

  it("closes once the class has started", () => {
    expect(isPubliclyBookable(minutes(-5), NOW)).toBe(false);
  });
});

describe("publicClassView", () => {
  const cls = {
    id: "c1",
    title: "Fundamentals gi",
    discipline: "bjj",
    startsAt: new Date("2026-09-01T17:30:00.000Z"),
    durationMinutes: 60,
  };

  it("returns the class in the academy's own zone with its offset", () => {
    expect(publicClassView(cls, "Europe/Lisbon", NOW).startsAt).toBe(
      "2026-09-01T18:30:00+01:00",
    );
  });

  it("returns only the five published fields plus bookable", () => {
    expect(
      Object.keys(publicClassView(cls, "Europe/Lisbon", NOW)).sort(),
    ).toEqual([
      "bookable",
      "discipline",
      "durationMinutes",
      "id",
      "startsAt",
      "title",
    ]);
  });

  it("never reports a class as unbookable for being full", () => {
    expect(publicClassView(cls, "Europe/Lisbon", NOW).bookable).toBe(true);
  });
});

describe("publicInstant", () => {
  it("keeps the winter offset for the same zone", () => {
    expect(
      publicInstant(new Date("2026-01-15T18:30:00.000Z"), "Europe/Lisbon"),
    ).toBe("2026-01-15T18:30:00Z");
  });
});

describe("originAllowed", () => {
  it("allows anything when no allowlist is set", () => {
    expect(originAllowed("https://anything.example", [])).toBe(true);
  });

  it("allows a listed origin and refuses the rest", () => {
    const list = ["https://almabjj.com"];
    expect(originAllowed("https://almabjj.com", list)).toBe(true);
    expect(originAllowed("https://evil.example", list)).toBe(false);
  });

  it("allows a request with no origin, which a server-rendered page sends", () => {
    expect(originAllowed(null, ["https://almabjj.com"])).toBe(true);
  });
});

describe("PUBLIC_ERROR_STATUS", () => {
  it("answers an unpublished class with 404, never 403", () => {
    expect(PUBLIC_ERROR_STATUS.class_not_found).toBe(404);
  });

  it("maps every documented code to its status", () => {
    expect(PUBLIC_ERROR_STATUS.invalid_key).toBe(401);
    expect(PUBLIC_ERROR_STATUS.class_closed).toBe(409);
    expect(PUBLIC_ERROR_STATUS.validation_error).toBe(422);
    expect(PUBLIC_ERROR_STATUS.rate_limited).toBe(429);
  });
});
