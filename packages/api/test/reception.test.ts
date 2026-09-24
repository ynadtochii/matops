import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { eq, receptionTokenHash } from "@matops/db";
import { classParticipation, entity, receptionLink } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { resetRateLimits } from "../src/rate-limit";
import { appRouter } from "../src/root";
import {
  harness,
  personId,
  rejectionCode,
  seedClasses,
  storedBookingCount,
} from "./helpers";

const A = "reception_a";
const B = "reception_b";
const OWNER = "reception_owner";
const STUDENT = "reception_student";
const FOREIGN = "reception_foreign";
const RUNNING = "aaaaaaaa-0000-4000-8000-000000000701";
const FOREIGN_CLASS = "aaaaaaaa-0000-4000-8000-000000000702";
const LATER_TODAY = "aaaaaaaa-0000-4000-8000-000000000703";
const CANCELLED = "aaaaaaaa-0000-4000-8000-000000000704";
const IN_THREE_DAYS = "aaaaaaaa-0000-4000-8000-000000000705";
const PAST_THE_WINDOW = "aaaaaaaa-0000-4000-8000-000000000706";
const DAY_MINUTES = 24 * 60;
let open: Harness | null = null;

beforeEach(() => resetRateLimits());
afterEach(async () => {
  await open?.close();
  open = null;
});

async function base() {
  const h = await harness([
    {
      id: A,
      code: "710001",
      members: [
        { userId: OWNER, role: "owner", status: "active", name: "Owner" },
        {
          userId: STUDENT,
          role: "student",
          status: "active",
          name: "José Silva",
        },
        {
          userId: "duplicate_a",
          role: "student",
          status: "active",
          name: "Ana Costa",
        },
        {
          userId: "duplicate_b",
          role: "student",
          status: "active",
          name: "Ana Costa",
        },
        {
          userId: "paused",
          role: "student",
          status: "suspended",
          name: "José Paused",
        },
        ...Array.from({ length: 6 }, (_, i) => ({
          userId: `search_${i}`,
          role: "student" as const,
          status: "active" as const,
          name: `Search Member ${i}`,
        })),
      ],
    },
    {
      id: B,
      code: "710002",
      members: [
        { userId: "foreign_owner", role: "owner", status: "active" },
        {
          userId: FOREIGN,
          role: "student",
          status: "active",
          name: "José Foreign",
        },
      ],
    },
  ]);
  open = h;
  await seedClasses(h.pg, [
    { id: RUNNING, academyId: A, instructorId: OWNER, startsInMinutes: -10 },
    {
      id: LATER_TODAY,
      academyId: A,
      instructorId: OWNER,
      title: "Evening No-gi",
      startsInMinutes: 180,
    },
    {
      id: CANCELLED,
      academyId: A,
      instructorId: OWNER,
      startsInMinutes: 240,
      status: "cancelled",
    },
    {
      id: IN_THREE_DAYS,
      academyId: A,
      instructorId: OWNER,
      title: "Saturday open mat",
      startsInMinutes: 3 * DAY_MINUTES - 60,
    },
    {
      id: PAST_THE_WINDOW,
      academyId: A,
      instructorId: OWNER,
      startsInMinutes: 5 * DAY_MINUTES,
    },
    {
      id: FOREIGN_CLASS,
      academyId: B,
      instructorId: "foreign_owner",
      startsInMinutes: -10,
    },
  ]);
  return h;
}

function device(h: Harness, token?: string, requestedAcademy = A) {
  const headers = new Headers({ "x-matops-entity": requestedAcademy });
  if (token) headers.set("cookie", `matops-reception=${token}`);
  return appRouter.createCaller({
    ...h.ctxFor(OWNER, requestedAcademy, headers),
    session: null,
  });
}

async function withLink(h: Harness) {
  const link = await h.as(OWNER, A).reception.createLink();
  return { ...link, api: device(h, link.token) };
}

const ME = () => personId(A, STUDENT);

describe("the permanent reception link", () => {
  it("is created once by an owner and remains visible to a branch manager", async () => {
    const h = await base();
    const created = await withLink(h);
    expect(created.token).toMatch(/^[a-f0-9]{64}$/);
    const rows = await h.exec.select().from(receptionLink);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(receptionTokenHash(created.token));
    expect(rows[0]?.tokenCiphertext).not.toBe(created.token);
    expect(rows[0]?.academyId).toBe(A);
    expect(rows[0]?.revokedAt).toBeNull();

    const status = await h.as(OWNER, A).reception.linkStatus();
    expect(status.enabled).toBe(true);
    expect(status.token).toBe(created.token);
    expect(Object.keys(status).sort()).toEqual([
      "createdAt",
      "enabled",
      "token",
    ]);

    expect(await rejectionCode(h.as(OWNER, A).reception.createLink())).toBe(
      "PRECONDITION_FAILED",
    );
    expect(await rejectionCode(h.as(STUDENT, A).reception.createLink())).toBe(
      "FORBIDDEN",
    );
  });

  it("keeps working across requests without any owner action", async () => {
    const h = await base();
    const { api } = await withLink(h);
    await expect(api.reception.info()).resolves.toMatchObject({ academyId: A });
    await expect(api.reception.info()).resolves.toMatchObject({ academyId: A });
  });

  it("refuses missing, malformed, replaced, and disabled credentials", async () => {
    const h = await base();
    expect(await rejectionCode(device(h).reception.info())).toBe(
      "UNAUTHORIZED",
    );
    expect(
      await rejectionCode(device(h, "a".repeat(64)).reception.info()),
    ).toBe("UNAUTHORIZED");

    const first = await withLink(h);
    const replaced = await h.as(OWNER, A).reception.replaceLink();
    expect(replaced.token).not.toBe(first.token);
    expect(await rejectionCode(first.api.reception.info())).toBe(
      "UNAUTHORIZED",
    );
    await expect(
      device(h, replaced.token).reception.info(),
    ).resolves.toMatchObject({ academyId: A });
    expect(await h.as(OWNER, A).reception.linkStatus()).toMatchObject({
      enabled: true,
      token: replaced.token,
    });

    const live = await h.exec
      .select()
      .from(receptionLink)
      .where(eq(receptionLink.academyId, A));
    expect(live).toHaveLength(2);
    expect(live.filter((row) => row.revokedAt === null)).toHaveLength(1);

    await h.as(OWNER, A).reception.disableLink();
    expect(
      await rejectionCode(device(h, replaced.token).reception.info()),
    ).toBe("UNAUTHORIZED");
    expect(await h.as(OWNER, A).reception.linkStatus()).toMatchObject({
      enabled: false,
      createdAt: null,
      token: null,
    });
  });

  it("refuses an account session and every management API", async () => {
    const h = await base();
    const created = await withLink(h);
    const headers = new Headers({
      cookie: `matops-reception=${created.token}`,
    });
    expect(await rejectionCode(h.as(OWNER, A, headers).reception.info())).toBe(
      "UNAUTHORIZED",
    );
    expect(await rejectionCode(created.api.dropIn.list())).toBe("UNAUTHORIZED");
    expect(await rejectionCode(created.api.reception.createLink())).toBe(
      "UNAUTHORIZED",
    );
    expect(await rejectionCode(created.api.attendance.members())).toBe(
      "UNAUTHORIZED",
    );
  });

  it("takes branch scope from the credential despite a foreign header", async () => {
    const h = await base();
    const created = await withLink(h);
    const api = device(h, created.token, B);
    await expect(api.reception.info()).resolves.toMatchObject({ academyId: A });
    expect(await api.reception.search({ query: "jose" })).toEqual([
      { id: ME(), name: "José Silva", ambiguous: false },
    ]);
  });
});

describe("reception member search", () => {
  it("returns at most five matching names without contact details", async () => {
    const h = await base();
    const { api } = await withLink(h);
    const matches = await api.reception.search({ query: "search" });
    expect(matches).toHaveLength(5);
    for (const match of matches) {
      expect(Object.keys(match).sort()).toEqual(["ambiguous", "id", "name"]);
    }
    expect(await api.reception.search({ query: "JOSE" })).toEqual([
      { id: ME(), name: "José Silva", ambiguous: false },
    ]);
  });

  it("never reaches another branch's members", async () => {
    const h = await base();
    const { api } = await withLink(h);
    expect(await api.reception.search({ query: "foreign" })).toEqual([]);
  });

  it("flags identical names and refuses to select either member", async () => {
    const h = await base();
    const { api } = await withLink(h);
    const matches = await api.reception.search({ query: "ana" });
    expect(matches).toHaveLength(2);
    expect(matches.every((row) => row.ambiguous)).toBe(true);
    expect(
      await rejectionCode(
        api.reception.checkIn({
          personId: personId(A, "duplicate_a"),
          classId: RUNNING,
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(await storedBookingCount(h.pg, RUNNING)).toBe(0);
  });
});

describe("reception classes for the selected person", () => {
  it("offers check-in on the running class and booking on later ones", async () => {
    const h = await base();
    const { api } = await withLink(h);
    const cards = await api.reception.classes({ personId: ME() });
    expect(cards.map((card) => [card.id, card.action])).toEqual([
      [RUNNING, "check-in"],
      [LATER_TODAY, "book"],
      [IN_THREE_DAYS, "book"],
    ]);
    for (const card of cards) {
      expect(Object.keys(card).sort()).toEqual([
        "action",
        "dayOffset",
        "endsAt",
        "id",
        "startsAt",
        "title",
      ]);
    }
  });

  it("reaches three days ahead and stops there", async () => {
    const h = await base();
    const { api } = await withLink(h);
    const cards = await api.reception.classes({ personId: ME() });
    const ids = cards.map((card) => card.id);
    expect(ids).toContain(IN_THREE_DAYS);
    expect(ids).not.toContain(PAST_THE_WINDOW);
    const far = cards.find((card) => card.id === IN_THREE_DAYS);
    expect(far?.dayOffset).toBeGreaterThanOrEqual(2);
    expect(far?.dayOffset).toBeLessThanOrEqual(3);
  });

  it("books a class three days out", async () => {
    const h = await base();
    const { api } = await withLink(h);
    await expect(
      api.reception.book({ personId: ME(), classId: IN_THREE_DAYS }),
    ).resolves.toMatchObject({ ok: true, tier: "confirmed" });
    expect(await storedBookingCount(h.pg, IN_THREE_DAYS)).toBe(1);
  });

  it("refuses an unknown person and never lists a foreign branch's classes", async () => {
    const h = await base();
    const { api } = await withLink(h);
    expect(
      await rejectionCode(
        api.reception.classes({ personId: personId(B, FOREIGN) }),
      ),
    ).toBe("FORBIDDEN");
    const cards = await api.reception.classes({ personId: ME() });
    expect(cards.map((card) => card.id)).not.toContain(FOREIGN_CLASS);
    expect(cards.map((card) => card.id)).not.toContain(CANCELLED);
  });
});

describe("reception writes", () => {
  it("records retries once and consumes one place", async () => {
    const h = await base();
    const { api } = await withLink(h);
    const input = { personId: ME(), classId: RUNNING };
    await expect(api.reception.checkIn(input)).resolves.toMatchObject({
      ok: true,
    });
    await expect(api.reception.checkIn(input)).resolves.toMatchObject({
      ok: true,
    });
    expect(await storedBookingCount(h.pg, RUNNING)).toBe(1);
    const stored = await h.pg.query<{
      attendance_status: string;
      check_in_source: string | null;
      marked_by: string | null;
    }>(
      "SELECT attendance_status, check_in_source, marked_by FROM class_participation WHERE class_id = $1 AND person_id = $2",
      [RUNNING, input.personId],
    );
    expect(stored.rows).toEqual([
      {
        attendance_status: "present",
        check_in_source: "reception_self",
        marked_by: null,
      },
    ]);
  });

  it("books a later class without recording attendance", async () => {
    const h = await base();
    const { api } = await withLink(h);
    const input = { personId: ME(), classId: LATER_TODAY };
    await expect(api.reception.book(input)).resolves.toMatchObject({
      ok: true,
      tier: "confirmed",
    });
    await expect(api.reception.book(input)).resolves.toMatchObject({
      ok: true,
      booked: false,
    });
    expect(await storedBookingCount(h.pg, LATER_TODAY)).toBe(1);
    const stored = await h.pg.query<{
      attendance_status: string;
      check_in_source: string | null;
    }>(
      "SELECT attendance_status, check_in_source FROM class_participation WHERE class_id = $1",
      [LATER_TODAY],
    );
    expect(stored.rows).toEqual([
      { attendance_status: "unmarked", check_in_source: null },
    ]);
  });

  it("refuses to book a class that is already open for check-in", async () => {
    const h = await base();
    const { api } = await withLink(h);
    expect(
      await rejectionCode(
        api.reception.book({ personId: ME(), classId: RUNNING }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(await storedBookingCount(h.pg, RUNNING)).toBe(0);
  });

  it("refuses to check into a class that has not opened yet", async () => {
    const h = await base();
    const { api } = await withLink(h);
    expect(
      await rejectionCode(
        api.reception.checkIn({ personId: ME(), classId: LATER_TODAY }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(await storedBookingCount(h.pg, LATER_TODAY)).toBe(0);
  });

  it("refuses foreign people, foreign classes, and suspended members", async () => {
    const h = await base();
    const { api } = await withLink(h);
    expect(
      await rejectionCode(
        api.reception.checkIn({
          personId: personId(B, FOREIGN),
          classId: RUNNING,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        api.reception.checkIn({ personId: ME(), classId: FOREIGN_CLASS }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(
        api.reception.book({ personId: ME(), classId: FOREIGN_CLASS }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(
        api.reception.checkIn({
          personId: personId(A, "paused"),
          classId: RUNNING,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(await storedBookingCount(h.pg, RUNNING)).toBe(0);
    expect(await storedBookingCount(h.pg, FOREIGN_CLASS)).toBe(0);
  });

  it("keeps membership admission checks and hides the reason", async () => {
    const h = await base();
    await h.exec
      .update(entity)
      .set({ membershipEnforcedAt: new Date() })
      .where(eq(entity.id, A));
    const { api } = await withLink(h);
    await expect(
      api.reception.checkIn({ personId: ME(), classId: RUNNING }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "We couldn't do that right now. Please ask reception for help.",
    });
    await expect(
      api.reception.book({ personId: ME(), classId: LATER_TODAY }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await storedBookingCount(h.pg, RUNNING)).toBe(0);
    expect(await storedBookingCount(h.pg, LATER_TODAY)).toBe(0);
  });

  it("leaves a staff mark as the staff source on a class nobody self-checked", async () => {
    const h = await base();
    await withLink(h);
    await h
      .as(OWNER, A)
      .attendance.addWalkIn({ classId: RUNNING, personId: ME() });
    const stored = await h.pg.query<{ check_in_source: string | null }>(
      "SELECT check_in_source FROM class_participation WHERE class_id = $1",
      [RUNNING],
    );
    expect(stored.rows).toEqual([{ check_in_source: "staff" }]);
  });

  it("keeps the reception source when staff mark the same row afterwards", async () => {
    const h = await base();
    const { api } = await withLink(h);
    await api.reception.checkIn({ personId: ME(), classId: RUNNING });
    await h.as(OWNER, A).attendance.mark({
      classId: RUNNING,
      personId: ME(),
      status: "present",
    });
    const stored = await h.pg.query<{ check_in_source: string | null }>(
      "SELECT check_in_source FROM class_participation WHERE class_id = $1",
      [RUNNING],
    );
    expect(stored.rows).toEqual([{ check_in_source: "reception_self" }]);
  });
});

describe("staff reception", () => {
  it("books a named member onto a class beyond the marking window", async () => {
    const h = await base();
    await expect(
      h.as(OWNER, A).booking.bookFor({
        classId: IN_THREE_DAYS,
        personId: ME(),
      }),
    ).resolves.toMatchObject({ ok: true, tier: "confirmed", booked: true });
    expect(await storedBookingCount(h.pg, IN_THREE_DAYS)).toBe(1);
    const stored = await h.pg.query<{
      attendance_status: string;
      check_in_source: string | null;
    }>(
      "SELECT attendance_status, check_in_source FROM class_participation WHERE class_id = $1",
      [IN_THREE_DAYS],
    );
    expect(stored.rows).toEqual([
      { attendance_status: "unmarked", check_in_source: null },
    ]);
  });

  it("is idempotent and refuses a student, a foreign person and a foreign class", async () => {
    const h = await base();
    const input = { classId: IN_THREE_DAYS, personId: ME() };
    await h.as(OWNER, A).booking.bookFor(input);
    await expect(h.as(OWNER, A).booking.bookFor(input)).resolves.toMatchObject({
      booked: false,
    });
    expect(await storedBookingCount(h.pg, IN_THREE_DAYS)).toBe(1);
    expect(await rejectionCode(h.as(STUDENT, A).booking.bookFor(input))).toBe(
      "FORBIDDEN",
    );
    expect(
      await rejectionCode(
        h.as(OWNER, A).booking.bookFor({
          classId: IN_THREE_DAYS,
          personId: personId(B, FOREIGN),
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(
        h.as(OWNER, A).booking.bookFor({
          classId: FOREIGN_CLASS,
          personId: ME(),
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("links a legacy user-only booking without counting another place", async () => {
    const h = await base();
    await h.exec.insert(classParticipation).values({
      academyId: A,
      classId: IN_THREE_DAYS,
      studentId: STUDENT,
      bookingStatus: "booked",
      bookingTier: "confirmed",
    });

    await expect(
      h.as(OWNER, A).booking.bookFor({
        classId: IN_THREE_DAYS,
        personId: ME(),
      }),
    ).resolves.toMatchObject({ ok: true, booked: false });

    const stored = await h.pg.query<{
      person_organization_id: string | null;
      person_id: string | null;
    }>(
      "SELECT person_organization_id, person_id FROM class_participation WHERE class_id = $1 AND student_id = $2",
      [IN_THREE_DAYS, STUDENT],
    );
    expect(stored.rows).toEqual([
      { person_organization_id: A, person_id: ME() },
    ]);
    expect(await storedBookingCount(h.pg, IN_THREE_DAYS)).toBe(0);
  });

  it("refuses to book a class that already started", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as(OWNER, A).booking.bookFor({ classId: RUNNING, personId: ME() }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(await storedBookingCount(h.pg, RUNNING)).toBe(0);
  });

  it("rejects a user id where booking requires a person id", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as(OWNER, A).booking.bookFor({
          classId: IN_THREE_DAYS,
          personId: STUDENT,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("narrows the roster for staff and stays closed to a student", async () => {
    const h = await base();
    const matches = await h
      .as(OWNER, A)
      .attendance.searchMembers({ query: "jose" });
    expect(matches).toEqual([
      { id: ME(), name: "José Silva", role: "student" },
    ]);
    expect(
      await h.as(OWNER, A).attendance.searchMembers({ query: "search" }),
    ).toHaveLength(6);
    expect(
      await rejectionCode(
        h.as(STUDENT, A).attendance.searchMembers({ query: "jose" }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("reception walk-in leads", () => {
  const visitor = {
    academyId: A,
    firstName: "Rita",
    lastName: "Santos",
    phone: "+351912345678",
    email: "rita@example.com",
    consent: true as const,
    classId: RUNNING,
  };

  it("uses the existing lead list and preserves repeated visitor matching", async () => {
    const h = await base();
    const { api } = await withLink(h);
    await expect(api.reception.submitVisitor(visitor)).resolves.toMatchObject({
      ok: true,
      firstVisit: true,
      booked: false,
      classTitle: "Gi Fundamentals",
    });
    await api.reception.submitVisitor(visitor);
    const leads = await h.as(OWNER, A).dropIn.list();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      firstName: visitor.firstName,
      lastName: visitor.lastName,
      phone: visitor.phone,
      email: visitor.email,
      consent: true,
      stage: "new",
      source: "wall_qr",
      visitCount: 1,
    });
    expect(await h.as("foreign_owner", B).dropIn.list()).toEqual([]);
  });

  it("refuses a foreign branch and a foreign class without creating leads", async () => {
    const h = await base();
    const { api } = await withLink(h);
    expect(
      await rejectionCode(
        api.reception.submitVisitor({ ...visitor, academyId: B }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        api.reception.submitVisitor({ ...visitor, classId: FOREIGN_CLASS }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(await h.as(OWNER, A).dropIn.list()).toEqual([]);
  });
});
