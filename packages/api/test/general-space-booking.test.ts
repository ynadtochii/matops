import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEntity, eq } from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const ORG = "acad_strict";
const BOSS = "u_strict_owner";
const ALEX = "u_strict_alex";
const BEA = "u_strict_bea";
const CHRIS = "u_strict_chris";

const MAT_CLASS = "dddddddd-0000-4000-8000-000000000001";

/** A date `n` days from now, as "YYYY-MM-DD". Inside the booking horizon. */
const inDays = (n: number): string =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * Strict capacity at a general space (ADR 126). PGlite runs one connection, so
 * a true two-client race cannot be staged here; what IS tested is the property
 * that makes the race safe, that the guard lives in the UPDATE's own WHERE, by
 * driving the last place from both sides and checking the count never passes
 * capacity and never double-releases.
 */
describe("one place, one booking", () => {
  let h: Harness;
  let gym: string;
  let session: string;

  const owner = () => h.as(BOSS, ORG);
  const at = (entityId: string, userId: string) => {
    const headers = new Headers();
    headers.set("x-matops-entity", entityId);
    return h.as(userId, ORG, headers);
  };

  const countOf = async (classId: string): Promise<number> => {
    const rows = await h.exec
      .select({ n: classInstance.bookingCount })
      .from(classInstance)
      .where(eq(classInstance.id, classId));
    return rows[0]?.n ?? -1;
  };

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700090",
        members: [
          { userId: BOSS, role: "owner", status: "active" },
          { userId: ALEX, role: "student", status: "active" },
          { userId: BEA, role: "student", status: "active" },
          { userId: CHRIS, role: "student", status: "active" },
        ],
      },
    ]);
    const made = await createEntity(
      {
        organizationId: ORG,
        type: "general_space",
        name: "The Gym",
        ownerUserId: BOSS,
      },
      h.exec,
    );
    gym = made.entityId;

    // Everyone belongs to the gym too, and holds a membership that covers it,
    // since a general branch is enforced from the moment it opens.
    const plan = await owner().accessPlan.create({
      name: "Gym",
      entityIds: [gym],
    });
    for (const userId of [ALEX, BEA, CHRIS]) {
      await owner().accessPlan.assign({ userId, planId: plan.id });
    }

    // Two days out, not a fixed date: booking is capped at seven days ahead
    // (ADR 79), so a hard-coded date drifts out of the window as time passes.
    const created = await at(gym, BOSS).class.create({
      title: "Open gym",
      date: inDays(2),
      startsAtMinutes: 600,
      durationMinutes: 60,
      timeZone: "UTC",
      capacity: 2,
    });
    if (!created) throw new Error("expected a session");
    session = created.id;

    await seedClasses(h.pg, [
      {
        id: MAT_CLASS,
        academyId: ORG,
        instructorId: BOSS,
        startsInMinutes: 600,
      },
    ]);
  });

  afterAll(() => h.close());

  it("fills the session up to its capacity", async () => {
    await at(gym, ALEX).booking.book({ classId: session });
    await at(gym, BEA).booking.book({ classId: session });
    expect(await countOf(session)).toBe(2);
  });

  it("refuses the third, and books nobody in doing so", async () => {
    expect(
      await rejectionCode(at(gym, CHRIS).booking.book({ classId: session })),
    ).toBe("CONFLICT");
    // The count did not move, and no participation row survived the rollback.
    expect(await countOf(session)).toBe(2);
    const rows = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "class_participation"
        WHERE class_id = '${session}' AND student_id = '${CHRIS}'`,
    );
    expect(rows.rows[0]?.n).toBe(0);
  });

  it("refuses a walk-in at the door too, since the room is still full", async () => {
    // Check-in is for a class happening NOW, so this needs its own session
    // rather than the one two days out that the bookings above use.
    const now = await at(gym, BOSS).class.create({
      title: "On now",
      date: inDays(0),
      startsAtMinutes: new Date().getUTCHours() * 60,
      durationMinutes: 60,
      timeZone: "UTC",
      capacity: 1,
    });
    if (!now) throw new Error("expected a session");

    await at(gym, BOSS).attendance.addWalkIn({
      classId: now.id,
      studentId: ALEX,
    });
    expect(await countOf(now.id)).toBe(1);

    expect(
      await rejectionCode(at(gym, CHRIS).checkin.checkIn({ classId: now.id })),
    ).toBe("CONFLICT");
    expect(await countOf(now.id)).toBe(1);
  });

  it("frees exactly one place on cancel, and lets the next person in", async () => {
    await at(gym, ALEX).booking.cancel({ classId: session });
    expect(await countOf(session)).toBe(1);

    await at(gym, CHRIS).booking.book({ classId: session });
    expect(await countOf(session)).toBe(2);
  });

  it("does not release a second place when cancel is repeated", async () => {
    await at(gym, CHRIS).booking.cancel({ classId: session });
    expect(await countOf(session)).toBe(1);
    await at(gym, CHRIS).booking.cancel({ classId: session });
    expect(await countOf(session)).toBe(1);
  });

  it("takes no second place when a booking is repeated", async () => {
    await at(gym, CHRIS).booking.book({ classId: session });
    const before = await countOf(session);
    await at(gym, CHRIS).booking.book({ classId: session });
    expect(await countOf(session)).toBe(before);
  });

  it("gives a pending member no provisional place at a general space", async () => {
    const PENDING = "u_strict_pending";
    await h.pg.exec(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ('${PENDING}', 'Pending', '${PENDING}@test.local', true, now(), now());
       INSERT INTO "member" (id, organization_id, user_id, role, created_at)
         VALUES ('mem_pending', '${ORG}', '${PENDING}', 'member', now());
       INSERT INTO "entity_membership"
         (id, organization_id, entity_id, user_id, role, status)
         VALUES ('emem_pending', '${ORG}', '${gym}', '${PENDING}', 'member', 'pending');`,
    );
    const before = await countOf(session);
    expect(
      await rejectionCode(at(gym, PENDING).booking.book({ classId: session })),
    ).toBe("FORBIDDEN");
    expect(await countOf(session)).toBe(before);
  });

  it("takes a place when the desk admits somebody who never booked", async () => {
    // Yesterday, in its own slot: one general branch runs one session at a
    // time, so today's check-in session must not be overlapped, and marking
    // attendance is allowed for today or the last fortnight.
    const now = await at(gym, BOSS).class.create({
      title: "Yesterday, early",
      date: inDays(-1),
      startsAtMinutes: 9 * 60,
      durationMinutes: 60,
      timeZone: "UTC",
      capacity: 1,
    });
    if (!now) throw new Error("expected a session");

    await at(gym, BOSS).attendance.addWalkIn({
      classId: now.id,
      studentId: ALEX,
    });
    expect(await countOf(now.id)).toBe(1);

    // The room is full, so the second walk-in is refused at the desk too.
    expect(
      await rejectionCode(
        at(gym, BOSS).attendance.addWalkIn({
          classId: now.id,
          studentId: BEA,
        }),
      ),
    ).toBe("CONFLICT");
    expect(await countOf(now.id)).toBe(1);
  });

  it("does not take a second place when the desk marks the same person again", async () => {
    // Attendance can only be marked for today or the last fortnight, so this
    // uses a session on now rather than the booked one two days out.
    const now = await at(gym, BOSS).class.create({
      title: "Yesterday, later",
      date: inDays(-1),
      startsAtMinutes: 14 * 60,
      durationMinutes: 60,
      timeZone: "UTC",
      capacity: 5,
    });
    if (!now) throw new Error("expected a session");

    await at(gym, BOSS).attendance.addWalkIn({
      classId: now.id,
      studentId: CHRIS,
    });
    expect(await countOf(now.id)).toBe(1);

    await at(gym, BOSS).attendance.addWalkIn({
      classId: now.id,
      studentId: CHRIS,
    });
    expect(await countOf(now.id)).toBe(1);
  });

  it("answers whether each branch enforces payment", async () => {
    const covered = await at(gym, CHRIS).booking.access();
    expect([covered.locked, covered.message]).toEqual([false, null]);

    const open = await at(ORG, ALEX).booking.access();
    expect([open.locked, open.message]).toEqual([false, null]);
  });

  it("names the branch when the branch is the reason", async () => {
    const PENDING2 = "u_strict_waiting";
    await h.pg.exec(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ('${PENDING2}', 'Waiting', '${PENDING2}@test.local', true, now(), now());
       INSERT INTO "member" (id, organization_id, user_id, role, created_at)
         VALUES ('mem_waiting', '${ORG}', '${PENDING2}', 'member', now());
       INSERT INTO "entity_membership"
         (id, organization_id, entity_id, user_id, role, status)
         VALUES ('emem_waiting', '${ORG}', '${gym}', '${PENDING2}', 'member', 'pending');`,
    );
    const seen = await at(gym, PENDING2).booking.access();
    expect(seen.locked).toBe(true);
    expect(seen.message).toContain("The Gym");
  });

  it("keeps cancel working while booking is blocked", async () => {
    // Chris books, then the room is taken away from him by ending his
    // membership. He still gets to give the place back.
    const held = await owner().accessPlan.forUser({ userId: CHRIS });
    const assignment = held[0];
    if (!assignment) throw new Error("expected a membership");
    await owner().accessPlan.cancel({ id: assignment.id });

    const blocked = await at(gym, CHRIS).booking.access();
    expect(blocked.locked).toBe(true);

    await at(gym, CHRIS).booking.cancel({ classId: session });
    const rows = await h.pg.query<{ status: string }>(
      `SELECT booking_status AS status FROM "class_participation"
        WHERE class_id = '${session}' AND student_id = '${CHRIS}'`,
    );
    expect(rows.rows[0]?.status).toBe("cancelled");
  });

  it("never gates staff on a membership, at either door", async () => {
    const seen = await at(gym, BOSS).booking.access();
    expect([seen.locked, seen.message]).toEqual([false, null]);

    const soon = await at(gym, BOSS).class.create({
      title: "Staff booking",
      date: inDays(3),
      startsAtMinutes: 600,
      durationMinutes: 60,
      timeZone: "UTC",
      capacity: 5,
    });
    if (!soon) throw new Error("expected a session");
    await expect(
      at(gym, BOSS).booking.book({ classId: soon.id }),
    ).resolves.toBeDefined();
  });

  it("refuses a QR check-in the booking gate would refuse", async () => {
    // Chris lost his membership in the test above. The door runs the same gate
    // as the booking screen, so scanning is not a way round it (ADR 126).
    // The earlier live session is cancelled first: one room, one session, and
    // a cancelled one gives the room back.
    await h.exec
      .update(classInstance)
      .set({ status: "cancelled" })
      .where(eq(classInstance.title, "On now"));
    const live = await at(gym, BOSS).class.create({
      title: "Door check",
      date: inDays(0),
      startsAtMinutes: new Date().getUTCHours() * 60,
      durationMinutes: 60,
      timeZone: "UTC",
      capacity: 10,
    });
    if (!live) throw new Error("expected a session");

    expect(
      await rejectionCode(at(gym, CHRIS).checkin.checkIn({ classId: live.id })),
    ).toBe("PRECONDITION_FAILED");
    expect(await countOf(live.id)).toBe(0);
  });

  it("claims a place for a walk-in whose booking was cancelled", async () => {
    const past = await at(gym, BOSS).class.create({
      title: "Yesterday, evening",
      date: inDays(-1),
      startsAtMinutes: 19 * 60,
      durationMinutes: 60,
      timeZone: "UTC",
      capacity: 1,
    });
    if (!past) throw new Error("expected a session");

    // A cancelled booking gave its place back, so the row protects nothing.
    await h.exec.insert(classParticipation).values({
      academyId: gym,
      classId: past.id,
      studentId: ALEX,
      bookingStatus: "cancelled",
      bookingTier: "confirmed",
    });
    expect(await countOf(past.id)).toBe(0);

    await at(gym, BOSS).attendance.addWalkIn({
      classId: past.id,
      studentId: ALEX,
    });
    expect(await countOf(past.id)).toBe(1);

    // The room is full again, and marking the same person twice takes no
    // second place.
    expect(
      await rejectionCode(
        at(gym, BOSS).attendance.addWalkIn({
          classId: past.id,
          studentId: BEA,
        }),
      ),
    ).toBe("CONFLICT");
    await at(gym, BOSS).attendance.addWalkIn({
      classId: past.id,
      studentId: ALEX,
    });
    expect(await countOf(past.id)).toBe(1);
  });

  it("says why each person is on the roster, and never calls them a visitor", async () => {
    const roster = await at(gym, BOSS).membership.members();
    // By user id: the gym membership was created by the assignment, so its
    // `member_id` is a generated uuid rather than the seeded `emem_` shape.
    const bea = roster.find((r) => r.userId === BEA);
    expect(bea?.membership?.covered).toBe(true);
    expect(bea?.membership?.planNames).toEqual(["Gym"]);
    expect(bea?.membership?.verdict).toBe("ok");
  });

  it("says nothing about memberships when enforcement is off", async () => {
    const roster = await at(ORG, BOSS).membership.members();
    expect(roster.every((r) => r.membership === null)).toBe(true);
  });

  it("gives the owner one directory row per person across branches", async () => {
    const directory = await owner().stats.organizationMembers();
    const alex = directory.rows.find((r) => r.userId === ALEX);
    expect(alex?.branches.map((b) => b.entityId).sort()).toEqual(
      [ORG, gym].sort(),
    );
    expect(directory.rows.filter((r) => r.userId === ALEX)).toHaveLength(1);
    expect(directory.entities.map((e) => e.id).sort()).toEqual(
      [ORG, gym].sort(),
    );
  });

  it("says which pending seats are coach requests", async () => {
    const rows = (await owner().stats.organizationMembers()).rows;
    for (const row of rows) {
      for (const branch of row.branches) {
        expect(branch).toHaveProperty("invitedRole");
      }
    }
  });

  it("keeps the whole directory away from a non-owner", async () => {
    expect(
      await rejectionCode(h.as(ALEX, ORG).stats.organizationMembers()),
    ).toBe("FORBIDDEN");
  });

  it("counts a person once for the gym and twice as enrolments", async () => {
    const m = await owner().stats.organizationMetrics();
    // Alex belongs to both branches, so one member and two enrolments.
    const enrolments = m.enrolmentsByBranch.reduce((n, b) => n + b.count, 0);
    expect(m.enrolledMembers).toBeLessThan(enrolments);
    expect(m.enrolledMembers).toBeGreaterThan(0);
  });

  it("reports no revenue at all", async () => {
    const m = await owner().stats.organizationMetrics();
    expect(Object.keys(m)).not.toContain("revenue");
    const { paid, withinGrace, blocked } = m.payment;
    expect(paid + withinGrace + blocked).toBeGreaterThanOrEqual(0);
  });

  it("tells the settings screen which gate the branch runs on", async () => {
    const atGym = await at(gym, BOSS).academy.current();
    const atMat = await at(ORG, BOSS).academy.current();
    expect(atGym?.membershipEnforced).toBe(true);
    expect(atMat?.membershipEnforced).toBe(false);
  });

  it("leaves the BJJ soft cap exactly as it was", async () => {
    // The mat's class was seeded with the default `soft` policy, so it takes
    // more bookings than it has places and shows the count red (spec §4).
    await h.exec
      .update(classInstance)
      .set({ capacity: 1 })
      .where(eq(classInstance.id, MAT_CLASS));

    await at(ORG, ALEX).booking.book({ classId: MAT_CLASS });
    await at(ORG, BEA).booking.book({ classId: MAT_CLASS });
    expect(await countOf(MAT_CLASS)).toBe(2);
  });
});
