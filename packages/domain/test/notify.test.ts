import { describe, expect, it } from "vitest";

import {
  buildApprovalMessage,
  buildCancelledMessage,
  buildClassChangeMessage,
  formatWhen,
} from "../src/notify";

describe("formatWhen", () => {
  it("formats in the given time zone", () => {
    const at = new Date("2026-08-15T15:00:00Z"); // 18:00 Europe/Kyiv (UTC+3 summer)
    expect(formatWhen(at, "Europe/Kyiv")).toContain("18:00");
  });

  it("defaults to UTC", () => {
    const at = new Date("2026-08-15T15:00:00Z");
    expect(formatWhen(at)).toContain("15:00");
  });
});

describe("message builders", () => {
  const base = {
    academyName: "Kyiv BJJ",
    className: "Fundamentals",
    whenLabel: "Sat 15 Aug, 18:00",
  };

  it("cancelled → push naming the class + gym", () => {
    const m = buildCancelledMessage(base);
    expect(m.title).toBe("Class cancelled");
    expect(m.body).toContain("Fundamentals");
    expect(m.body).toContain("Kyiv BJJ");
    expect(m.body).toContain("Sat 15 Aug, 18:00");
  });

  it("change names the new coach and keeps the time", () => {
    const m = buildClassChangeMessage({ ...base, coachName: "Ana" });
    expect(m.title).toBe("New coach");
    expect(m.body).toBe(
      "Ana now teaches Fundamentals on Sat 15 Aug, 18:00 at Kyiv BJJ.",
    );
    expect(m.body).not.toContain("moved");
  });

  it("change without a coach name still says the coach changed", () => {
    const m = buildClassChangeMessage(base);
    expect(m.body).toBe(
      "Fundamentals on Sat 15 Aug, 18:00 at Kyiv BJJ has a new coach.",
    );
  });

  it("approval tells a student they can book", () => {
    const m = buildApprovalMessage({
      academyName: "Kyiv BJJ",
      role: "student",
    });
    expect(m.title).toBe("You're in at Kyiv BJJ");
    expect(m.body).toContain("book classes");
  });

  it("approval tells a coach about the schedule, not booking", () => {
    const m = buildApprovalMessage({
      academyName: "Kyiv BJJ",
      role: "instructor",
    });
    expect(m.title).toBe("You're in at Kyiv BJJ");
    expect(m.body).toContain("coach");
    expect(m.body).not.toContain("book");
  });
});
