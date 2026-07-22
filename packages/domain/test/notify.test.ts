import { describe, expect, it } from "vitest";

import {
  buildApprovalMessage,
  buildCancelledMessage,
  buildClassChangeMessage,
  buildDuesReminderMessage,
  buildReminderMessage,
  formatWhen,
  isInReminderWindow,
  REMINDER_LEAD_MINUTES,
  reminderRecipients,
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

  it("cancelled → push + email both name the class", () => {
    const m = buildCancelledMessage(base);
    expect(m.push.title).toBe("Class cancelled");
    expect(m.push.body).toContain("Fundamentals");
    expect(m.push.body).toContain("Kyiv BJJ");
    expect(m.email.subject).toContain("Fundamentals");
    expect(m.email.text).toContain("Sat 15 Aug, 18:00");
  });

  it("change → push + email", () => {
    const m = buildClassChangeMessage(base);
    expect(m.push.title).toBe("Class updated");
    expect(m.push.body).toContain("Fundamentals");
    expect(m.email.subject).toContain("Updated");
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

describe("isInReminderWindow", () => {
  const sweepMinutes = 30;
  // Class starts at 20:00; default lead 120 min → due at 18:00.
  const startsAt = new Date("2026-08-15T20:00:00Z");
  const due = new Date("2026-08-15T18:00:00Z");

  it("fires once now reaches the due point", () => {
    expect(isInReminderWindow(startsAt, due, { sweepMinutes })).toBe(true);
  });

  it("does not fire before the due point", () => {
    const before = new Date("2026-08-15T17:45:00Z");
    expect(isInReminderWindow(startsAt, before, { sweepMinutes })).toBe(false);
  });

  it("does not fire again after one sweep interval passed the due point", () => {
    const late = new Date("2026-08-15T18:31:00Z");
    expect(isInReminderWindow(startsAt, late, { sweepMinutes })).toBe(false);
  });

  it("does not fire for an already-started class", () => {
    // Short lead so the due point is after start; still must not fire post-start.
    const soon = new Date("2026-08-15T20:05:00Z");
    expect(
      isInReminderWindow(startsAt, soon, { leadMinutes: 5, sweepMinutes: 60 }),
    ).toBe(false);
  });

  it("respects a custom lead time", () => {
    const at60 = new Date("2026-08-15T19:00:00Z");
    expect(
      isInReminderWindow(startsAt, at60, { leadMinutes: 60, sweepMinutes }),
    ).toBe(true);
    expect(REMINDER_LEAD_MINUTES).toBe(120);
  });
});

describe("reminderRecipients", () => {
  it("keeps only live bookings, deduped", () => {
    const r = reminderRecipients([
      { studentId: "a", bookingStatus: "booked" },
      { studentId: "b", bookingStatus: "cancelled" },
      { studentId: "c", bookingStatus: "none" },
      { studentId: "a", bookingStatus: "booked" },
    ]);
    expect(r.sort()).toEqual(["a"]);
  });

  it("empty for no bookings", () => {
    expect(reminderRecipients([])).toEqual([]);
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
    expect(m.push.title).toBe("Membership due soon");
    expect(m.push.body).toContain("USD 50.00");
    expect(m.push.body).toContain("Ronin BJJ");
    expect(m.push.body).toContain("10 Aug");
    expect(m.email.text).toContain("I paid");
  });

  it("overdue message switches the title + wording", () => {
    const m = buildDuesReminderMessage({
      academyName: "Ronin BJJ",
      amountLabel: "USD 50.00",
      dueLabel: "10 Aug",
      overdue: true,
    });
    expect(m.push.title).toBe("Payment overdue");
    expect(m.push.body).toContain("overdue");
    expect(m.email.subject).toContain("Overdue");
  });
});
