import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode } from "./helpers";

const A = "discipline_academy_a";
const B = "discipline_academy_b";
const OWNER = "discipline_owner";
const MANAGER = "discipline_manager";
const COACH = "discipline_coach";
const STUDENT = "discipline_student";
const OTHER_OWNER = "discipline_other_owner";
const FUTURE = "c0000000-0000-4000-8000-000000000001";
const PAST = "c0000000-0000-4000-8000-000000000002";
const CANCELLED = "c0000000-0000-4000-8000-000000000003";
const FOREIGN = "c0000000-0000-4000-8000-000000000004";
const TEMPLATE = "d0000000-0000-4000-8000-000000000001";

const weekly = {
  title: "Gi fundamentals",
  daysOfWeek: [2],
  startsAtMinutes: 600,
  durationMinutes: 60,
  timeZone: "UTC",
  capacity: 20,
};

const oneOff = {
  title: "Open mat",
  date: "2035-04-18",
  startsAtMinutes: 600,
  durationMinutes: 60,
  timeZone: "UTC",
  capacity: 20,
};

describe("academy discipline catalog", () => {
  let h: Harness;
  const owner = () => h.as(OWNER, A);

  beforeEach(async () => {
    h = await harness([
      {
        id: A,
        code: "803001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
      {
        id: B,
        code: "803002",
        members: [{ userId: OTHER_OWNER, role: "owner", status: "active" }],
      },
    ]);
  });

  afterEach(async () => h.close());

  it("starts empty, allows managers to add and members to read, and rejects unauthorized writes", async () => {
    expect(await h.as(COACH, A).discipline.list()).toEqual([]);
    expect(
      await rejectionCode(h.as(COACH, A).discipline.add({ name: "Gi" })),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(h.as(STUDENT, A).discipline.add({ name: "Gi" })),
    ).toBe("FORBIDDEN");
    const row = await h.as(MANAGER, A).discipline.add({ name: "Gi" });
    expect(await h.as(COACH, A).discipline.list()).toEqual([row]);
    expect(await h.as(STUDENT, A).discipline.list()).toEqual([row]);
    expect(await h.as(OTHER_OWNER, B).discipline.list()).toEqual([]);
    expect(await rejectionCode(owner().discipline.add({ name: "gI" }))).toBe(
      "CONFLICT",
    );
    expect(
      await h.as(OTHER_OWNER, B).discipline.add({ name: "gi" }),
    ).toMatchObject({ name: "gi" });
    expect(
      await rejectionCode(
        h.as(OTHER_OWNER, B).discipline.remove({ id: row.id }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("rejects unknown labels on class and template writes, including template edits", async () => {
    expect(
      await rejectionCode(
        owner().class.create({ ...oneOff, discipline: "Judo" }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await rejectionCode(
        owner().template.create({ ...weekly, discipline: "Judo" }),
      ),
    ).toBe("BAD_REQUEST");
    await owner().discipline.add({ name: "Gi" });
    const row = await owner().template.create({ ...weekly, discipline: "Gi" });
    if (!row) throw new Error("template creation failed");
    expect(
      await rejectionCode(
        owner().template.update({ ...weekly, id: row.id, discipline: "Judo" }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      (await owner().template.list()).find((item) => item.id === row.id)
        ?.discipline,
    ).toBe("Gi");
    expect(
      (await owner().class.create({ ...oneOff, discipline: "Gi" }))?.discipline,
    ).toBe("Gi");
  });

  it("renames future one-offs and templates but leaves historic and cancelled classes unchanged", async () => {
    await owner().discipline.add({ name: "Gi" });
    await h.pg.query(
      `INSERT INTO "class_template" (id, academy_id, title, discipline, days_of_week, starts_at_minutes, duration_minutes, time_zone, capacity)
       VALUES ($1, $2, 'History', 'Gi', '{1}', 600, 60, 'UTC', 20)`,
      [TEMPLATE, A],
    );
    for (const [id, academyId, startsAt, status] of [
      [FUTURE, A, "2035-04-18", "scheduled"],
      [PAST, A, "2020-04-18", "scheduled"],
      [CANCELLED, A, "2035-04-18", "cancelled"],
      [FOREIGN, B, "2035-04-18", "scheduled"],
    ]) {
      await h.pg.query(
        `INSERT INTO "class" (id, academy_id, title, discipline, starts_at, duration_minutes, capacity, status)
         VALUES ($1, $2, 'History', 'Gi', $3, 60, 20, $4)`,
        [id, academyId, startsAt, status],
      );
    }
    const [gi] = await owner().discipline.list();
    if (!gi) throw new Error("missing catalog entry");
    await owner().discipline.add({ name: "Judo" });
    expect(
      await rejectionCode(
        owner().discipline.rename({ id: gi.id, name: "jUdO" }),
      ),
    ).toBe("CONFLICT");
    const renamed = await owner().discipline.rename({
      id: gi.id,
      name: "No Gi",
    });
    expect(renamed.name).toBe("No Gi");
    const rows = await h.pg.query<{ id: string; discipline: string | null }>(
      `SELECT id, discipline FROM "class" WHERE id IN ($1, $2, $3, $4) ORDER BY id`,
      [FUTURE, PAST, CANCELLED, FOREIGN],
    );
    expect(
      Object.fromEntries(rows.rows.map((row) => [row.id, row.discipline])),
    ).toEqual({
      [FUTURE]: "No Gi",
      [PAST]: "Gi",
      [CANCELLED]: "Gi",
      [FOREIGN]: "Gi",
    });
    expect(
      (
        await h.pg.query<{ discipline: string }>(
          `SELECT discipline FROM "class_template" WHERE id = $1`,
          [TEMPLATE],
        )
      ).rows[0]?.discipline,
    ).toBe("No Gi");
    expect(
      await rejectionCode(
        owner().discipline.rename({
          id: "00000000-0000-4000-8000-000000000000",
          name: "Unknown",
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(await owner().discipline.remove({ id: gi.id })).toEqual({
      ok: true,
    });
    expect(
      (
        await h.pg.query<{ discipline: string | null }>(
          `SELECT discipline FROM "class" WHERE id = $1`,
          [FUTURE],
        )
      ).rows[0]?.discipline,
    ).toBeNull();
    expect(
      (
        await h.pg.query<{ discipline: string | null }>(
          `SELECT discipline FROM "class" WHERE id = $1`,
          [PAST],
        )
      ).rows[0]?.discipline,
    ).toBe("Gi");
    expect(
      (
        await h.pg.query<{ discipline: string | null }>(
          `SELECT discipline FROM "class_template" WHERE id = $1`,
          [TEMPLATE],
        )
      ).rows[0]?.discipline,
    ).toBeNull();
    expect(await rejectionCode(owner().discipline.remove({ id: gi.id }))).toBe(
      "NOT_FOUND",
    );
    expect(
      await rejectionCode(
        owner().class.create({ ...oneOff, discipline: "No Gi" }),
      ),
    ).toBe("BAD_REQUEST");
  });
});
