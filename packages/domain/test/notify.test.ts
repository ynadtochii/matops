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

  it("change → push", () => {
    const m = buildClassChangeMessage(base);
    expect(m.title).toBe("Class updated");
    expect(m.body).toContain("Fundamentals");
  });

  it("approval → welcome push naming the academy", () => {
    const m = buildApprovalMessage({ academyName: "Kyiv BJJ" });
    expect(m.title).toBe("You're in!");
    expect(m.body).toContain("Kyiv BJJ");
  });
});
