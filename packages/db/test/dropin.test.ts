import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { bookVisitor, cancelVisitorBooking, createDropIn } from "../src/dropin";
import { execOn, freshDb, single } from "./helpers";

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

const COLS = "(academy_id, first_name, last_name, phone, consent)";
const vals = (academyId: string, phone: string) =>
  `('${academyId}', 'Sam', 'Lee', '${phone}', true)`;

const count = (tx: Tx, where = ""): Promise<number> =>
  tx
    .query<{ n: number }>(`SELECT count(*)::int AS n FROM "drop_in" ${where}`)
    .then((r) => single(r).n);

/** Owner reads of `drop_in` are tenant-scoped (slice 3.5); public writes bypass. */
describe("RLS — drop_in isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    // Seed as the bootstrap superuser (mimics the base-connection public write).
    await pg.exec(
      `INSERT INTO "drop_in" ${COLS} VALUES
        ${vals("academy_A", "111")}, ${vals("academy_A", "222")}, ${vals("academy_B", "333")};`,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  it("an owner sees only their academy's leads", async () => {
    expect(await asTenant(pg, "academy_A", (tx) => count(tx))).toBe(2);
    expect(await asTenant(pg, "academy_B", (tx) => count(tx))).toBe(1);
  });

  it("cannot INSERT a lead for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "drop_in" ${COLS} VALUES ${vals("academy_B", "evil")}`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("fails closed when app.academy_id is unset", async () => {
    const n = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return count(tx);
    });
    expect(n).toBe(0);
  });
});

const CLASS_MON = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLASS_WED = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CLASS_OTHER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

async function seedClasses(pg: PGlite) {
  await pg.exec(
    `INSERT INTO "class" (id, academy_id, instructor_id, title, starts_at, duration_minutes, capacity, booking_count) VALUES
      ('${CLASS_MON}', 'academy_A', 'user_1', 'Monday', now(), 60, 20, 0),
      ('${CLASS_WED}', 'academy_A', 'user_1', 'Wednesday', now(), 60, 20, 0),
      ('${CLASS_OTHER}', 'academy_B', 'user_2', 'Other gym', now(), 60, 20, 0);`,
  );
}

const lead = (phone: string, classId: string | null, consent = true) => ({
  academyId: "academy_A",
  firstName: "Sam",
  lastName: "Lee",
  phone,
  email: null as string | null,
  classId,
  consent,
  source: "wall_qr" as const,
});

describe("drop_in dedupe by phone, one visit row per class (ADR 115)", () => {
  let pg: PGlite;
  let db: ReturnType<typeof execOn>;

  const visitsOn = (classId: string) =>
    pg
      .query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "drop_in_visit" WHERE class_id = $1`,
        [classId],
      )
      .then((r) => single(r).n);

  beforeEach(async () => {
    pg = await freshDb();
    db = execOn(pg);
    await seedClasses(pg);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("a repeat phone reuses the lead instead of adding a row", async () => {
    await createDropIn(lead("5551234", CLASS_MON), db);
    await createDropIn(
      { ...lead("5551234", CLASS_WED), firstName: "Samuel" },
      db,
    );
    const rows = await pg.query<{ first_name: string }>(
      `SELECT first_name FROM "drop_in" WHERE phone='5551234'`,
    );
    expect(rows.rows.length).toBe(1);
    expect(single(rows).first_name).toBe("Samuel");
  });

  it("keeps a visitor on Monday's register after they turn up on Wednesday", async () => {
    await createDropIn(lead("5551234", CLASS_MON), db);
    await createDropIn(lead("5551234", CLASS_WED), db);
    expect(await visitsOn(CLASS_MON)).toBe(1);
    expect(await visitsOn(CLASS_WED)).toBe(1);
  });

  it("counts one visit per class, not per form submit", async () => {
    await createDropIn(lead("5551234", CLASS_MON), db);
    const again = await createDropIn(lead("5551234", CLASS_MON), db);
    expect(again.visitCount).toBe(1);
    const next = await createDropIn(lead("5551234", CLASS_WED), db);
    expect(next.visitCount).toBe(2);
  });

  it("records no visit when no class is on", async () => {
    const res = await createDropIn(lead("5551234", null), db);
    expect(res.visitCount).toBe(0);
    expect(await visitsOn(CLASS_MON)).toBe(0);
  });

  it("a staff-recorded visitor never clears a consent the visitor gave", async () => {
    await createDropIn(lead("5551234", null, true), db);
    await createDropIn(lead("5551234", null, false), db);
    const rows = await pg.query<{ consent: boolean }>(
      `SELECT consent FROM "drop_in" WHERE phone='5551234'`,
    );
    expect(single(rows).consent).toBe(true);
  });

  it("a staff-recorded visitor never erases the email the visitor left", async () => {
    await createDropIn(
      { ...lead("5551234", null), email: "sam@example.com" },
      db,
    );
    await createDropIn(lead("5551234", null), db);
    const rows = await pg.query<{ email: string | null }>(
      `SELECT email FROM "drop_in" WHERE phone='5551234'`,
    );
    expect(single(rows).email).toBe("sam@example.com");
  });

  it("a staff-recorded visitor starts without consent", async () => {
    await createDropIn(lead("5559999", null, false), db);
    const rows = await pg.query<{ consent: boolean }>(
      `SELECT consent FROM "drop_in" WHERE phone='5559999'`,
    );
    expect(single(rows).consent).toBe(false);
  });
});

describe("visitor bookings (ADR 115)", () => {
  let pg: PGlite;
  let db: ReturnType<typeof execOn>;

  const booking = (phone: string, classId: string, cancelToken: string) => ({
    ...lead(phone, null),
    classId,
    cancelToken,
  });

  beforeEach(async () => {
    pg = await freshDb();
    db = execOn(pg);
    await seedClasses(pg);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("the same phone posting twice to one class yields one booking", async () => {
    const first = await bookVisitor(booking("5551234", CLASS_MON, "tok-1"), db);
    const second = await bookVisitor(
      booking("5551234", CLASS_MON, "tok-2"),
      db,
    );
    expect(second.visitId).toBe(first.visitId);
    expect(second.cancelToken).toBe("tok-1");
    const rows = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "drop_in_visit"`,
    );
    expect(single(rows).n).toBe(1);
  });

  it("a booked visitor is unmarked, so a no-show can be recorded", async () => {
    await bookVisitor(booking("5551234", CLASS_MON, "tok-1"), db);
    const rows = await pg.query<{
      booking_status: string;
      attendance_status: string;
    }>(`SELECT booking_status, attendance_status FROM "drop_in_visit"`);
    expect(single(rows).booking_status).toBe("booked");
    expect(single(rows).attendance_status).toBe("unmarked");
  });

  it("a cancelled booking leaves the lead in place", async () => {
    await bookVisitor(booking("5551234", CLASS_MON, "tok-1"), db);
    expect(await cancelVisitorBooking("academy_A", "tok-1", db)).toBe(true);
    const visit = await pg.query<{ booking_status: string }>(
      `SELECT booking_status FROM "drop_in_visit"`,
    );
    expect(single(visit).booking_status).toBe("cancelled");
    const leads = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "drop_in" WHERE phone='5551234'`,
    );
    expect(single(leads).n).toBe(1);
  });

  it("one academy's key cannot cancel another academy's booking", async () => {
    await bookVisitor(booking("5551234", CLASS_MON, "tok-1"), db);
    expect(await cancelVisitorBooking("academy_B", "tok-1", db)).toBe(false);
  });

  it("an unknown token cancels nothing", async () => {
    expect(await cancelVisitorBooking("academy_A", "nope", db)).toBe(false);
  });
});

describe("RLS — drop_in_visit isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await seedClasses(pg);
    const db = execOn(pg);
    await createDropIn(lead("111", CLASS_MON), db);
    await createDropIn(lead("222", CLASS_WED), db);
    await createDropIn(
      { ...lead("333", CLASS_OTHER), academyId: "academy_B" },
      db,
    );
  });

  afterAll(async () => {
    await pg.close();
  });

  const visits = (tx: Tx): Promise<number> =>
    tx
      .query<{ n: number }>(`SELECT count(*)::int AS n FROM "drop_in_visit"`)
      .then((r) => single(r).n);

  it("an academy sees only its own visits", async () => {
    expect(await asTenant(pg, "academy_A", visits)).toBe(2);
    expect(await asTenant(pg, "academy_B", visits)).toBe(1);
  });

  it("cannot INSERT a visit for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "drop_in_visit" (academy_id, drop_in_id, class_id)
             SELECT 'academy_B', id, '${CLASS_OTHER}' FROM "drop_in" WHERE phone='111'`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("fails closed when app.academy_id is unset", async () => {
    const n = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return visits(tx);
    });
    expect(n).toBe(0);
  });
});
