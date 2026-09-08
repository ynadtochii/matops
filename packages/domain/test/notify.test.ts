import { describe, expect, it } from "vitest";

import {
  buildApprovalMessage,
  buildCancelledMessage,
  buildClassChangeMessage,
  buildDuesReminderMessage,
  buildReminderMessage,
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

  it("reminder → push naming the class + when", () => {
    const m = buildReminderMessage({
      className: "Fundamentals",
      whenLabel: "in 2 hours",
    });
    expect(m.body).toContain("Fundamentals");
    expect(m.body).toContain("in 2 hours");
  });
});

describe("buildDuesReminderMessage", () => {
  it("due-soon message names the amount, gym, and due date", () => {
    const m = buildDuesReminderMessage({
      academyName: "Ronin BJJ",
      amountLabel: "USD 50.00",
      dueLabel: "10 Aug",
      overdue: false,
    });
    expect(m.title).toBe("Membership due soon");
    expect(m.body).toContain("USD 50.00");
    expect(m.body).toContain("Ronin BJJ");
    expect(m.body).toContain("10 Aug");
  });

  it("overdue message switches the title + wording", () => {
    const m = buildDuesReminderMessage({
      academyName: "Ronin BJJ",
      amountLabel: "USD 50.00",
      dueLabel: "10 Aug",
      overdue: true,
    });
    expect(m.title).toBe("Payment overdue");
    expect(m.body).toContain("overdue");
  });
});
