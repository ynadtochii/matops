import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { leadQueues, needsFollowUp } from "@matops/domain";

import type { Harness } from "./helpers";
import { resetRateLimits } from "../src/rate-limit";
import { harness, rejectionCode, seedClasses } from "./helpers";

const A = "org_a";
const OWNER = "u_owner";
const COACH = "u_coach";
const JOINER = "u_joiner";

const TODAY = "aaaaaaaa-0000-4000-8000-00000000010a";

let open: Harness | null = null;

beforeEach(() => resetRateLimits());

afterEach(async () => {
  await open?.close();
  open = null;
});

async function base(): Promise<Harness> {
  const h = await harness([
    {
      id: A,
      code: "100001",
      members: [
        { userId: OWNER, role: "owner", status: "active" },
        { userId: COACH, role: "instructor", status: "active" },
        { userId: JOINER, role: "student", status: "active", name: "Ana" },
      ],
    },
  ]);
  open = h;
  await seedClasses(h.pg, [
    { id: TODAY, academyId: A, instructorId: COACH, startsInMinutes: -60 },
  ]);
  await h.pg.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ('u_new', 'New Joiner', 'u_new@test.local', true, now(), now())`,
  );
  return h;
}

async function seedLead(
  h: Harness,
  opts: {
    academyId?: string;
    phone: string;
    firstName?: string;
    lastName?: string;
    visitClassId?: string;
  },
) {
  const {
    academyId = A,
    phone,
    firstName = "Ana",
    lastName = "Silva",
    visitClassId,
  } = opts;
  await h.pg.query(
    `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, consent, source)
       VALUES ($1, $2, $3, $4, false, 'staff')`,
    [academyId, firstName, lastName, phone],
  );
  if (visitClassId) {
    await h.pg.query(
      `INSERT INTO "drop_in_visit" (academy_id, drop_in_id, class_id, booking_status, attendance_status, attended_at)
         SELECT $1, d.id, $2, 'none', 'present', now()
           FROM "drop_in" d WHERE d.phone = $3 AND d.academy_id = $1`,
      [academyId, visitClassId, phone],
    );
  }
}

function queues(rows: { stage: string; visitCount: number }[]) {
  return leadQueues(
    rows.map((l) => ({
      stage: l.stage as "new",
      activity: {
        visits: l.visitCount,
        lastVisitAt: null,
        nextBookingAt: null,
      },
    })),
  );
}

describe("a lead is a stage plus what the person actually did", () => {
  it("starts at new with the source recorded", async () => {
    const h = await base();
    await seedLead(h, { phone: "+351912345678", visitClassId: TODAY });
    const [lead] = await h.as(OWNER, A).dropIn.list();
    expect(lead).toMatchObject({
      stage: "new",
      source: "staff",
      visitCount: 1,
    });
  });

  it("shows a person who trained and was never followed up in both queues", async () => {
    const h = await base();
    await seedLead(h, { phone: "+351912345678", visitClassId: TODAY });
    const rows = await h.as(OWNER, A).dropIn.list();
    expect(queues(rows)).toEqual({ newLeads: 1, trainedNotJoined: 1 });
  });

  it("clears the new queue when the owner marks them contacted", async () => {
    const h = await base();
    await seedLead(h, { phone: "+351912345678" });
    const [lead] = await h.as(OWNER, A).dropIn.list();
    await h
      .as(OWNER, A)
      .dropIn.setStage({ id: lead?.id ?? "", stage: "contacted" });

    const rows = await h.as(OWNER, A).dropIn.list();
    expect(rows[0]?.stage).toBe("contacted");
    expect(rows[0]?.contactedAt).not.toBeNull();
  });

  it("takes a ghosted lead out of both queues and keeps the row", async () => {
    const h = await base();
    await seedLead(h, { phone: "+351912345678", visitClassId: TODAY });
    const [lead] = await h.as(OWNER, A).dropIn.list();
    await h
      .as(OWNER, A)
      .dropIn.setStage({ id: lead?.id ?? "", stage: "ghosted" });

    const rows = await h.as(OWNER, A).dropIn.list();
    expect(rows).toHaveLength(1);
    expect(queues(rows)).toEqual({ newLeads: 0, trainedNotJoined: 0 });
  });

  it("keeps the leads list owner-only", async () => {
    const h = await base();
    expect(await rejectionCode(h.as(COACH, A).dropIn.list())).toBe("FORBIDDEN");
  });
});

describe("drop-in link management", () => {
  it("instructors get a link even when none exists yet", async () => {
    const h = await base();
    const link = await h.as(COACH, A).dropIn.link();
    expect(typeof link.token).toBe("string");
  });

  it("reading the link twice returns the same token", async () => {
    const h = await base();
    const [first, second] = await Promise.all([
      h.as(COACH, A).dropIn.link(),
      h.as(OWNER, A).dropIn.link(),
    ]);
    expect(second.token).toBe(first.token);
  });

  it("students cannot read the link", async () => {
    const h = await base();
    expect(await rejectionCode(h.as(JOINER, A).dropIn.link())).toBe(
      "FORBIDDEN",
    );
  });

  it("instructors are forbidden from rotating a link", async () => {
    const h = await base();
    await h.as(OWNER, A).dropIn.link();
    expect(await rejectionCode(h.as(COACH, A).dropIn.rotateLink())).toBe(
      "FORBIDDEN",
    );
  });

  it("rotating invalidates the old token", async () => {
    const h = await base();
    const first = await h.as(OWNER, A).dropIn.link();
    await h.as(OWNER, A).dropIn.rotateLink();
    const current = await h.as(OWNER, A).dropIn.link();
    expect(current.token).not.toBe(first.token);
  });
});

describe("a lead becomes a member on a phone match at self-join", () => {
  it("flips the lead to joined and links the user, whatever the format", async () => {
    const h = await base();
    await seedLead(h, { phone: "+351912345678" });
    await h.as("u_new", null).membership.joinByCode({
      code: "100001",
      firstName: "Ana",
      lastName: "Silva",
      phone: "912 345 678",
      belt: "White",
    });

    const [lead] = await h.as(OWNER, A).dropIn.list();
    expect(lead?.stage).toBe("joined");
    expect(lead?.convertedUserId).toBe("u_new");
  });

  it("leaves a lead alone when nobody's phone matches", async () => {
    const h = await base();
    await seedLead(h, { phone: "+351912345678" });
    await h.as("u_new", null).membership.joinByCode({
      code: "100001",
      firstName: "Bo",
      lastName: "Reis",
      phone: "+351999888777",
      belt: "White",
    });
    expect((await h.as(OWNER, A).dropIn.list())[0]?.stage).toBe("new");
  });

  it("takes a joined lead out of the follow-up queue", async () => {
    const h = await base();
    await seedLead(h, { phone: "+351912345678", visitClassId: TODAY });
    await h.as("u_new", null).membership.joinByCode({
      code: "100001",
      firstName: "Ana",
      lastName: "Silva",
      phone: "912345678",
      belt: "White",
    });
    const rows = await h.as(OWNER, A).dropIn.list();
    expect(
      needsFollowUp({
        stage: rows[0]?.stage ?? "new",
        activity: {
          visits: rows[0]?.visitCount ?? 0,
          lastVisitAt: null,
          nextBookingAt: null,
        },
      }),
    ).toBe(false);
  });
});

describe("joinByCode signup validation", () => {
  it("rejects a student who did not pick a belt", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as("u_new", null).membership.joinByCode({
          code: "100001",
          firstName: "Ana",
          lastName: "Silva",
          phone: "+351999111222",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("saves the belt and other answers when given", async () => {
    const h = await base();
    await h.as("u_new", null).membership.joinByCode({
      code: "100001",
      firstName: "Ana",
      lastName: "Silva",
      phone: "+351999111222",
      belt: "Blue",
      stripes: 2,
    });

    const rank = await h.pg.query<{ belt: string; stripes: number }>(
      `SELECT belt, stripes FROM "member_rank" mr
         JOIN "entity_membership" em ON em.id = mr.member_id
        WHERE em.user_id = 'u_new'`,
    );
    expect(rank.rows[0]).toMatchObject({ belt: "Blue", stripes: 2 });
  });
});

describe("attendance.list shows belt and health for booked visitors", () => {
  it("includes belt and health on the visitor row", async () => {
    const h = await base();
    const futureClass = "bbbbbbbb-0000-4000-8000-000000000001";
    await seedClasses(h.pg, [
      {
        id: futureClass,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: 60,
        durationMinutes: 60,
      },
    ]);
    await h.pg.query(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt, health)
         VALUES ($1, 'Ana', 'Silva', '+351911111111', 'ana@test.local', true, 'Blue', 'Bad knee')`,
      [A],
    );
    await h.pg.query(
      `INSERT INTO "drop_in_visit" (academy_id, drop_in_id, class_id, booking_status, attendance_status, booked_at)
         SELECT $1, d.id, $2, 'booked', 'unmarked', now()
           FROM "drop_in" d WHERE d.phone = '+351911111111' AND d.academy_id = $1`,
      [A, futureClass],
    );

    const result = await h.as(COACH, A).attendance.list({ id: futureClass });
    const visitor = result.dropIns[0];
    expect(visitor).toMatchObject({ belt: "Blue" });
    expect(visitor?.health).toBe("Bad knee");
  });
});

describe("no statistics query joins the visits table", () => {
  const READERS = [
    "attendance-review.ts",
    "router/attendance.ts",
    "router/class.ts",
  ];

  it("is read by the roster and the class screen, and nowhere else", async () => {
    const srcDir = fileURLToPath(new URL("../src", import.meta.url));
    const files = (await readdir(srcDir, { recursive: true }))
      .map(String)
      .filter((f) => f.endsWith(".ts"));
    const users: string[] = [];
    for (const file of files) {
      const source = await readFile(join(srcDir, file), "utf8");
      if (source.includes("dropInVisit"))
        users.push(file.replaceAll("\\", "/"));
    }
    expect(users.sort()).toEqual([...READERS].sort());
  });
});
