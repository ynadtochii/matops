import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, seedAcademies } from "./helpers";

const ACAD = "acad_tpl_edit";
const OWNER = "u_tpl_owner";
const STUDENT = "u_tpl_student";
const COACH = "u_tpl_coach";

interface ClassRow {
  id: string;
  starts_at: string;
  status: string;
}

async function classRows(h: Harness): Promise<ClassRow[]> {
  const res = await h.pg.query<ClassRow>(
    `SELECT id, starts_at, status FROM "class" ORDER BY starts_at ASC`,
  );
  return res.rows;
}

async function participationCount(h: Harness): Promise<number> {
  const res = await h.pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "class_participation" WHERE booking_status = 'booked'`,
  );
  return res.rows[0]?.n ?? -1;
}

const base = {
  title: "Gi Fundamentals",
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startsAtMinutes: 600,
  durationMinutes: 60,
  timeZone: "UTC",
  capacity: 20,
};

describe("template timing edit with live bookings", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACAD,
        code: "700030",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
        ],
      },
    ]);
  });

  afterAll(() => h.close());

  beforeEach(async () => {
    await h.pg.exec(`
      DELETE FROM "class_participation";
      DELETE FROM "class";
      DELETE FROM "class_template";
    `);
  });

  const staff = () => h.as(OWNER, ACAD);

  async function templateWithABooking() {
    const template = await staff().template.create(base);
    if (!template) throw new Error("expected a template");
    const [first] = await classRows(h);
    if (!first) throw new Error("expected a materialized class");
    await h.as(STUDENT, ACAD).booking.book({ classId: first.id });
    return { template, bookedClassId: first.id };
  }

  it("moving the start time keeps the booked class instead of deleting it", async () => {
    const { template, bookedClassId } = await templateWithABooking();

    await staff().template.update({
      ...base,
      id: template.id,
      startsAtMinutes: 660,
    });

    const rows = await classRows(h);
    const booked = rows.find((r) => r.id === bookedClassId);
    expect(booked?.status).toBe("cancelled");
    expect(await participationCount(h)).toBe(1);
  });

  it("an occurrence the new timing still covers comes back scheduled", async () => {
    const { template, bookedClassId } = await templateWithABooking();
    const [before] = await classRows(h);
    if (!before) throw new Error("expected a materialized class");
    const bookedDay = new Date(before.starts_at).getUTCDay();

    await staff().template.update({
      ...base,
      id: template.id,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6].filter(
        (d) => d !== (bookedDay + 1) % 7,
      ),
    });

    const rows = await classRows(h);
    const booked = rows.find((r) => r.id === bookedClassId);
    expect(booked?.status).toBe("scheduled");
    expect(await participationCount(h)).toBe(1);
  });

  it("another coach editing the template does not steal the instructor", async () => {
    const template = await staff().template.create(base);
    if (!template) throw new Error("expected a template");
    expect(template.instructorId).toBe(OWNER);

    const updated = await h
      .as(COACH, ACAD)
      .template.update({ ...base, id: template.id, title: "No-gi" });
    expect(updated.instructorId).toBe(OWNER);
  });
});
