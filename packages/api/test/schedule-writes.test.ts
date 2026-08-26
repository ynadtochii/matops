import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import {
  harness,
  rejectionCode,
  seedAcademies,
  seedClasses,
  seedParticipations,
} from "./helpers";

const A = "academy_A";
const OWNER = "u_owner";
const COACH = "u_coach";
const ANA = "u_ana";

const TPL = "bbbbbbbb-0000-4000-8000-000000000001";
const PAST = "aaaaaaaa-0000-4000-8000-000000000001";
const FUTURE = "aaaaaaaa-0000-4000-8000-000000000002";
const ONE_OFF = "aaaaaaaa-0000-4000-8000-000000000003";
const ALREADY_OFF = "aaaaaaaa-0000-4000-8000-000000000004";

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
        { userId: OWNER, role: "owner", status: "active" },
        { userId: COACH, role: "instructor", status: "active" },
        { userId: ANA, role: "student", status: "active", name: "Ana" },
      ],
    },
  ]);
  return h;
}

async function seedTemplate(pg: PGlite): Promise<void> {
  await pg.exec(`
    INSERT INTO "class_template"
      (id, academy_id, instructor_id, title, days_of_week, starts_at_minutes,
       duration_minutes, time_zone, capacity, status, created_at, updated_at)
    VALUES
      ('${TPL}', '${A}', '${COACH}', 'Gi Fundamentals', '{1,3}', 1140, 60,
       'Europe/Lisbon', 20, 'active', now(), now());
  `);
}

async function attach(pg: PGlite, classId: string): Promise<void> {
  await pg.exec(
    `UPDATE "class" SET template_id = '${TPL}' WHERE id = '${classId}';`,
  );
}

async function statusOf(pg: PGlite, classId: string): Promise<string | null> {
  const res = await pg.query<{ status: string; deleted_at: Date | null }>(
    `SELECT status, deleted_at FROM "class" WHERE id = $1`,
    [classId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return row.deleted_at ? "deleted" : row.status;
}

async function templateDeleted(pg: PGlite): Promise<boolean> {
  const res = await pg.query<{ deleted_at: Date | null }>(
    `SELECT deleted_at FROM "class_template" WHERE id = $1`,
    [TPL],
  );
  return res.rows[0]?.deleted_at !== null;
}

describe("template.delete", () => {
  it("cancels the future classes it generated and keeps the past ones", async () => {
    const h = await base();
    await seedTemplate(h.pg);
    await seedClasses(h.pg, [
      { id: PAST, academyId: A, instructorId: COACH, startsInMinutes: -2880 },
      { id: FUTURE, academyId: A, instructorId: COACH, startsInMinutes: 2880 },
    ]);
    await attach(h.pg, PAST);
    await attach(h.pg, FUTURE);

    await h.as(OWNER, A).template.delete({ id: TPL });

    expect(await templateDeleted(h.pg)).toBe(true);
    expect(await statusOf(h.pg, FUTURE)).toBe("cancelled");
    expect(await statusOf(h.pg, PAST)).toBe("scheduled");
  });

  it("keeps the booking rows on a cancelled class, so history survives", async () => {
    const h = await base();
    await seedTemplate(h.pg);
    await seedClasses(h.pg, [
      { id: FUTURE, academyId: A, instructorId: COACH, startsInMinutes: 2880 },
    ]);
    await attach(h.pg, FUTURE);
    await seedParticipations(h.pg, [
      { classId: FUTURE, academyId: A, studentId: ANA },
    ]);

    await h.as(OWNER, A).template.delete({ id: TPL });

    const rows = await h.pg.query(
      `SELECT id FROM "class_participation" WHERE class_id = $1`,
      [FUTURE],
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("leaves a one-off class alone", async () => {
    const h = await base();
    await seedTemplate(h.pg);
    await seedClasses(h.pg, [
      { id: ONE_OFF, academyId: A, instructorId: COACH, startsInMinutes: 2880 },
    ]);

    await h.as(OWNER, A).template.delete({ id: TPL });
    expect(await statusOf(h.pg, ONE_OFF)).toBe("scheduled");
  });

  it("refuses a template that is already deleted", async () => {
    const h = await base();
    await seedTemplate(h.pg);
    await h.as(OWNER, A).template.delete({ id: TPL });
    expect(
      await rejectionCode(h.as(OWNER, A).template.delete({ id: TPL })),
    ).toBe("NOT_FOUND");
  });

  it("refuses a student and allows an instructor, who runs the desk", async () => {
    const h = await base();
    await seedTemplate(h.pg);
    expect(await rejectionCode(h.as(ANA, A).template.delete({ id: TPL }))).toBe(
      "FORBIDDEN",
    );
    await expect(h.as(COACH, A).template.delete({ id: TPL })).resolves.toEqual({
      ok: true,
    });
  });
});

describe("template.rebuild", () => {
  it("is owner-only, because it regenerates everyone's calendar", async () => {
    const h = await base();
    await seedTemplate(h.pg);
    expect(await rejectionCode(h.as(COACH, A).template.rebuild())).toBe(
      "FORBIDDEN",
    );
    expect(await rejectionCode(h.as(ANA, A).template.rebuild())).toBe(
      "FORBIDDEN",
    );
  });

  it("names the damage before it is done, and the count matches", async () => {
    const h = await base();
    await seedTemplate(h.pg);
    await seedClasses(h.pg, [
      { id: FUTURE, academyId: A, instructorId: COACH, startsInMinutes: 2880 },
    ]);
    await attach(h.pg, FUTURE);
    await seedParticipations(h.pg, [
      { classId: FUTURE, academyId: A, studentId: ANA },
    ]);

    const preview = await h.as(OWNER, A).template.rebuildPreview();
    expect(preview.toDelete).toBeGreaterThan(0);
    expect(preview.bookingsAffected).toBe(1);
  });

  it("never touches a past class or a one-off", async () => {
    const h = await base();
    await seedTemplate(h.pg);
    await seedClasses(h.pg, [
      { id: PAST, academyId: A, instructorId: COACH, startsInMinutes: -2880 },
      { id: ONE_OFF, academyId: A, instructorId: COACH, startsInMinutes: 2880 },
    ]);
    await attach(h.pg, PAST);

    await h.as(OWNER, A).template.rebuild();

    expect(await statusOf(h.pg, PAST)).toBe("scheduled");
    expect(await statusOf(h.pg, ONE_OFF)).toBe("scheduled");
  });

  it("fills the horizon from the active templates", async () => {
    const h = await base();
    await seedTemplate(h.pg);
    await h.as(OWNER, A).template.rebuild();

    const res = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "class"
        WHERE template_id = $1 AND starts_at > now()`,
      [TPL],
    );
    expect(res.rows[0]?.n ?? 0).toBeGreaterThan(0);
  });
});

describe("class.cancel", () => {
  it("cancels a scheduled class and tells the booked student", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      { id: FUTURE, academyId: A, instructorId: COACH, startsInMinutes: 2880 },
    ]);
    await seedParticipations(h.pg, [
      { classId: FUTURE, academyId: A, studentId: ANA },
    ]);

    await h.as(COACH, A).class.cancel({ id: FUTURE });

    expect(await statusOf(h.pg, FUTURE)).toBe("cancelled");
    const inbox = await h.pg.query<{ user_id: string; kind: string }>(
      `SELECT user_id, kind FROM notification WHERE kind = 'class_cancelled'`,
    );
    expect(inbox.rows).toEqual([{ user_id: ANA, kind: "class_cancelled" }]);
  });

  it("refuses a class that is already cancelled, so nobody is told twice", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: ALREADY_OFF,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: 2880,
        status: "cancelled",
      },
    ]);
    await seedParticipations(h.pg, [
      { classId: ALREADY_OFF, academyId: A, studentId: ANA },
    ]);

    expect(
      await rejectionCode(h.as(COACH, A).class.cancel({ id: ALREADY_OFF })),
    ).toBe("NOT_FOUND");
    const inbox = await h.pg.query(
      `SELECT id FROM notification WHERE kind = 'class_cancelled'`,
    );
    expect(inbox.rows).toHaveLength(0);
  });

  it("refuses a student", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      { id: FUTURE, academyId: A, instructorId: COACH, startsInMinutes: 2880 },
    ]);
    expect(await rejectionCode(h.as(ANA, A).class.cancel({ id: FUTURE }))).toBe(
      "FORBIDDEN",
    );
    expect(await statusOf(h.pg, FUTURE)).toBe("scheduled");
  });
});
