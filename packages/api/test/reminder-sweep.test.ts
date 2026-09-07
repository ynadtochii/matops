import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import type { BatchPush } from "@matops/notifications";

import type { Harness } from "./helpers";
import { runReminderSweep } from "../src/notify";
import { harness, seedAcademies, seedClasses } from "./helpers";

const A = "academy_A";
const B = "academy_B";
const C_DUE = "aaaaaaaa-0000-4000-8000-000000000001";
const C_SOON = "aaaaaaaa-0000-4000-8000-000000000002";
const C_FAR = "aaaaaaaa-0000-4000-8000-000000000003";
const C_STARTED = "aaaaaaaa-0000-4000-8000-000000000004";
const C_EMPTY = "aaaaaaaa-0000-4000-8000-000000000005";
const C_DROPPED = "aaaaaaaa-0000-4000-8000-000000000006";
const C_OFF = "aaaaaaaa-0000-4000-8000-000000000007";
const C_DEL = "aaaaaaaa-0000-4000-8000-000000000008";
const C_OTHER = "aaaaaaaa-0000-4000-8000-000000000009";
const C_ONE = "aaaaaaaa-0000-4000-8000-000000000011";
const C_TWO = "aaaaaaaa-0000-4000-8000-000000000012";
const C_THREE = "aaaaaaaa-0000-4000-8000-000000000013";

interface Recorder {
  sent: BatchPush[];
  send: (messages: BatchPush[]) => Promise<unknown>;
}

function recorder(): Recorder {
  const sent: BatchPush[] = [];
  return {
    sent,
    send: (messages) => {
      sent.push(...messages);
      return Promise.resolve({ sent: messages.length, ok: true });
    },
  };
}

function exploding(): Recorder {
  return {
    sent: [],
    send: () => Promise.reject(new Error("expo is down")),
  };
}

let open: Harness | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function base(): Promise<Harness> {
  const h = await harness();
  open = h;
  await seedAcademies(h.pg, [
    {
      id: A,
      code: "100001",
      members: [
        { userId: "u_owner", role: "owner", status: "active" },
        { userId: "u_coach", role: "instructor", status: "active" },
        { userId: "u_ana", role: "student", status: "active", name: "Ana" },
        { userId: "u_bo", role: "student", status: "active", name: "Bo" },
        { userId: "u_gone", role: "student", status: "archived", name: "Gone" },
      ],
    },
    {
      id: B,
      code: "100002",
      members: [{ userId: "u_cy", role: "student", status: "active" }],
    },
  ]);
  return h;
}

async function givePushToken(pg: PGlite, userId: string): Promise<void> {
  await pg.exec(`
    INSERT INTO "push_token" (user_id, token, platform)
    VALUES ('${userId}', 'ExponentPushToken[${userId}]', 'ios');
  `);
}

async function book(
  pg: PGlite,
  classId: string,
  academyId: string,
  studentIds: string[],
  status = "booked",
): Promise<void> {
  const values = studentIds
    .map(
      (s) =>
        `(gen_random_uuid(), '${academyId}', '${classId}', '${s}', '${status}', 'confirmed', 'unmarked', now(), now(), now())`,
    )
    .join(",");
  await pg.exec(`
    INSERT INTO "class_participation" (id, academy_id, class_id, student_id, booking_status, booking_tier, attendance_status, booked_at, created_at, updated_at)
      VALUES ${values};
  `);
}

async function stampedAt(pg: PGlite, classId: string): Promise<Date | null> {
  const res = await pg.query<{ t: Date | null }>(
    `SELECT reminder_sent_at AS t FROM "class" WHERE id = $1`,
    [classId],
  );
  return res.rows[0]?.t ?? null;
}

async function inbox(
  pg: PGlite,
  kind: string,
): Promise<{ user_id: string; link: string | null }[]> {
  const res = await pg.query<{ user_id: string; link: string | null }>(
    `SELECT user_id, link FROM notification WHERE kind = $1 ORDER BY user_id`,
    [kind],
  );
  return res.rows;
}

describe("class reminder sweep", () => {
  it("claims a due class once and pushes every booked student", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: C_DUE,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: 60,
      },
    ]);
    await book(h.pg, C_DUE, A, ["u_ana", "u_bo"]);
    await givePushToken(h.pg, "u_ana");
    await givePushToken(h.pg, "u_bo");

    const first = recorder();
    const run = await runReminderSweep(h.exec, {
      now: new Date(),
      send: first.send,
    });

    expect(run.processed).toBe(1);
    expect(first.sent.map((m) => m.to).sort()).toEqual([
      "ExponentPushToken[u_ana]",
      "ExponentPushToken[u_bo]",
    ]);
    expect(await inbox(h.pg, "class_reminder")).toEqual([
      { user_id: "u_ana", link: `/class/${C_DUE}` },
      { user_id: "u_bo", link: `/class/${C_DUE}` },
    ]);

    const second = recorder();
    const again = await runReminderSweep(h.exec, {
      now: new Date(),
      send: second.send,
    });
    expect(again.processed).toBe(0);
    expect(second.sent).toEqual([]);
  });

  it("leaves alone a class outside the lead window on either side", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: C_SOON,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: 60,
      },
      {
        id: C_FAR,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: 600,
      },
      {
        id: C_STARTED,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: -30,
      },
    ]);
    await book(h.pg, C_SOON, A, ["u_ana"]);
    await book(h.pg, C_FAR, A, ["u_ana"]);
    await book(h.pg, C_STARTED, A, ["u_ana"]);

    const r = recorder();
    await runReminderSweep(h.exec, { now: new Date(), send: r.send });

    expect(await stampedAt(h.pg, C_SOON)).not.toBeNull();
    expect(await stampedAt(h.pg, C_FAR)).toBeNull();
    expect(await stampedAt(h.pg, C_STARTED)).toBeNull();
  });

  it("skips a class nobody has a live booking on", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: C_EMPTY,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: 60,
      },
      {
        id: C_DROPPED,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: 60,
      },
    ]);
    await book(h.pg, C_DROPPED, A, ["u_ana"], "cancelled");

    const r = recorder();
    const run = await runReminderSweep(h.exec, {
      now: new Date(),
      send: r.send,
    });

    expect(run.processed).toBe(0);
    expect(await stampedAt(h.pg, C_EMPTY)).toBeNull();
    expect(await stampedAt(h.pg, C_DROPPED)).toBeNull();
  });

  it("skips a cancelled class, a deleted class and a deleted academy", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: C_OFF,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: 60,
        status: "cancelled",
      },
      {
        id: C_DEL,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: 60,
      },
      {
        id: C_OTHER,
        academyId: B,
        instructorId: "u_cy",
        startsInMinutes: 60,
      },
    ]);
    await book(h.pg, C_OFF, A, ["u_ana"]);
    await book(h.pg, C_DEL, A, ["u_ana"]);
    await book(h.pg, C_OTHER, B, ["u_cy"]);
    await h.pg.exec(
      `UPDATE "class" SET deleted_at = now() WHERE id = '${C_DEL}';`,
    );
    await h.pg.exec(
      `UPDATE "entity" SET deleted_at = now() WHERE id = '${B}';`,
    );

    const r = recorder();
    const run = await runReminderSweep(h.exec, {
      now: new Date(),
      send: r.send,
    });

    expect(run.processed).toBe(0);
    expect(await stampedAt(h.pg, C_OFF)).toBeNull();
    expect(await stampedAt(h.pg, C_DEL)).toBeNull();
    expect(await stampedAt(h.pg, C_OTHER)).toBeNull();
  });

  it("bounds one run by the limit and picks the rest up next tick", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      { id: C_ONE, academyId: A, instructorId: "u_coach", startsInMinutes: 30 },
      { id: C_TWO, academyId: A, instructorId: "u_coach", startsInMinutes: 45 },
      {
        id: C_THREE,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: 60,
      },
    ]);
    await book(h.pg, C_ONE, A, ["u_ana"]);
    await book(h.pg, C_TWO, A, ["u_ana"]);
    await book(h.pg, C_THREE, A, ["u_ana"]);

    const r = recorder();
    const first = await runReminderSweep(h.exec, {
      now: new Date(),
      limit: 2,
      send: r.send,
    });
    expect(first.processed).toBe(2);
    expect(await stampedAt(h.pg, C_ONE)).not.toBeNull();
    expect(await stampedAt(h.pg, C_TWO)).not.toBeNull();
    expect(await stampedAt(h.pg, C_THREE)).toBeNull();

    const second = await runReminderSweep(h.exec, {
      now: new Date(),
      limit: 2,
      send: r.send,
    });
    expect(second.processed).toBe(1);
    expect(await stampedAt(h.pg, C_THREE)).not.toBeNull();
  });

  it("keeps the inbox copy and burns the claim when push is dead", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: C_DUE,
        academyId: A,
        instructorId: "u_coach",
        startsInMinutes: 60,
      },
    ]);
    await book(h.pg, C_DUE, A, ["u_ana"]);
    await givePushToken(h.pg, "u_ana");

    const dead = exploding();
    await runReminderSweep(h.exec, { now: new Date(), send: dead.send });

    expect(await inbox(h.pg, "class_reminder")).toEqual([
      { user_id: "u_ana", link: `/class/${C_DUE}` },
    ]);
    expect(await stampedAt(h.pg, C_DUE)).not.toBeNull();

    const retry = recorder();
    const again = await runReminderSweep(h.exec, {
      now: new Date(),
      send: retry.send,
    });
    expect(again.processed).toBe(0);
    expect(retry.sent).toEqual([]);
  });
});
