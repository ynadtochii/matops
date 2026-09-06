import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity } from "@matops/db";
import { entityMembership } from "@matops/db/schema";

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

describe("announcing to every branch", () => {
  const ORG = "academy_multi";
  const OTHER = "academy_multi_other";
  const BOSS = "u_multi_owner";
  const COACH = "u_multi_coach";
  const BOTH = "u_multi_both";
  const ONLY_MAT = "u_multi_mat";
  const STRANGER = "u_multi_stranger";
  let h: Harness;
  let gym: string;

  const owner = () => h.as(BOSS, ORG);

  const rowsFor = async (title: string) =>
    (
      await h.pg.query<{ academy_id: string; user_id: string }>(
        `SELECT academy_id, user_id FROM notification WHERE title = '${title}' ORDER BY academy_id, user_id`,
      )
    ).rows;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "100021",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: BOTH, role: "student", status: "active" },
          { userId: ONLY_MAT, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "100022",
        members: [{ userId: STRANGER, role: "owner", status: "active" }],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "bjj_academy",
        name: "Second Mat",
        ownerUserId: BOSS,
      },
      h.exec,
    );
    gym = made.entityId;
    await h.exec.insert(entityMembership).values({
      organizationId: ORG,
      entityId: gym,
      userId: BOTH,
      role: "student",
      status: "active",
    });
  });

  afterAll(() => h.close());

  it("is owner only", async () => {
    expect(
      await rejectionCode(
        h.as(COACH, ORG).notification.announceAll({
          title: "Everyone",
          body: "Hello",
          audience: "all",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("writes one inbox row per branch and pushes once per person", async () => {
    const res = await owner().notification.announceAll({
      title: "Gym closed Monday",
      body: "Every branch.",
      audience: "students",
    });
    // BOTH is a student at two branches, ONLY_MAT at one: three rows, two people.
    expect([res.rows, res.pushed]).toEqual([3, 2]);
    const rows = await rowsFor("Gym closed Monday");
    expect(rows.filter((r) => r.user_id === BOTH)).toHaveLength(2);
  });

  it("reaches only the branches the owner picked", async () => {
    const res = await owner().notification.announceAll({
      title: "Second mat only",
      body: "Just there.",
      audience: "students",
      entityIds: [gym],
    });
    expect([res.rows, res.pushed]).toEqual([1, 1]);
    const rows = await rowsFor("Second mat only");
    expect(rows.every((r) => r.academy_id === gym)).toBe(true);
  });

  it("never reaches another gym's branch", async () => {
    const res = await owner().notification.announceAll({
      title: "Not yours",
      body: "Nope.",
      audience: "all",
      entityIds: [OTHER],
    });
    expect(res.rows).toBe(0);
    expect(await rowsFor("Not yours")).toEqual([]);
  });

  it("counts each audience once per person across branches", async () => {
    // Four people across two branches: the owner counts once though they hold
    // a seat at both.
    expect(await owner().notification.audienceCountsAll()).toEqual({
      all: 4,
      students: 2,
      staff: 2,
    });
  });
});
