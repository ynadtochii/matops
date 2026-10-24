import { describe, expect, it } from "vitest";

import {
  dropInPath,
  normalizePhone,
  returningLeadGate,
  VISITOR_LINK_DAYS,
  visitorClassChoices,
  visitorClassState,
} from "../src/dropin";

const TZ = "UTC";

const cls = (id: string, iso: string, over: Record<string, unknown> = {}) => ({
  id,
  startsAt: new Date(iso),
  durationMinutes: 60,
  status: "scheduled" as const,
  ...over,
});

describe("normalizePhone", () => {
  it("collapses formatting but keeps the country marker", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("matches two formats of the same number", () => {
    expect(normalizePhone("555 123 4567")).toBe(normalizePhone("5551234567"));
    expect(normalizePhone("+351 912 345 678")).toBe(
      normalizePhone("+351-912-345-678"),
    );
  });

  it("leaves a number typed without a country code alone", () => {
    expect(normalizePhone("912 345 678")).toBe("912345678");
  });
});

describe("visitorClassState", () => {
  const now = new Date("2026-08-15T18:30:00Z");

  it("returns attend for a class currently running", () => {
    expect(visitorClassState(cls("a", "2026-08-15T18:00:00Z"), now, TZ)).toBe(
      "attend",
    );
  });

  it("returns book for a future class inside the 3-day window", () => {
    expect(visitorClassState(cls("a", "2026-08-15T21:00:00Z"), now, TZ)).toBe(
      "book",
    );
  });

  it("offers tomorrow and the last minute of the second following day", () => {
    expect(
      visitorClassState(cls("tomorrow", "2026-08-16T00:00:00Z"), now, TZ),
    ).toBe("book");
    expect(
      visitorClassState(cls("last", "2026-08-17T23:59:00Z"), now, TZ),
    ).toBe("book");
    expect(
      visitorClassState(cls("too-late", "2026-08-18T00:00:00Z"), now, TZ),
    ).toBeNull();
  });

  it("returns null for a class that already ended", () => {
    expect(
      visitorClassState(cls("a", "2026-08-15T17:00:00Z"), now, TZ),
    ).toBeNull();
  });

  it("returns null for a cancelled class", () => {
    expect(
      visitorClassState(
        cls("a", "2026-08-15T18:00:00Z", { status: "cancelled" }),
        now,
        TZ,
      ),
    ).toBeNull();
  });

  it("returns null for a class beyond the 3-day window", () => {
    expect(
      visitorClassState(cls("a", "2026-08-18T10:00:00Z"), now, TZ),
    ).toBeNull();
  });

  it("offers a class up to the end of the sixth following day with the link window", () => {
    expect(
      visitorClassState(
        cls("five-days", "2026-08-20T10:00:00Z"),
        now,
        TZ,
        VISITOR_LINK_DAYS,
      ),
    ).toBe("book");
    expect(
      visitorClassState(
        cls("last", "2026-08-21T23:59:00Z"),
        now,
        TZ,
        VISITOR_LINK_DAYS,
      ),
    ).toBe("book");
    expect(
      visitorClassState(
        cls("too-late", "2026-08-22T00:00:00Z"),
        now,
        TZ,
        VISITOR_LINK_DAYS,
      ),
    ).toBeNull();
  });

  it("respects the local timezone for the day boundary", () => {
    const nyNow = new Date("2026-08-15T18:00:00Z");
    const tz = "America/New_York";
    expect(
      visitorClassState(cls("inside", "2026-08-18T03:00:00Z"), nyNow, tz),
    ).toBe("book");
    expect(
      visitorClassState(cls("boundary", "2026-08-18T04:00:00Z"), nyNow, tz),
    ).toBeNull();
  });

  it("excludes yesterday's still-running class after local midnight", () => {
    const afterMidnight = new Date("2026-08-16T00:15:00Z");
    expect(
      visitorClassState(
        cls("yesterday", "2026-08-15T23:30:00Z", {
          durationMinutes: 120,
        }),
        afterMidnight,
        TZ,
      ),
    ).toBeNull();
    expect(
      visitorClassState(
        cls("today", "2026-08-16T00:00:00Z"),
        afterMidnight,
        TZ,
      ),
    ).toBe("attend");
  });
});

describe("visitorClassChoices", () => {
  const now = new Date("2026-08-15T18:30:00Z");

  it("puts a running class in now and a future class in upcoming", () => {
    const result = visitorClassChoices(
      [
        cls("running", "2026-08-15T18:00:00Z"),
        cls("later", "2026-08-15T21:00:00Z"),
      ],
      now,
      TZ,
    );
    expect(result.now.map((c) => c.id)).toEqual(["running"]);
    expect(result.upcoming.map((c) => c.id)).toEqual(["later"]);
  });

  it("lists only unfinished classes today and both following full days", () => {
    const result = visitorClassChoices(
      [
        cls("finished", "2026-08-15T17:00:00Z"),
        cls("running", "2026-08-15T18:00:00Z"),
        cls("later-today", "2026-08-15T20:00:00Z"),
        cls("tomorrow", "2026-08-16T00:00:00Z"),
        cls("last", "2026-08-17T23:59:00Z"),
        cls("too-late", "2026-08-18T00:00:00Z"),
      ],
      now,
      TZ,
    );
    expect(result.now.map((c) => c.id)).toEqual(["running"]);
    expect(result.upcoming.map((c) => c.id)).toEqual([
      "later-today",
      "tomorrow",
      "last",
    ]);
  });

  it("sorts upcoming by start time", () => {
    const result = visitorClassChoices(
      [cls("b", "2026-08-15T22:00:00Z"), cls("a", "2026-08-15T21:00:00Z")],
      now,
      TZ,
    );
    expect(result.upcoming.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("excludes ended and cancelled classes from both lists", () => {
    const result = visitorClassChoices(
      [
        cls("ended", "2026-08-15T17:00:00Z"),
        cls("cancelled", "2026-08-15T21:00:00Z", { status: "cancelled" }),
      ],
      now,
      TZ,
    );
    expect(result.now).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });

  it("excludes a class beyond the 3-day window", () => {
    const result = visitorClassChoices(
      [cls("far", "2026-08-18T10:00:00Z")],
      now,
      TZ,
    );
    expect(result.now).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });
});

describe("returningLeadGate", () => {
  const base = {
    consent: true,
    email: "a@example.com",
    belt: "White",
    waiverId: null as string | null,
  };

  it("returns ok when consent, email, and belt are present and no waiver is required", () => {
    expect(returningLeadGate(base, null)).toBe("ok");
  });

  it("returns full when consent is missing", () => {
    expect(returningLeadGate({ ...base, consent: false }, null)).toBe("full");
  });

  it("returns full when email is missing", () => {
    expect(returningLeadGate({ ...base, email: null }, null)).toBe("full");
  });

  it("returns full when belt is missing", () => {
    expect(returningLeadGate({ ...base, belt: null }, null)).toBe("full");
  });

  it("returns agreement when the stored waiver id is outdated", () => {
    expect(returningLeadGate({ ...base, waiverId: "old" }, "new")).toBe(
      "agreement",
    );
  });

  it("returns agreement when no waiver id is stored but one is required", () => {
    expect(returningLeadGate({ ...base, waiverId: null }, "required-id")).toBe(
      "agreement",
    );
  });

  it("returns ok when the waiver id matches the required one", () => {
    expect(returningLeadGate({ ...base, waiverId: "w1" }, "w1")).toBe("ok");
  });
});

describe("dropInPath", () => {
  it("is the bare link with no class and no sharer", () => {
    expect(dropInPath("tok", null)).toBe("/drop-in/tok");
  });

  it("names the class and the sharer", () => {
    expect(dropInPath("tok", "m1", "c1")).toBe("/drop-in/tok?class=c1&by=m1");
  });

  it("keeps the sharer without a class", () => {
    expect(dropInPath("tok", "m1")).toBe("/drop-in/tok?by=m1");
  });

  it("encodes unsafe characters", () => {
    expect(dropInPath("tok", "a b", "c&d")).toBe(
      "/drop-in/tok?class=c%26d&by=a%20b",
    );
  });
});
