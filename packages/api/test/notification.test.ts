import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const A = "academy_A";
const B = "academy_B";

async function seedFeed(pg: PGlite): Promise<void> {
  await pg.exec(`
    INSERT INTO notification (academy_id, user_id, kind, title, body, link, sent_by, created_at, read_at)
    VALUES
      ('${A}', 'u_student', 'class_cancelled', 'Class cancelled', 'gone', '/class/1', NULL, now() - interval '2 hours', NULL),
      ('${A}', 'u_student', 'announcement', 'Mats closed', 'Friday', '/notifications', 'Coach Ana', now() - interval '1 hour', NULL),
      ('${A}', 'u_student', 'dues_reminder', 'Membership due soon', 'pay up', '/payments', NULL, now() - interval '3 days', now()),
      ('${A}', 'u_owner', 'announcement', 'Owner copy', 'Friday', '/notifications', 'Coach Ana', now(), NULL),
      ('${B}', 'u_student', 'announcement', 'Other gym', 'not yours', '/notifications', NULL, now(), NULL);
  `);
}

describe("notification center", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: A,
        code: "100001",
        members: [
          { userId: "u_owner", role: "owner", status: "active" },
          { userId: "u_coach", role: "instructor", status: "active" },
          { userId: "u_student", role: "student", status: "active" },
          { userId: "u_pending", role: "student", status: "pending" },
        ],
      },
      {
        id: B,
        code: "100002",
        members: [{ userId: "u_student", role: "student", status: "active" }],
      },
    ]);
    await seedFeed(h.pg);
  });

  afterAll(async () => {
    await h.close();
  });

  it("shows the caller only their own rows in the active academy", async () => {
    const feed = await h.as("u_student", A).notification.list();
    expect(feed.map((n) => n.title)).toEqual([
      "Mats closed",
      "Class cancelled",
      "Membership due soon",
    ]);
  });

  it("keeps who posted an announcement, and nobody for system messages", async () => {
    const feed = await h.as("u_student", A).notification.list();
    expect(feed.map((n) => n.sentBy)).toEqual(["Coach Ana", null, null]);
  });

  it("switches feed with the active academy", async () => {
    const feed = await h.as("u_student", B).notification.list();
    expect(feed.map((n) => n.title)).toEqual(["Other gym"]);
  });

  it("counts only the caller's unread rows", async () => {
    expect(await h.as("u_student", A).notification.unreadCount()).toBe(2);
    expect(await h.as("u_owner", A).notification.unreadCount()).toBe(1);
  });

  it("marks the caller's feed read without touching anyone else's", async () => {
    await h.as("u_student", A).notification.markAllRead();
    expect(await h.as("u_student", A).notification.unreadCount()).toBe(0);
    expect(await h.as("u_owner", A).notification.unreadCount()).toBe(1);
    expect(await h.as("u_student", B).notification.unreadCount()).toBe(1);
  });

  it("refuses a pending member", async () => {
    expect(await rejectionCode(h.as("u_pending", A).notification.list())).toBe(
      "FORBIDDEN",
    );
  });
});

describe("announcements", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: A,
        code: "100001",
        members: [
          { userId: "u_owner", role: "owner", status: "active" },
          { userId: "u_coach", role: "instructor", status: "active" },
          { userId: "u_s1", role: "student", status: "active" },
          { userId: "u_s2", role: "student", status: "active" },
          { userId: "u_pending", role: "student", status: "pending" },
          { userId: "u_gone", role: "student", status: "removed" },
        ],
      },
    ]);
  });

  afterAll(async () => {
    await h.close();
  });

  it("counts each audience without the inactive members", async () => {
    expect(await h.as("u_owner", A).notification.audienceCounts()).toEqual({
      all: 4,
      students: 2,
      staff: 2,
    });
  });

  it("reports how many people the post reached", async () => {
    const res = await h.as("u_owner", A).notification.announce({
      title: "No class Friday",
      body: "The mats are being replaced.",
      audience: "students",
    });
    expect(res.sent).toBe(2);
  });

  it("lets an instructor post too", async () => {
    const res = await h.as("u_coach", A).notification.announce({
      title: "Cover needed",
      body: "Tuesday 7pm",
      audience: "staff",
    });
    expect(res.sent).toBe(2);
    expect(await h.as("u_coach", A).notification.audienceCounts()).toEqual({
      all: 4,
      students: 2,
      staff: 2,
    });
  });

  it("refuses a student", async () => {
    expect(
      await rejectionCode(
        h.as("u_s1", A).notification.announce({
          title: "Cover needed",
          body: "Tuesday 7pm",
          audience: "staff",
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(h.as("u_s1", A).notification.audienceCounts()),
    ).toBe("FORBIDDEN");
  });

  it("rejects an empty title after sanitizing", async () => {
    expect(
      await rejectionCode(
        h.as("u_owner", A).notification.announce({
          title: "​ ​",
          body: "body",
          audience: "all",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });
});
