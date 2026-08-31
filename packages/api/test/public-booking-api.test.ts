import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import {
  handleAcademy,
  handleBooking,
  handleCancel,
  handleClasses,
} from "../src/public";
import { resetRateLimits } from "../src/rate-limit";
import { harness, seedAcademies, seedClasses } from "./helpers";

const A = "org_a";
const B = "org_b";
const OWNER = "u_owner";
const COACH = "u_coach";

const SHARED = "aaaaaaaa-0000-4000-8000-00000000000a";
const PRIVATE = "aaaaaaaa-0000-4000-8000-00000000000b";
const SOON = "aaaaaaaa-0000-4000-8000-00000000000c";
const CANCELLED = "aaaaaaaa-0000-4000-8000-00000000000d";
const OTHER_GYM = "aaaaaaaa-0000-4000-8000-00000000000e";

const KEY_A = "mk_pub_academy_a";
const KEY_B = "mk_pub_academy_b";

const VISITOR = {
  firstName: "Ana",
  lastName: "Silva",
  phone: "+351912345678",
  email: "ana@example.com",
  consent: true,
};

let open: Harness | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

beforeEach(() => {
  resetRateLimits();
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
      ],
    },
    {
      id: B,
      code: "100002",
      members: [{ userId: "u_other", role: "owner", status: "active" }],
    },
  ]);
  await h.pg.exec(`
    UPDATE "organization"
       SET public_booking_enabled = true, public_api_key = '${KEY_A}',
           time_zone = 'Europe/Lisbon', address = 'Rua Example 12'
     WHERE id = '${A}';
    UPDATE "organization"
       SET public_booking_enabled = true, public_api_key = '${KEY_B}'
     WHERE id = '${B}';
  `);
  await seedClasses(h.pg, [
    {
      id: SHARED,
      academyId: A,
      instructorId: COACH,
      title: "Fundamentals gi",
      startsInMinutes: 24 * 60,
      publicBookable: true,
    },
    {
      id: PRIVATE,
      academyId: A,
      instructorId: COACH,
      title: "Kids",
      startsInMinutes: 25 * 60,
    },
    {
      id: SOON,
      academyId: A,
      instructorId: COACH,
      title: "Starting soon",
      startsInMinutes: 30,
      publicBookable: true,
    },
    {
      id: CANCELLED,
      academyId: A,
      instructorId: COACH,
      startsInMinutes: 26 * 60,
      publicBookable: true,
      status: "cancelled",
    },
    {
      id: OTHER_GYM,
      academyId: B,
      instructorId: "u_other",
      startsInMinutes: 24 * 60,
      publicBookable: true,
    },
  ]);
  return h;
}

function get(path: string, key: string | null = KEY_A): Request {
  const headers = new Headers({ "x-forwarded-for": "1.1.1.1" });
  if (key) headers.set("x-matops-key", key);
  return new Request(`https://matops.test${path}`, { headers });
}

function post(
  body: unknown,
  key: string | null = KEY_A,
  ip = "1.1.1.1",
): Request {
  const headers = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": ip,
  });
  if (key) headers.set("x-matops-key", key);
  return new Request("https://matops.test/api/public/v1/bookings", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, never>> {
  return (await res.json()) as Record<string, never>;
}

describe("the key is the only way in", () => {
  it("refuses a request with no key", async () => {
    const h = await base();
    const res = await handleAcademy(get("/academy", null), h.exec);
    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ error: { code: "invalid_key" } });
  });

  it("refuses an unknown key", async () => {
    const h = await base();
    const res = await handleAcademy(get("/academy", "mk_pub_nope"), h.exec);
    expect(res.status).toBe(401);
  });

  it("says so when the gym switched the surface off", async () => {
    const h = await base();
    await h.pg.exec(
      `UPDATE "organization" SET public_booking_enabled = false WHERE id = '${A}'`,
    );
    const res = await handleAcademy(get("/academy"), h.exec);
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({
      error: { code: "public_api_disabled" },
    });
  });

  it("refuses an origin outside the gym's allowlist", async () => {
    const h = await base();
    await h.pg.exec(
      `UPDATE "organization" SET public_api_origins = ARRAY['https://almabjj.com'] WHERE id = '${A}'`,
    );
    const req = new Request("https://matops.test/academy", {
      headers: new Headers({
        "x-matops-key": KEY_A,
        origin: "https://evil.example",
      }),
    });
    const res = await handleAcademy(req, h.exec);
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({
      error: { code: "origin_not_allowed" },
    });
  });
});

describe("GET /classes", () => {
  it("returns only the classes the owner shared", async () => {
    const h = await base();
    const body = await json(await handleClasses(get("/classes"), h.exec));
    const ids = (body.classes as unknown as { id: string }[]).map((c) => c.id);
    expect(ids).toEqual([SOON, SHARED]);
  });

  it("puts nothing on the deny list in the body", async () => {
    const h = await base();
    const res = await handleClasses(get("/classes"), h.exec);
    const text = await res.text();
    for (const leak of [
      "capacity",
      "bookingCount",
      "instructorId",
      "templateId",
      COACH,
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it("marks a class inside the cut-off as not bookable", async () => {
    const h = await base();
    const body = await json(await handleClasses(get("/classes"), h.exec));
    const rows = body.classes as unknown as { id: string; bookable: boolean }[];
    expect(rows.find((c) => c.id === SOON)?.bookable).toBe(false);
    expect(rows.find((c) => c.id === SHARED)?.bookable).toBe(true);
  });

  it("never shows another gym's classes", async () => {
    const h = await base();
    const body = await json(await handleClasses(get("/classes"), h.exec));
    const ids = (body.classes as unknown as { id: string }[]).map((c) => c.id);
    expect(ids).not.toContain(OTHER_GYM);
  });

  it("refuses a range longer than a month", async () => {
    const h = await base();
    const res = await handleClasses(
      get("/classes?from=2026-01-01&to=2026-06-01"),
      h.exec,
    );
    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({
      error: { code: "validation_error" },
    });
  });
});

describe("POST /bookings", () => {
  it("creates a lead and a visit, and never a user or a member", async () => {
    const h = await base();
    const before = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "user"`,
    );
    const res = await handleBooking(
      post({ classId: SHARED, ...VISITOR }),
      h.exec,
    );
    expect(res.status).toBe(200);

    const leads = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "drop_in"`,
    );
    const visits = await h.pg.query<{ n: number; booking_status: string }>(
      `SELECT count(*)::int AS n, min(booking_status) AS booking_status FROM "drop_in_visit"`,
    );
    const after = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "user"`,
    );
    const members = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "member" WHERE organization_id = '${A}'`,
    );
    expect(leads.rows[0]?.n).toBe(1);
    expect(visits.rows[0]).toMatchObject({ n: 1, booking_status: "booked" });
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
    expect(members.rows[0]?.n).toBe(2);
  });

  it("records where the lead came from", async () => {
    const h = await base();
    await handleBooking(
      post({ classId: SHARED, ...VISITOR, source: "link" }),
      h.exec,
    );
    const rows = await h.pg.query<{ source: string; stage: string }>(
      `SELECT source, stage FROM "drop_in"`,
    );
    expect(rows.rows[0]).toMatchObject({ source: "link", stage: "new" });
  });

  it("gives the same booking back when the same phone posts twice", async () => {
    const h = await base();
    const first = await json(
      await handleBooking(post({ classId: SHARED, ...VISITOR }), h.exec),
    );
    const second = await json(
      await handleBooking(post({ classId: SHARED, ...VISITOR }), h.exec),
    );
    expect(second.bookingId).toBe(first.bookingId);
    expect(second.cancelToken).toBe(first.cancelToken);
    const visits = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "drop_in_visit"`,
    );
    expect(visits.rows[0]?.n).toBe(1);
  });

  it("books a full class, and says nothing about how full it is", async () => {
    const h = await base();
    await h.pg.exec(
      `UPDATE "class" SET capacity = 1, booking_count = 5 WHERE id = '${SHARED}'`,
    );
    const res = await handleBooking(
      post({ classId: SHARED, ...VISITOR }),
      h.exec,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("capacity");
    expect(text).not.toContain("bookingCount");
  });

  it("answers 404 for an unpublished class, never 403", async () => {
    const h = await base();
    const res = await handleBooking(
      post({ classId: PRIVATE, ...VISITOR }),
      h.exec,
    );
    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({
      error: { code: "class_not_found" },
    });
  });

  it("answers 409 for a class cancelled after the page loaded", async () => {
    const h = await base();
    const res = await handleBooking(
      post({ classId: CANCELLED, ...VISITOR }),
      h.exec,
    );
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({
      error: { code: "class_cancelled" },
    });
  });

  it("refuses a class inside the cut-off", async () => {
    const h = await base();
    const res = await handleBooking(
      post({ classId: SOON, ...VISITOR }),
      h.exec,
    );
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ error: { code: "class_closed" } });
  });

  it("refuses a booking with the consent box unticked", async () => {
    const h = await base();
    const res = await handleBooking(
      post({ classId: SHARED, ...VISITOR, consent: false }),
      h.exec,
    );
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body).toMatchObject({ error: { code: "validation_error" } });
    expect((body.error as unknown as { field: string }).field).toBe("consent");
  });

  it("cannot reach another gym's class with this gym's key", async () => {
    const h = await base();
    const res = await handleBooking(
      post({ classId: OTHER_GYM, ...VISITOR }),
      h.exec,
    );
    expect(res.status).toBe(404);
    const leads = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "drop_in"`,
    );
    expect(leads.rows[0]?.n).toBe(0);
  });
});

describe("DELETE /bookings/{token}", () => {
  it("cancels the booking and keeps the lead", async () => {
    const h = await base();
    const booked = await json(
      await handleBooking(post({ classId: SHARED, ...VISITOR }), h.exec),
    );
    const res = await handleCancel(
      get("/bookings"),
      booked.cancelToken as unknown as string,
      h.exec,
    );
    expect(res.status).toBe(204);
    const visit = await h.pg.query<{ booking_status: string }>(
      `SELECT booking_status FROM "drop_in_visit"`,
    );
    const leads = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "drop_in"`,
    );
    expect(visit.rows[0]?.booking_status).toBe("cancelled");
    expect(leads.rows[0]?.n).toBe(1);
  });

  it("answers the same for an unknown token, so it cannot be used to guess", async () => {
    const h = await base();
    const res = await handleCancel(get("/bookings"), "not-a-token", h.exec);
    expect(res.status).toBe(204);
  });

  it("refuses another gym's token", async () => {
    const h = await base();
    const booked = await json(
      await handleBooking(post({ classId: SHARED, ...VISITOR }), h.exec),
    );
    await handleCancel(
      get("/bookings", KEY_B),
      booked.cancelToken as unknown as string,
      h.exec,
    );
    const visit = await h.pg.query<{ booking_status: string }>(
      `SELECT booking_status FROM "drop_in_visit"`,
    );
    expect(visit.rows[0]?.booking_status).toBe("booked");
  });
});

describe("the rate limits", () => {
  it("lets five bookings through from one address, then answers 429", async () => {
    const h = await base();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await handleBooking(
        post({ classId: SHARED, ...VISITOR, phone: `+3519123456${10 + i}` }),
        h.exec,
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("carries Retry-After on a refusal", async () => {
    const h = await base();
    let last: Response | null = null;
    for (let i = 0; i < 6; i++) {
      last = await handleBooking(
        post({ classId: SHARED, ...VISITOR, phone: `+3519123456${10 + i}` }),
        h.exec,
      );
    }
    expect(last?.headers.get("Retry-After")).toBe("600");
  });

  it("caps one phone across academies, whatever address it comes from", async () => {
    const h = await base();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await handleBooking(
        post({ classId: SHARED, ...VISITOR }, KEY_A, `9.9.9.${i}`),
        h.exec,
      );
      statuses.push(res.status);
    }
    expect(statuses[3]).toBe(429);
  });
});
