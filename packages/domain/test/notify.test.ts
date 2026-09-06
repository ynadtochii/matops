import { describe, expect, it } from "vitest";

import {
  ANNOUNCEMENT_AUDIENCES,
  announcementFanOut,
  announcementRecipients,
  buildAnnouncementMessage,
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

describe("announcementRecipients", () => {
  const roster = [
    { userId: "u_owner", role: "owner", status: "active" },
    { userId: "u_coach", role: "instructor", status: "active" },
    { userId: "u_student", role: "student", status: "active" },
    { userId: "u_pending", role: "student", status: "pending" },
    { userId: "u_suspended", role: "student", status: "suspended" },
  ];

  it("sends to every active member for 'all'", () => {
    expect(announcementRecipients(roster, "all")).toEqual([
      "u_owner",
      "u_coach",
      "u_student",
    ]);
  });

  it("splits staff and students without overlap", () => {
    const staff = announcementRecipients(roster, "staff");
    const students = announcementRecipients(roster, "students");
    expect(staff).toEqual(["u_owner", "u_coach"]);
    expect(students).toEqual(["u_student"]);
    expect(staff.concat(students).sort()).toEqual(
      announcementRecipients(roster, "all").sort(),
    );
  });

  it("never reaches pending, suspended or removed members", () => {
    for (const audience of ANNOUNCEMENT_AUDIENCES) {
      const ids = announcementRecipients(roster, audience);
      expect(ids).not.toContain("u_pending");
      expect(ids).not.toContain("u_suspended");
    }
  });

  it("dedupes a user who appears twice", () => {
    const twice = [
      { userId: "u_student", role: "student", status: "active" },
      { userId: "u_student", role: "student", status: "active" },
    ];
    expect(announcementRecipients(twice, "all")).toEqual(["u_student"]);
  });
});

describe("buildAnnouncementMessage", () => {
  const msg = buildAnnouncementMessage({
    title: "No class Friday",
    body: "The mats are being replaced.",
  });

  it("pushes the owner's own words, unwrapped", () => {
    expect(msg).toEqual({
      title: "No class Friday",
      body: "The mats are being replaced.",
    });
  });
});

describe("announcementFanOut", () => {
  it("gives one person at two branches two rows and one push", () => {
    const { rows, push } = announcementFanOut([
      { entityId: "e_mat", userIds: ["u_alex", "u_sam"] },
      { entityId: "e_gym", userIds: ["u_alex"] },
    ]);
    expect(rows).toHaveLength(3);
    expect(push.sort()).toEqual(["u_alex", "u_sam"]);
  });

  it("gives one person at one branch one row and one push", () => {
    const { rows, push } = announcementFanOut([
      { entityId: "e_mat", userIds: ["u_alex"] },
    ]);
    expect(rows).toEqual([{ entityId: "e_mat", userId: "u_alex" }]);
    expect(push).toEqual(["u_alex"]);
  });

  it("counts nobody twice when a branch lists them twice", () => {
    const { rows, push } = announcementFanOut([
      { entityId: "e_mat", userIds: ["u_alex", "u_alex"] },
    ]);
    expect(rows).toHaveLength(1);
    expect(push).toEqual(["u_alex"]);
  });

  it("returns nothing for no branches", () => {
    expect(announcementFanOut([])).toEqual({ rows: [], push: [] });
  });
});
