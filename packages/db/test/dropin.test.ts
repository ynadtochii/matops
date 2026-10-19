import type { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import type { DropInAcademy } from "../src/dropin";
import {
  lookupReturningLead,
  submitDropInVisit,
  takeRateLimit,
} from "../src/dropin";
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

describe("RLS — drop_in isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
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

async function seedDropInLink(
  pg: PGlite,
  academyId: string,
  token: string,
): Promise<void> {
  await pg.exec(
    `INSERT INTO "drop_in_link" (academy_id, token, created_by)
       VALUES ('${academyId}', '${token}', 'test') ON CONFLICT DO NOTHING`,
  );
}

async function seedClass(
  pg: PGlite,
  opts: {
    id: string;
    academyId: string;
    startsInMinutes: number;
    durationMinutes?: number;
    status?: string;
    deleted?: boolean;
    capacity?: number;
    bookingCount?: number;
  },
): Promise<void> {
  const {
    id,
    academyId,
    startsInMinutes,
    durationMinutes = 60,
    status = "scheduled",
    deleted = false,
    capacity = 20,
    bookingCount = 0,
  } = opts;
  await pg.exec(
    `INSERT INTO "class" (id, academy_id, instructor_id, title, starts_at, duration_minutes, capacity, booking_count, status${deleted ? ", deleted_at" : ""})
       VALUES ('${id}', '${academyId}', 'test_user', 'Test Class',
               now() + interval '${startsInMinutes} minutes',
               ${durationMinutes}, ${capacity}, ${bookingCount}, '${status}'${deleted ? ", now()" : ""})
       ON CONFLICT (id) DO UPDATE SET
         starts_at = EXCLUDED.starts_at,
         status = EXCLUDED.status,
         booking_count = EXCLUDED.booking_count,
         deleted_at = EXCLUDED.deleted_at`,
  );
}

const CLASS_FUTURE = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const CLASS_NOW = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const CLASS_OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-000000000003";
const TOKEN_A = "test-token-academy-a";
const TOKEN_B = "test-token-academy-b";
const REVOKED_TOKEN = "revoked-token-x";

const NEW_VISITOR = {
  kind: "new" as const,
  token: TOKEN_A,
  email: "ana@example.com",
  phone: "+351911111111",
  firstName: "Ana",
  lastName: "Silva",
  consent: true as const,
  belt: "White",
};

describe("submitDropInVisit", () => {
  let pg: PGlite;
  let db: ReturnType<typeof execOn>;

  beforeEach(async () => {
    pg = await freshDb();
    db = execOn(pg);
    await seedDropInLink(pg, "academy_A", TOKEN_A);
    await seedDropInLink(pg, "academy_B", TOKEN_B);
    await pg.exec(
      `INSERT INTO "drop_in_link" (academy_id, token, created_by, revoked_at)
         VALUES ('academy_A', '${REVOKED_TOKEN}', 'test', now()) ON CONFLICT DO NOTHING`,
    );
    await seedClass(pg, {
      id: CLASS_FUTURE,
      academyId: "academy_A",
      startsInMinutes: 60,
    });
    await seedClass(pg, {
      id: CLASS_NOW,
      academyId: "academy_A",
      startsInMinutes: -10,
      durationMinutes: 60,
    });
    await seedClass(pg, {
      id: CLASS_OTHER,
      academyId: "academy_B",
      startsInMinutes: 60,
    });
  });

  afterEach(async () => {
    await pg.close();
  });

  it("books a future class and increments booking_count", async () => {
    const result = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_FUTURE },
      db,
    );
    expect(result).toMatchObject({ ok: true, mode: "book" });

    const visit = await pg.query<{
      booking_status: string;
      attendance_status: string;
    }>(`SELECT booking_status, attendance_status FROM "drop_in_visit"`);
    expect(single(visit)).toMatchObject({
      booking_status: "booked",
      attendance_status: "unmarked",
    });

    const cls = await pg.query<{ booking_count: number }>(
      `SELECT booking_count FROM "class" WHERE id = $1`,
      [CLASS_FUTURE],
    );
    expect(single(cls).booking_count).toBe(1);
  });

  it("repeated submit does not double the booking count", async () => {
    await submitDropInVisit({ ...NEW_VISITOR, classId: CLASS_FUTURE }, db);
    const second = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_FUTURE },
      db,
    );
    expect(second).toMatchObject({ ok: true });

    const cls = await pg.query<{ booking_count: number }>(
      `SELECT booking_count FROM "class" WHERE id = $1`,
      [CLASS_FUTURE],
    );
    expect(single(cls).booking_count).toBe(1);
  });

  it("records attendance present for a class that started", async () => {
    const result = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_NOW },
      db,
    );
    expect(result).toMatchObject({ ok: true, mode: "attend" });

    const visit = await pg.query<{ attendance_status: string }>(
      `SELECT attendance_status FROM "drop_in_visit"`,
    );
    expect(single(visit).attendance_status).toBe("present");
  });

  it("still books when the class is full (soft cap)", async () => {
    await seedClass(pg, {
      id: CLASS_FUTURE,
      academyId: "academy_A",
      startsInMinutes: 60,
      capacity: 1,
      bookingCount: 1,
    });
    const result = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_FUTURE },
      db,
    );
    expect(result).toMatchObject({ ok: true, mode: "book" });
  });

  it("fails with reason class for a cancelled class", async () => {
    await seedClass(pg, {
      id: CLASS_FUTURE,
      academyId: "academy_A",
      startsInMinutes: 60,
      status: "cancelled",
    });
    const result = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_FUTURE },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "class" });
  });

  it("fails with reason class for a deleted class", async () => {
    await seedClass(pg, {
      id: CLASS_FUTURE,
      academyId: "academy_A",
      startsInMinutes: 60,
      deleted: true,
    });
    const result = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_FUTURE },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "class" });
  });

  it("fails with reason class for a class that already ended", async () => {
    await seedClass(pg, {
      id: CLASS_FUTURE,
      academyId: "academy_A",
      startsInMinutes: -120,
      durationMinutes: 60,
    });
    const result = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_FUTURE },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "class" });
  });

  it("fails with reason class for a class beyond the 7-day window", async () => {
    await seedClass(pg, {
      id: CLASS_FUTURE,
      academyId: "academy_A",
      startsInMinutes: 60 * 24 * 8,
    });
    const result = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_FUTURE },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "class" });
  });

  it("fails with reason class for a class in another academy", async () => {
    const result = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_OTHER },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "class" });
  });

  it("fails with reason link for a rotated token", async () => {
    const result = await submitDropInVisit(
      { ...NEW_VISITOR, token: REVOKED_TOKEN, classId: CLASS_FUTURE },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "link" });
  });

  it("returning lead with matching email and phone books without changing the profile", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt)
         VALUES ('academy_A', 'Ana', 'Silva', '+351911111111', 'ana@example.com', true, 'Blue')`,
    );

    const result = await submitDropInVisit(
      {
        kind: "returning",
        token: TOKEN_A,
        email: "ana@example.com",
        phone: "+351911111111",
        classId: CLASS_FUTURE,
      },
      db,
    );
    expect(result).toMatchObject({ ok: true, mode: "book" });

    const lead = await pg.query<{ first_name: string; belt: string }>(
      `SELECT first_name, belt FROM "drop_in" WHERE phone = '+351911111111'`,
    );
    expect(single(lead)).toMatchObject({ first_name: "Ana", belt: "Blue" });
  });

  it("fails with no-match when only the phone matches", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt)
         VALUES ('academy_A', 'Ana', 'Silva', '+351911111111', 'other@example.com', true, 'Blue')`,
    );

    const result = await submitDropInVisit(
      {
        kind: "returning",
        token: TOKEN_A,
        email: "ana@example.com",
        phone: "+351911111111",
        classId: CLASS_FUTURE,
      },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "no-match" });
  });

  it("fails with phone-taken when new kind uses a phone already saved with a different email", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent)
         VALUES ('academy_A', 'Ana', 'Silva', '+351911111111', 'other@example.com', true)`,
    );

    const result = await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_FUTURE },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "phone-taken" });
  });

  it("new kind with same phone and email fills missing answers without replacing the name", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent)
         VALUES ('academy_A', 'OriginalName', 'Silva', '+351911111111', 'ana@example.com', true)`,
    );

    await submitDropInVisit(
      { ...NEW_VISITOR, classId: CLASS_FUTURE, firstName: "NewName" },
      db,
    );

    const lead = await pg.query<{ first_name: string; belt: string | null }>(
      `SELECT first_name, belt FROM "drop_in" WHERE phone = '+351911111111'`,
    );
    expect(single(lead).first_name).toBe("OriginalName");
    expect(single(lead).belt).toBe("White");
  });
});

describe("submitDropInVisit — agreement gate", () => {
  let pg: PGlite;
  let db: ReturnType<typeof execOn>;
  let waiverId: string;

  beforeEach(async () => {
    pg = await freshDb();
    db = execOn(pg);
    await seedDropInLink(pg, "academy_A", TOKEN_A);
    await seedClass(pg, {
      id: CLASS_FUTURE,
      academyId: "academy_A",
      startsInMinutes: 60,
    });

    await pg.exec(
      `UPDATE "entity" SET waiver_required = true WHERE id = 'academy_A'`,
    );
    const waiver = await pg.query<{ id: string }>(
      `INSERT INTO "academy_waiver" (academy_id, body, created_by)
         VALUES ('academy_A', 'Test waiver text', 'admin')
         RETURNING id`,
    );
    waiverId = single(waiver).id;
  });

  afterEach(() => pg.close());

  it("fails with agreement when the lead has an outdated waiver", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt, waiver_id)
         VALUES ('academy_A', 'Ana', 'Silva', '+351911111111', 'ana@example.com', true, 'Blue', '${waiverId}')`,
    );
    await pg.exec(
      `INSERT INTO "academy_waiver" (academy_id, body, created_by)
         VALUES ('academy_A', 'Updated waiver text', 'admin')`,
    );

    const result = await submitDropInVisit(
      {
        kind: "returning",
        token: TOKEN_A,
        email: "ana@example.com",
        phone: "+351911111111",
        classId: CLASS_FUTURE,
      },
      db,
    );
    expect(result).toMatchObject({ ok: false, reason: "agreement" });
  });

  it("succeeds when the current waiver id is sent", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt, waiver_id)
         VALUES ('academy_A', 'Ana', 'Silva', '+351911111111', 'ana@example.com', true, 'Blue', '${waiverId}')`,
    );

    await pg.exec(
      `INSERT INTO "academy_waiver" (academy_id, body, created_by)
         VALUES ('academy_A', 'Updated waiver text', 'admin')`,
    );
    const newWaiver = await pg.query<{ id: string }>(
      `SELECT id FROM "academy_waiver" WHERE academy_id = 'academy_A' ORDER BY created_at DESC LIMIT 1`,
    );
    const newWaiverId = single(newWaiver).id;

    const result = await submitDropInVisit(
      {
        kind: "returning",
        token: TOKEN_A,
        email: "ana@example.com",
        phone: "+351911111111",
        classId: CLASS_FUTURE,
        waiverId: newWaiverId,
      },
      db,
    );
    expect(result).toMatchObject({ ok: true });
  });
});

describe("lookupReturningLead", () => {
  let pg: PGlite;
  let db: ReturnType<typeof execOn>;
  const academy: DropInAcademy = {
    academyId: "academy_A",
    name: "Test Gym",
    timeZone: "UTC",
    country: null,
    signupHealthQuestion: false,
    waiver: null,
    iconKey: null,
  };

  beforeEach(async () => {
    pg = await freshDb();
    db = execOn(pg);
  });

  afterEach(() => pg.close());

  it("returns firstName and needsAgreement false for a full match", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt)
         VALUES ('academy_A', 'Ana', 'Silva', '+351911111111', 'ana@example.com', true, 'Blue')`,
    );

    const result = await lookupReturningLead(
      academy,
      { email: "ana@example.com", phone: "+351911111111" },
      db,
    );
    expect(result).toEqual({ firstName: "Ana", needsAgreement: false });
  });

  it("returns null when only the phone matches", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt)
         VALUES ('academy_A', 'Ana', 'Silva', '+351911111111', 'other@example.com', true, 'Blue')`,
    );

    const result = await lookupReturningLead(
      academy,
      { email: "ana@example.com", phone: "+351911111111" },
      db,
    );
    expect(result).toBeNull();
  });

  it("returns null for a lead in another academy", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt)
         VALUES ('academy_B', 'Ana', 'Silva', '+351911111111', 'ana@example.com', true, 'Blue')`,
    );

    const result = await lookupReturningLead(
      academy,
      { email: "ana@example.com", phone: "+351911111111" },
      db,
    );
    expect(result).toBeNull();
  });

  it("returns null when the lead has no belt (gate is full)", async () => {
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent)
         VALUES ('academy_A', 'Ana', 'Silva', '+351911111111', 'ana@example.com', true)`,
    );

    const result = await lookupReturningLead(
      academy,
      { email: "ana@example.com", phone: "+351911111111" },
      db,
    );
    expect(result).toBeNull();
  });

  it("returns needsAgreement true when the waiver is outdated", async () => {
    const waiver = await pg.query<{ id: string }>(
      `INSERT INTO "academy_waiver" (academy_id, body, created_by)
         VALUES ('academy_A', 'Waiver v1', 'admin') RETURNING id`,
    );
    const oldId = single(waiver).id;
    await pg.exec(
      `INSERT INTO "academy_waiver" (academy_id, body, created_by)
         VALUES ('academy_A', 'Waiver v2', 'admin')`,
    );
    const newWaiver = await pg.query<{ id: string }>(
      `SELECT id FROM "academy_waiver" WHERE academy_id = 'academy_A' ORDER BY created_at DESC LIMIT 1`,
    );
    const newId = single(newWaiver).id;

    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt, waiver_id)
         VALUES ('academy_A', 'Ana', 'Silva', '+351911111111', 'ana@example.com', true, 'Blue', '${oldId}')`,
    );

    const academyWithWaiver: DropInAcademy = {
      ...academy,
      waiver: { id: newId, body: "Waiver v2" },
    };
    const result = await lookupReturningLead(
      academyWithWaiver,
      { email: "ana@example.com", phone: "+351911111111" },
      db,
    );
    expect(result).toEqual({ firstName: "Ana", needsAgreement: true });
  });
});

describe("takeRateLimit", () => {
  let pg: PGlite;
  let db: ReturnType<typeof execOn>;

  beforeEach(async () => {
    pg = await freshDb();
    db = execOn(pg);
  });

  afterEach(() => pg.close());

  it("allows up to max and refuses max+1 in the same window", async () => {
    const max = 3;
    const results: boolean[] = [];
    for (let i = 0; i < max + 1; i++) {
      results.push(await takeRateLimit("test-key", max, 60_000, db));
    }
    expect(results.slice(0, max)).toEqual([true, true, true]);
    expect(results[max]).toBe(false);
  });

  it("resets after the window expires by inserting an expired row", async () => {
    const max = 1;
    await pg.exec(
      `INSERT INTO "rate_limit" (key, count, reset_at)
         VALUES ('expired-key', ${max}, now() - interval '1 second')`,
    );
    const result = await takeRateLimit("expired-key", max, 60_000, db);
    expect(result).toBe(true);
  });
});

describe("RLS — drop_in_visit isolation", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await pg.exec(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, consent)
         VALUES ('academy_A', 'Sam', 'Lee', '111', true),
                ('academy_B', 'Bo', 'Reis', '222', true)`,
    );
    await pg.exec(`
      INSERT INTO "class" (id, academy_id, instructor_id, title, starts_at, duration_minutes, capacity, status)
        VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaa111111111', 'academy_A', 'u1', 'A class', now() - interval '30 minutes', 60, 20, 'scheduled'),
               ('bbbbbbbb-bbbb-4bbb-8bbb-bbb222222222', 'academy_B', 'u2', 'B class', now() - interval '30 minutes', 60, 20, 'scheduled')`);
    await pg.exec(
      `INSERT INTO "drop_in_visit" (academy_id, drop_in_id, class_id, booking_status, attendance_status)
         SELECT 'academy_A', d.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaa111111111', 'none', 'present'
           FROM "drop_in" d WHERE d.phone = '111';
       INSERT INTO "drop_in_visit" (academy_id, drop_in_id, class_id, booking_status, attendance_status)
         SELECT 'academy_B', d.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbb222222222', 'none', 'present'
           FROM "drop_in" d WHERE d.phone = '222';`,
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
    expect(await asTenant(pg, "academy_A", visits)).toBe(1);
    expect(await asTenant(pg, "academy_B", visits)).toBe(1);
  });

  it("cannot INSERT a visit for another academy (WITH CHECK)", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(
          `INSERT INTO "drop_in_visit" (academy_id, drop_in_id, class_id, booking_status, attendance_status)
             SELECT 'academy_B', d.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbb222222222', 'none', 'present'
               FROM "drop_in" d WHERE d.phone = '111'`,
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
