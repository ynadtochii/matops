import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { rebuildSchedule } from "../src/materialize";
import { execOn, freshDb, single } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACAD = "acad_rebuild";

const TEMPLATE_COLS =
  "(id, academy_id, instructor_id, title, days_of_week, starts_at_minutes, duration_minutes, time_zone, capacity, status)";

const CLASS_COLS =
  "(id, academy_id, template_id, instructor_id, title, starts_at, duration_minutes, capacity, status)";

/**
 * The owner's manual schedule rebuild (ADR 79). It is the only hard delete of a
 * class in the product, and it runs over rows students have booked, so what it
 * must NOT touch matters more than what it removes: past classes carry their
 * attendance on the same participation row as their booking, and a one-off is
 * hand-entered work nothing would recreate.
 */
describe("rebuildSchedule", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb(["acad_rebuild"]);
  });

  afterAll(() => pg.close());

  beforeEach(async () => {
    await pg.exec(`
      DELETE FROM "class_participation";
      DELETE FROM "drop_in_visit";
      DELETE FROM "drop_in";
      DELETE FROM "class";
      DELETE FROM "class_template";
    `);
  });

  const exec = () => execOn(pg);

  const count = (table: string, where = ""): Promise<number> =>
    pg
      .query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "${table}" ${where}`,
      )
      .then((res) => single(res).n);

  const exists = (table: string, where: string): Promise<boolean> =>
    count(table, `WHERE ${where}`).then((n) => n > 0);

  /** A daily template, so every day in the horizon is an occurrence. */
  const daily = (id: string, title: string, status = "active") =>
    pg.exec(
      `INSERT INTO "class_template" ${TEMPLATE_COLS} VALUES
       ('${id}', '${ACAD}', 'user_1', '${title}', '{0,1,2,3,4,5,6}', 600, 60, 'UTC', 20, '${status}')`,
    );

  const classAt = (
    id: string,
    templateId: string | null,
    startsAt: Date,
    status = "scheduled",
  ) =>
    pg.exec(
      `INSERT INTO "class" ${CLASS_COLS} VALUES
       ('${id}', '${ACAD}', ${templateId ? `'${templateId}'` : "NULL"}, 'user_1', 'Old',
        '${startsAt.toISOString()}', 60, 20, '${status}')`,
    );

  const book = (classId: string, studentId: string) =>
    pg.exec(
      `INSERT INTO "class_participation" (academy_id, class_id, student_id, booking_tier)
       VALUES ('${ACAD}', '${classId}', '${studentId}', 'confirmed')`,
    );

  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("refuses to cancel a paused template's class with an active booking", async () => {
    const t = uuid(1);
    const c = uuid(2);
    await daily(t, "Dropped", "paused");
    await classAt(c, t, new Date(Date.now() + 3 * DAY_MS));
    await book(c, "u_student");

    await expect(rebuildSchedule(exec())).rejects.toThrow(
      "1 stale class has active bookings",
    );
    expect(await exists("class", `id = '${c}' AND status = 'scheduled'`)).toBe(
      true,
    );
    expect(await count("class_participation")).toBe(1);
  });

  it("never touches a past class or its attendance", async () => {
    const t = uuid(3);
    const past = uuid(4);
    await daily(t, "Dropped", "paused");
    await classAt(past, t, new Date(Date.now() - 10 * DAY_MS));
    await book(past, "u_student");

    const res = await rebuildSchedule(exec());

    expect(res.deleted).toBe(0);
    expect(await exists("class", `id = '${past}'`)).toBe(true);
    expect(await count("class_participation")).toBe(1);
  });

  it("keeps a one-off the owner entered by hand", async () => {
    const seminar = uuid(5);
    await classAt(seminar, null, new Date(Date.now() + 5 * DAY_MS));

    const res = await rebuildSchedule(exec());

    expect(res.deleted).toBe(0);
    expect(await exists("class", `id = '${seminar}'`)).toBe(true);
  });

  it("regenerates the horizon from the active templates", async () => {
    const t = uuid(6);
    await daily(t, "Gi Fundamentals");

    const res = await rebuildSchedule(exec());

    expect(res.created).toBeGreaterThan(150);
    expect(await count("class")).toBe(res.created);
  });

  it("leaves a class the owner cancelled at a wanted instant cancelled", async () => {
    const t = uuid(7);
    await daily(t, "Gi Fundamentals");
    await rebuildSchedule(exec());
    const [row] = (
      await pg.query<{ id: string }>(
        `SELECT id FROM "class" WHERE starts_at > now() ORDER BY starts_at LIMIT 1`,
      )
    ).rows;
    await pg.exec(
      `UPDATE "class" SET status = 'cancelled' WHERE id = '${row?.id}'`,
    );

    await rebuildSchedule(exec());

    expect(
      await exists("class", `id = '${row?.id}' AND status = 'cancelled'`),
    ).toBe(true);
  });

  it("keeps a walk-in visit attached to the cancelled class", async () => {
    const t = uuid(8);
    const c = uuid(9);
    const lead = uuid(10);
    await daily(t, "Dropped", "paused");
    await classAt(c, t, new Date(Date.now() + 2 * DAY_MS));
    await pg.exec(
      `INSERT INTO "drop_in" (id, academy_id, first_name, last_name, phone, consent)
         VALUES ('${lead}', '${ACAD}', 'Ana', 'Silva', '+351900000000', true);
       INSERT INTO "drop_in_visit" (academy_id, drop_in_id, class_id)
         VALUES ('${ACAD}', '${lead}', '${c}');`,
    );

    const result = await rebuildSchedule(exec());

    expect(result.cancelled).toBe(1);
    expect(await count("drop_in")).toBe(1);
    expect(await count("drop_in_visit")).toBe(1);
    expect(await exists("class", `id = '${c}' AND status = 'cancelled'`)).toBe(
      true,
    );
  });

  it("removes a deleted template's future cancelled classes and keeps its past", async () => {
    const t = uuid(11);
    const future = uuid(12);
    const past = uuid(13);
    await daily(t, "Dropped");
    await pg.exec(
      `UPDATE "class_template" SET deleted_at = now() WHERE id = '${t}'`,
    );
    await classAt(future, t, new Date(Date.now() + 2 * DAY_MS), "cancelled");
    await classAt(past, t, new Date(Date.now() - 2 * DAY_MS), "cancelled");
    await book(future, "u_student");

    const res = await rebuildSchedule(exec());

    expect(res.deleted).toBe(1);
    expect(
      await exists("class", `id = '${future}' AND deleted_at IS NOT NULL`),
    ).toBe(true);
    expect(await exists("class", `id = '${past}' AND deleted_at IS NULL`)).toBe(
      true,
    );
    expect(await count("class_participation")).toBe(1);
  });
});
