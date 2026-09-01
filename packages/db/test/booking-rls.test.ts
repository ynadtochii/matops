import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

/** Mirrors withScope (packages/db/src/tenant.ts): restricted role + entity GUC. */
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

// Fixed ids so participations can reference a known class (FK class_id → class).
const CLASS_A = "11111111-1111-1111-1111-111111111111";
const CLASS_B = "22222222-2222-2222-2222-222222222222";

async function seedClasses(pg: PGlite) {
  await pg.exec(
    `INSERT INTO "class" (id, academy_id, instructor_id, title, starts_at, duration_minutes, capacity, booking_count) VALUES
      ('${CLASS_A}', 'academy_A', 'user_1', 'A class', now() + interval '1 day', 60, 2, 0),
      ('${CLASS_B}', 'academy_B', 'user_1', 'B class', now() + interval '1 day', 60, 2, 0);`,
  );
}

const cpCount = (tx: Tx, where = ""): Promise<number> =>
  tx
    .query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "class_participation" ${where}`,
    )
    .then((res) => single(res).n);

/**
 * `class_participation` (slice 3.1) is tenant-scoped exactly like class /
 * class_template. The permanent regression net for the booking table's RLS.
 */
describe("RLS — class_participation isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await seedClasses(pg);
    await pg.exec(
      `INSERT INTO "class_participation" (academy_id, class_id, student_id, booking_tier) VALUES
        ('academy_A', '${CLASS_A}', 'stu_1', 'confirmed'),
        ('academy_A', '${CLASS_A}', 'stu_2', 'provisional'),
        ('academy_B', '${CLASS_B}', 'stu_3', 'confirmed');`,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  it("a tenant sees only its own academy's participations", async () => {
    expect(await asTenant(pg, "academy_A", (tx) => cpCount(tx))).toBe(2);
    expect(await asTenant(pg, "academy_B", (tx) => cpCount(tx))).toBe(1);
  });

  it("cannot see another academy's participations with an explicit filter", async () => {
    const n = await asTenant(pg, "academy_A", (tx) =>
      cpCount(tx, "WHERE academy_id = 'academy_B'"),
    );
    expect(n).toBe(0);
  });

  it("cannot INSERT a participation for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "class_participation" (academy_id, class_id, student_id, booking_tier)
             VALUES ('academy_B', '${CLASS_B}', 'evil', 'confirmed')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("fails closed when app.academy_id is unset", async () => {
    const n = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return cpCount(tx);
    });
    expect(n).toBe(0);
  });
});

// --- Booking write pattern (docs/issues/13) ----------------------------------
// These run the SAME two statements the booking resolver runs, against PGlite,
// to prove the atomicity/idempotency invariants the schema + write pattern give.

/** BOOK: idempotent participation upsert, then a confirmed-only count claim. */
async function book(
  tx: Tx,
  classId: string,
  studentId: string,
  tier: "confirmed" | "provisional",
) {
  const res = await tx.query<{ id: string }>(
    `INSERT INTO "class_participation" (academy_id, class_id, student_id, booking_status, booking_tier)
       VALUES (current_setting('app.academy_id', true), $1, $2, 'booked', $3)
     ON CONFLICT (class_id, student_id)
       DO UPDATE SET booking_status='booked', booking_tier=$3, cancelled_at=NULL
       WHERE "class_participation".booking_status <> 'booked'
     RETURNING id`,
    [classId, studentId, tier],
  );
  if (res.rows.length > 0 && tier === "confirmed") {
    await tx.query(
      `UPDATE "class" SET booking_count = booking_count + 1 WHERE id = $1`,
      [classId],
    );
  }
}

/** CANCEL: transition-if-booked, then a confirmed-only floored decrement. */
async function cancel(tx: Tx, classId: string, studentId: string) {
  const res = await tx.query<{ booking_tier: string }>(
    `UPDATE "class_participation" SET booking_status='cancelled', cancelled_at=now()
       WHERE class_id=$1 AND student_id=$2 AND booking_status='booked'
     RETURNING booking_tier`,
    [classId, studentId],
  );
  if (res.rows[0]?.booking_tier === "confirmed") {
    await tx.query(
      `UPDATE "class" SET booking_count = GREATEST(booking_count - 1, 0) WHERE id = $1`,
      [classId],
    );
  }
}

const bookingCount = (tx: Tx, classId: string): Promise<number> =>
  tx
    .query<{ booking_count: number }>(
      `SELECT booking_count FROM "class" WHERE id = $1`,
      [classId],
    )
    .then((res) => single(res).booking_count);

describe("booking write — atomicity & tiers", () => {
  let pg: PGlite;

  beforeEach(async () => {
    pg = await freshDb();
    await seedClasses(pg);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("a confirmed booking increments the count once, and is idempotent", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await book(tx, CLASS_A, "stu_1", "confirmed");
      await book(tx, CLASS_A, "stu_1", "confirmed"); // double-tap
      expect(await bookingCount(tx, CLASS_A)).toBe(1);
      expect(await cpCount(tx)).toBe(1); // UNIQUE(class,student) → one row
    });
  });

  it("a provisional booking is recorded but NEVER counted", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await book(tx, CLASS_A, "stu_2", "provisional");
      expect(await bookingCount(tx, CLASS_A)).toBe(0);
      expect(await cpCount(tx)).toBe(1);
    });
  });

  it("the count may exceed capacity (soft cap, never blocked)", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      // capacity is 2; three confirmed bookings still all succeed.
      await book(tx, CLASS_A, "stu_1", "confirmed");
      await book(tx, CLASS_A, "stu_2", "confirmed");
      await book(tx, CLASS_A, "stu_3", "confirmed");
      expect(await bookingCount(tx, CLASS_A)).toBe(3);
    });
  });

  it("cancel decrements a confirmed booking and floors at 0; re-cancel is a no-op", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await book(tx, CLASS_A, "stu_1", "confirmed");
      await cancel(tx, CLASS_A, "stu_1");
      expect(await bookingCount(tx, CLASS_A)).toBe(0);
      await cancel(tx, CLASS_A, "stu_1"); // already cancelled → no-op
      expect(await bookingCount(tx, CLASS_A)).toBe(0);
    });
  });

  it("cancelling a provisional booking does NOT touch the count", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await book(tx, CLASS_A, "stu_2", "provisional");
      await cancel(tx, CLASS_A, "stu_2");
      expect(await bookingCount(tx, CLASS_A)).toBe(0);
    });
  });

  it("re-booking a cancelled row flips it back and re-claims the spot", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await book(tx, CLASS_A, "stu_1", "confirmed");
      await cancel(tx, CLASS_A, "stu_1");
      await book(tx, CLASS_A, "stu_1", "confirmed"); // re-book
      expect(await bookingCount(tx, CLASS_A)).toBe(1);
      expect(await cpCount(tx)).toBe(1);
    });
  });

  // The pending-count subquery from class.week (slice 3.2): active provisional
  // bookings only — confirmed and cancelled are excluded.
  const pendingCount = (tx: Tx, classId: string): Promise<number> =>
    tx
      .query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "class_participation"
           WHERE class_id = $1 AND booking_status='booked' AND booking_tier='provisional'`,
        [classId],
      )
      .then((res) => single(res).n);

  it("pending count = active provisional only (excludes confirmed + cancelled)", async () => {
    await asTenant(pg, "academy_A", async (tx) => {
      await book(tx, CLASS_A, "stu_1", "confirmed");
      await book(tx, CLASS_A, "stu_2", "provisional");
      await book(tx, CLASS_A, "stu_3", "provisional");
      await cancel(tx, CLASS_A, "stu_3");
      expect(await pendingCount(tx, CLASS_A)).toBe(1); // only stu_2
      expect(await bookingCount(tx, CLASS_A)).toBe(1); // only stu_1 (confirmed)
    });
  });
});
