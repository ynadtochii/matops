import { describe, expect, it } from "vitest";

import {
  templateContentChanged,
  templateEditStrategy,
} from "../src/class-edit";

const base = {
  daysOfWeek: [1, 3],
  startsAtMinutes: 1140,
  timeZone: "Europe/Lisbon",
  title: "Gi Fundamentals",
  discipline: "bjj" as string | null,
  instructorId: "usr_1",
  durationMinutes: 60,
  capacity: 20,
  publicBookable: false,
};

describe("templateEditStrategy", () => {
  it("regenerates when the start time moves", () => {
    expect(templateEditStrategy(base, { ...base, startsAtMinutes: 1200 })).toBe(
      "regenerate",
    );
  });

  it("regenerates when the weekdays change", () => {
    expect(templateEditStrategy(base, { ...base, daysOfWeek: [1, 4] })).toBe(
      "regenerate",
    );
  });

  it("regenerates when the time zone changes", () => {
    expect(
      templateEditStrategy(base, { ...base, timeZone: "Europe/Madrid" }),
    ).toBe("regenerate");
  });

  it("ignores the order the weekdays arrive in", () => {
    expect(templateEditStrategy(base, { ...base, daysOfWeek: [3, 1] })).toBe(
      "none",
    );
  });

  it("updates in place for a content-only edit", () => {
    expect(templateEditStrategy(base, { ...base, capacity: 25 })).toBe(
      "update-in-place",
    );
    expect(templateEditStrategy(base, { ...base, instructorId: "usr_2" })).toBe(
      "update-in-place",
    );
  });

  it("updates in place when a template is shared or unshared", () => {
    expect(templateEditStrategy(base, { ...base, publicBookable: true })).toBe(
      "update-in-place",
    );
    const shared = { ...base, publicBookable: true };
    expect(
      templateEditStrategy(shared, { ...shared, publicBookable: false }),
    ).toBe("update-in-place");
  });

  it("does nothing when the save changed nothing", () => {
    expect(templateEditStrategy(base, { ...base })).toBe("none");
  });

  it("prefers regenerate when timing and content both moved", () => {
    expect(
      templateEditStrategy(base, {
        ...base,
        startsAtMinutes: 1200,
        capacity: 25,
      }),
    ).toBe("regenerate");
  });
});

describe("templateContentChanged", () => {
  it("sees every field the in-place update writes", () => {
    const fields = [
      { title: "Nogi" },
      { discipline: null },
      { instructorId: "usr_2" },
      { durationMinutes: 90 },
      { capacity: 25 },
      { publicBookable: true },
    ];
    for (const patch of fields) {
      expect(templateContentChanged(base, { ...base, ...patch })).toBe(true);
    }
  });

  it("does not fire on a timing change", () => {
    const moved = { ...base, startsAtMinutes: 1200 };
    expect(templateContentChanged(base, moved)).toBe(false);
  });
});
