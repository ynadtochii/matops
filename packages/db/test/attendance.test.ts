import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

function asTenant<T>(
  pg: PGlite,
  academyId: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE matops_app");
    await tx.query("SELECT set_config('app.academy_id', $1, true)", [
      academyId,
    ]);
    return run(tx);
  });
}

const CLASS_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function seed(pg: PGlite) {
  await pg.exec(
    `INSERT INTO "class" (id, academy_id, instructor_id, title, starts_at, duration_minutes, capacity, booking_count) VALUES
      ('${CLASS_A}', 'academy_A', 'user_1', 'A class', now(), 60, 20, 0);`,
  );
}

/** A confirmed booking (as slice 3.1's write would leave it). */
async function bookConfirmed(tx: Tx, studentId: string) {
  await tx.query(
    `INSERT INTO "class_participation" (academy_id, class_id, student_id, booking_status, booking_tier)
       VALUES (current_setting('app.academy_id', true), $1, $2, 'booked', 'confirmed')`,
    [CLASS_A, studentId],
  );
  await tx.query(
    `UPDATE "class" SET booking_count = booking_count + 1 WHERE id = $1`,
    [CLASS_A],
  );
}

/** Mark an existing participant present (attendance.mark). */
async function markPresent(tx: Tx, studentId: string) {
  await tx.query(
    `UPDATE "class_participation" SET attendance_status='present', attended_at=now(), marked_by='staff_1'
       WHERE class_id=$1 AND student_id=$2`,
    [CLASS_A, studentId],
  );
}

/** Add a walk-in (attendance.addWalkIn): booking none + attendance present. */
async function walkIn(tx: Tx, studentId: string) {
  await tx.query(
    `INSERT INTO "class_participation" (academy_id, class_id, student_id, booking_status, booking_tier, attendance_status, attended_at, marked_by)
       VALUES (current_setting('app.academy_id', true), $1, $2, 'none', 'confirmed', 'present', now(), 'staff_1')
     ON CONFLICT (class_id, student_id)
       DO UPDATE SET attendance_status='present', attended_at=now(), marked_by='staff_1'`,
    [CLASS_A, studentId],
  );
}

const field = (tx: Tx, studentId: string, col: string): Promise<string> =>
  tx
    .query<{ v: string }>(
      `SELECT ${col} AS v FROM "class_participation" WHERE class_id=$1 AND student_id=$2`,
      [CLASS_A, studentId],
    )
    .then((r) => single(r).v);

const bookingCount = (tx: Tx): Promise<number> =>
  tx
    .query<{ booking_count: number }>(
      `SELECT booking_count FROM "class" WHERE id=$1`,
      [CLASS_A],
    )
    .then((r) => single(r).booking_count);

describe("attendance — marks & walk-ins (slice 3.3)", () => {
  let pg: PGlite;

  beforeEach(async () => {
    pg = await freshDb();
    await seed(pg);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("marking a booked student present does not change the count", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await bookConfirmed(tx, "stu_1");
      await markPresent(tx, "stu_1");
      expect(await field(tx, "stu_1", "attendance_status")).toBe("present");
      expect(await bookingCount(tx)).toBe(1);
    });
  });

  it("a walk-in is booking 'none' + present and never touches the count", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await bookConfirmed(tx, "stu_1"); // count = 1
      await walkIn(tx, "stu_2"); // never booked
      expect(await field(tx, "stu_2", "booking_status")).toBe("none");
      expect(await field(tx, "stu_2", "attendance_status")).toBe("present");
      expect(await bookingCount(tx)).toBe(1); // unchanged by the walk-in
    });
  });

  it("adding a walk-in on a booked student keeps their booking, marks present", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await bookConfirmed(tx, "stu_1");
      await walkIn(tx, "stu_1"); // same person, already booked
      expect(await field(tx, "stu_1", "booking_status")).toBe("booked");
      expect(await field(tx, "stu_1", "attendance_status")).toBe("present");
      expect(await bookingCount(tx)).toBe(1);
    });
  });
});
