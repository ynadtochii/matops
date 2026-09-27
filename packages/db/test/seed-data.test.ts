import { describe, expect, it } from "vitest";

import { appliesInMonth, classifyDrift, monthOf } from "@matops/domain";

import { buildSeedGraph } from "../src/seed/data";
import { SEED_ACADEMY, seedMemberId } from "../src/seed/registry";

/**
 * Pure coverage for the seed dataset builder — no DB. Locks the promise that the
 * data lights up every UI state and is deterministic given (now, id generator).
 */
describe("buildSeedGraph — pure dataset", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const realUser = { id: "real_you_123", name: "Yevhenii Real" };
  // A counter id generator → deterministic uuids-in-name-only for assertions.
  const build = () => {
    let n = 0;
    return buildSeedGraph({ realUser, now, newId: () => `id_${n++}` });
  };

  it("is deterministic given the same now + id generator", () => {
    expect(JSON.stringify(build())).toEqual(JSON.stringify(build()));
  });

  it("builds exactly one academy, owned by YOU", () => {
    const g = build();
    expect(g.organizations).toHaveLength(1);
    expect(g.organizations[0]).toMatchObject({
      id: SEED_ACADEMY.id,
      name: "Alma beta",
    });
    expect(
      g.members.find((m) => m.id === seedMemberId(SEED_ACADEMY.key, "you")),
    ).toMatchObject({ userId: realUser.id, role: "owner" });
    expect(
      g.entityMemberships.find(
        (m) => m.userId === realUser.id && m.entityId === SEED_ACADEMY.id,
      ),
    ).toMatchObject({ role: "owner", status: "active" });
    expect(g.members.filter((m) => m.role === "owner")).toHaveLength(1);
  });

  it("never gives YOUR real user a seed_ id (teardown must spare it)", () => {
    const g = build();
    // Every fake user is seed-prefixed; the real user appears only as a member.
    expect(g.users.every((u) => u.id.startsWith("seed_"))).toBe(true);
    expect(g.users.some((u) => u.id === realUser.id)).toBe(false);
    expect(g.members.some((m) => m.userId === realUser.id)).toBe(true);
  });

  it("covers every member status on the member list", () => {
    const g = build();
    const statuses = new Set(g.entityMemberships.map((m) => m.status));
    for (const s of ["active", "pending", "suspended", "archived", "removed"]) {
      expect(statuses).toContain(s);
    }
    // A pending instructor exists (web-lens approval queue).
    expect(
      g.entityMemberships.some(
        (m) => m.status === "pending" && m.invitedRole === "instructor",
      ),
    ).toBe(true);
  });

  it("runs the academy approval-only and keeps the membership rows", () => {
    const g = build();
    expect(g.entities[0]?.membershipEnforcedAt).toBeNull();
    expect(g.memberships.policies).toHaveLength(1);
    expect(g.memberships.plans.length).toBeGreaterThan(0);
    expect(g.memberships.assignments.length).toBeGreaterThan(0);
    // Every membership row belongs to the organization, never to a branch.
    const orgScoped = [
      ...g.memberships.policies,
      ...g.memberships.plans,
      ...g.memberships.planPrices,
      ...g.memberships.planEntities,
      ...g.memberships.assignments,
      ...g.memberships.changes,
      ...g.memberships.months,
      ...g.memberships.monthAudits,
    ];
    expect(
      orgScoped.every((row) => row.organizationId === SEED_ACADEMY.id),
    ).toBe(true);
  });

  it("seeds explicit month states and settles last month", () => {
    const g = build();
    const month = monthOf(now, SEED_ACADEMY.timeZone);
    const live = g.memberships.assignments.filter((a) =>
      appliesInMonth(
        { startMonth: a.startMonth, endMonth: a.endMonth ?? null },
        month,
      ),
    );
    expect(live.length).toBeGreaterThan(0);
    const thisMonth = g.memberships.months.filter((m) => m.month === month);
    expect(thisMonth.some((m) => m.status === "confirmed")).toBe(true);
    expect(thisMonth.some((m) => m.status === "reported")).toBe(true);
    // Silence is a state too: somebody who owes has no row for this month.
    const told = new Set(thisMonth.map((m) => m.assignmentId));
    expect(live.some((a) => !told.has(a.id ?? ""))).toBe(true);
    expect(
      g.memberships.months.some(
        (m) => m.month !== month && m.status === "confirmed",
      ),
    ).toBe(true);
  });

  it("seeds a plan change that waits for the 1st, and a claimed purchase", () => {
    const g = build();
    const change = g.memberships.changes[0];
    expect(change).toBeDefined();
    const source = g.memberships.assignments.find(
      (a) => a.id === change?.sourceAssignmentId,
    );
    const target = g.memberships.assignments.find(
      (a) => a.id === change?.targetAssignmentId,
    );
    expect(source?.endMonth).toBe(change?.effectiveMonth);
    expect(target?.startMonth).toBe(change?.effectiveMonth);
    expect(g.memberships.months.some((row) => row.status === "reported")).toBe(
      true,
    );
  });

  it("covers the remaining demo states: unmarked, cancelled booking, paused, no plan", () => {
    const g = build();
    const pastIds = new Set(g.pastClasses.map((c) => c.id));
    expect(
      g.participations.some(
        (p) =>
          pastIds.has(p.classId) &&
          p.bookingStatus === "booked" &&
          p.attendanceStatus === "unmarked",
      ),
    ).toBe(true);
    expect(g.participations.some((p) => p.bookingStatus === "cancelled")).toBe(
      true,
    );
    expect(g.templates.some((t) => t.status === "paused")).toBe(true);
    const holding = new Set(
      g.memberships.assignments.map((assignment) => assignment.personId),
    );
    const activeStudents = g.entityMemberships.filter(
      (m) => m.role === "student" && m.status === "active",
    );
    expect(
      activeStudents.some((m) => {
        return m.personId ? !holding.has(m.personId) : false;
      }),
    ).toBe(true);
  });

  it("seeds a manager who runs the gym without training at it", () => {
    const g = build();
    const manager = g.members.find((m) => m.role === "manager");
    expect(manager).toBeDefined();
    // No entity membership: managing a branch must never enrol them as a
    // student of it (ADR 129).
    expect(g.entityMemberships.some((m) => m.userId === manager?.userId)).toBe(
      false,
    );
    // Staff hold no membership — an active one trains free (ADR 132).
    const managerPerson = g.people.find(
      (candidate) => candidate.accountUserId === manager?.userId,
    );
    expect(
      g.memberships.assignments.some(
        (assignment) => assignment.personId === managerPerson?.id,
      ),
    ).toBe(false);
  });

  it("seeds attendance history with both present and absent marks", () => {
    const g = build();
    const marks = new Set(g.participations.map((p) => p.attendanceStatus));
    expect(marks).toContain("present");
    expect(marks).toContain("absent");
    // A walk-in: attended without a booking.
    expect(
      g.participations.some(
        (p) => p.bookingStatus === "none" && p.attendanceStatus === "present",
      ),
    ).toBe(true);
  });

  it("seeds ranks in two disciplines with a promotion timeline", () => {
    const g = build();
    const disciplines = new Set(g.ranks.map((r) => r.discipline));
    expect(disciplines).toContain("bjj");
    expect(disciplines).toContain("judo");
    // First-grant promotions have a null from-belt.
    expect(g.promotions.some((p) => p.fromBelt === null)).toBe(true);
    expect(g.promotions.some((p) => p.fromBelt !== null)).toBe(true);
  });

  it("every tenant row is scoped to a seed academy id", () => {
    const g = build();
    const ids = new Set([SEED_ACADEMY.id]);
    const scoped = [
      ...g.templates,
      ...g.pastClasses,
      ...g.participations,
      ...g.ranks,
      ...g.promotions,
      ...g.notes,
      ...g.dropIns,
    ];
    expect(scoped.every((r) => ids.has(r.academyId))).toBe(true);
  });

  it("puts an active member in each of the four drift bands", () => {
    const g = build();
    const lastPresent = new Map<string, Date>();
    const started = new Map(g.pastClasses.map((c) => [c.id, c.startsAt]));
    for (const p of g.participations) {
      if (p.attendanceStatus !== "present") continue;
      const startsAt = started.get(p.classId);
      if (!startsAt) continue;
      const subjectId = p.personId ?? p.studentId;
      if (!subjectId) continue;
      const seen = lastPresent.get(subjectId);
      if (!seen || startsAt > seen) lastPresent.set(subjectId, startsAt);
    }
    const bands = new Set(
      g.entityMemberships
        .filter((m) => m.role === "student" && m.status === "active")
        .flatMap((m) => {
          const subjectId = m.personId ?? m.userId;
          return subjectId
            ? [classifyDrift(lastPresent.get(subjectId) ?? null, now)]
            : [];
        }),
    );
    for (const band of ["active", "cooling", "at_risk", "dormant"]) {
      expect(bands).toContain(band);
    }
  });

  it("seeds a one-off class, a cancelled class, and every discipline", () => {
    const g = build();
    expect(g.pastClasses.some((c) => c.templateId === null)).toBe(true);
    expect(g.pastClasses.some((c) => c.status === "cancelled")).toBe(true);
    const disciplines = new Set(g.templates.map((t) => t.discipline));
    for (const d of ["bjj", "nogi", "other"]) {
      expect(disciplines).toContain(d);
    }
  });

  it("seeds an archived membership plan with no assignments", () => {
    const g = build();
    const archived = g.memberships.plans.find((p) => p.archivedAt != null);
    expect(archived).toBeDefined();
    expect(
      g.memberships.assignments.some((a) => a.planId === archived?.id),
    ).toBe(false);
  });

  it("seeds a coach who has taught nothing, and belts for the staff", () => {
    const g = build();
    const coaches = g.members.filter((m) => m.role === "instructor");
    expect(coaches.length).toBeGreaterThanOrEqual(3);
    const teaching = new Set(g.templates.map((t) => t.instructorId));
    expect(coaches.some((c) => !teaching.has(c.userId))).toBe(true);
    const coachUsers = new Set(coaches.map((c) => c.userId));
    const coachMemberships = new Set(
      g.entityMemberships
        .filter((m) => (m.userId ? coachUsers.has(m.userId) : false))
        .map((m) => m.id),
    );
    expect(g.ranks.some((r) => coachMemberships.has(r.memberId))).toBe(true);
  });

  it("seeds a class-linked lead and a lead with no contact consent", () => {
    const g = build();
    const classIds = new Set(g.pastClasses.map((c) => c.id));
    const leadIds = new Set(g.dropIns.map((d) => d.id));
    expect(
      g.dropInVisits.some(
        (v) => classIds.has(v.classId) && leadIds.has(v.dropInId),
      ),
    ).toBe(true);
    expect(g.dropIns.some((d) => !d.consent)).toBe(true);
  });
});
