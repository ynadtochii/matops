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

const CLASS_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/** A class with capacity 1 so we can prove check-in works past capacity. */
async function seed(pg: PGlite) {
  await pg.exec(
    `INSERT INTO "class" (id, academy_id, instructor_id, title, starts_at, duration_minutes, capacity, booking_count) VALUES
      ('${CLASS_A}', 'academy_A', 'user_1', 'A class', now(), 60, 1, 0);`,
  );
}

/** Mirrors checkin.checkIn: book-if-needed + mark present, count on confirmed. */
async function checkIn(
  tx: Tx,
  studentId: string,
  tier: "confirmed" | "provisional",
) {
  const existing = await tx.query<{ booking_status: string }>(
    `SELECT booking_status FROM "class_participation" WHERE class_id=$1 AND student_id=$2`,
    [CLASS_A, studentId],
  );
  const willBook =
    existing.rows.length === 0 ||
    existing.rows[0]?.booking_status === "cancelled";
  if (willBook) {
    await tx.query(
      `INSERT INTO "class_participation" (academy_id, class_id, student_id, booking_status, booking_tier, attendance_status, attended_at)
         VALUES (current_setting('app.academy_id', true), $1, $2, 'booked', $3, 'present', now())
       ON CONFLICT (class_id, student_id) DO UPDATE SET
         booking_status='booked', booking_tier=$3, cancelled_at=NULL, attendance_status='present', attended_at=now()`,
      [CLASS_A, studentId, tier],
    );
    if (tier === "confirmed") {
      await tx.query(
        `UPDATE "class" SET booking_count = booking_count + 1 WHERE id = $1`,
        [CLASS_A],
      );
    }
  } else {
    await tx.query(
      `UPDATE "class_participation" SET attendance_status='present', attended_at=now()
         WHERE class_id=$1 AND student_id=$2`,
      [CLASS_A, studentId],
    );
  }
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

describe("QR check-in — book + attend (slice 3.4)", () => {
  let pg: PGlite;

  beforeEach(async () => {
    pg = await freshDb();
    await seed(pg);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("books and attends in one, and is idempotent on the count", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await checkIn(tx, "stu_1", "confirmed");
      await checkIn(tx, "stu_1", "confirmed"); // re-scan
      expect(await field(tx, "stu_1", "booking_status")).toBe("booked");
      expect(await field(tx, "stu_1", "attendance_status")).toBe("present");
      expect(await bookingCount(tx)).toBe(1);
    });
  });

  it("works even when the class is over capacity", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await checkIn(tx, "stu_1", "confirmed");
      await checkIn(tx, "stu_2", "confirmed"); // capacity is 1 — still allowed
      expect(await field(tx, "stu_2", "attendance_status")).toBe("present");
      expect(await bookingCount(tx)).toBe(2); // count may exceed capacity
    });
  });

  it("a pending member's check-in is provisional + present, never counted", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await checkIn(tx, "stu_3", "provisional");
      expect(await field(tx, "stu_3", "booking_tier")).toBe("provisional");
      expect(await field(tx, "stu_3", "attendance_status")).toBe("present");
      expect(await bookingCount(tx)).toBe(0);
    });
  });

  it("marks an already-booked student present without re-counting", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      // pre-existing confirmed booking (count already 1)
      await tx.query(
        `INSERT INTO "class_participation" (academy_id, class_id, student_id, booking_status, booking_tier)
           VALUES (current_setting('app.academy_id', true), $1, 'stu_1', 'booked', 'confirmed')`,
        [CLASS_A],
      );
      await tx.query(`UPDATE "class" SET booking_count=1 WHERE id=$1`, [
        CLASS_A,
      ]);
      await checkIn(tx, "stu_1", "confirmed");
      expect(await field(tx, "stu_1", "attendance_status")).toBe("present");
      expect(await bookingCount(tx)).toBe(1); // unchanged
    });
  });
});
