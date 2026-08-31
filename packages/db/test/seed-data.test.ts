import { describe, expect, it } from "vitest";

import { classifyDrift, paymentStatus } from "@matops/domain";

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
    ).toMatchObject({
      userId: realUser.id,
      role: "owner",
      status: "active",
    });
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
    const statuses = new Set(g.members.map((m) => m.status));
    for (const s of ["active", "pending", "suspended", "removed"]) {
      expect(statuses).toContain(s);
    }
    // A pending instructor exists (web-lens approval queue).
    expect(
      g.members.some(
        (m) => m.status === "pending" && m.invitedRole === "instructor",
      ),
    ).toBe(true);
  });

  it("spreads dues across paid / due_soon / overdue", () => {
    const g = build();
    const statuses = new Set(
      g.dues.map((d) => paymentStatus(d.nextDueAt, now)),
    );
    expect(statuses).toContain("paid");
    expect(statuses).toContain("due_soon");
    expect(statuses).toContain("overdue");
  });

  it("covers every claim state without blocking YOUR own 'I paid'", () => {
    const g = build();
    const yourMember = seedMemberId(SEED_ACADEMY.key, "you");
    // Only a PENDING claim blocks the button (pc_uniq_open_claim is partial on
    // status = 'pending'), so YOU may hold confirmed history and still tap it.
    expect(
      g.claims.some((c) => c.memberId === yourMember && c.status === "pending"),
    ).toBe(false);
    expect(g.claims.length).toBeGreaterThan(0);
    expect(g.claims.some((c) => c.status === "pending")).toBe(true);
    expect(g.claims.some((c) => c.status === "confirmed")).toBe(true);
    expect(g.claims.some((c) => c.status === "rejected")).toBe(true);
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
    const withDues = new Set(g.dues.map((d) => d.memberId));
    const activeStudents = g.members.filter(
      (m) => m.role === "student" && m.status === "active",
    );
    expect(activeStudents.some((m) => !withDues.has(m.id))).toBe(true);
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
      ...g.plans,
      ...g.dues,
      ...g.claims,
      ...g.ranks,
      ...g.promotions,
      ...g.notes,
      ...g.dropIns,
      ...g.referrals,
      ...g.referralAudits,
    ];
    expect(scoped.every((r) => ids.has(r.academyId))).toBe(true);
  });

  it("seeds assigned and unassigned referral examples", () => {
    const g = build();
    expect(g.referrals.length).toBeGreaterThan(0);
    expect(g.referralAudits.length).toBeGreaterThanOrEqual(g.referrals.length);
    const assignedStudents = new Set(
      g.referrals.map((row) => row.studentMemberId),
    );
    const studentMembers = g.members.filter(
      (member) => member.role === "student" || member.invitedRole === "student",
    );
    expect(
      studentMembers.some((member) => !assignedStudents.has(member.id)),
    ).toBe(true);
  });

  it("covers all three referral audit actions, cleared keeps a null referrer", () => {
    const g = build();
    const actions = new Set(g.referralAudits.map((a) => a.action));
    expect(actions).toContain("assigned");
    expect(actions).toContain("corrected");
    expect(actions).toContain("cleared");
    const clearedStudent = g.referralAudits.find(
      (a) => a.action === "cleared",
    )?.studentMemberId;
    expect(
      g.referrals.find((r) => r.studentMemberId === clearedStudent)
        ?.referrerMemberId,
    ).toBeNull();
  });

  it("puts an active member in each of the four drift bands", () => {
    const g = build();
    const lastPresent = new Map<string, Date>();
    const started = new Map(g.pastClasses.map((c) => [c.id, c.startsAt]));
    for (const p of g.participations) {
      if (p.attendanceStatus !== "present") continue;
      const startsAt = started.get(p.classId);
      if (!startsAt) continue;
      const seen = lastPresent.get(p.studentId);
      if (!seen || startsAt > seen) lastPresent.set(p.studentId, startsAt);
    }
    const bands = new Set(
      g.members
        .filter((m) => m.role === "student" && m.status === "active")
        .map((m) => classifyDrift(lastPresent.get(m.userId) ?? null, now)),
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

  it("seeds an archived plan that a member is still on", () => {
    const g = build();
    const archived = g.plans.find((p) => p.deletedAt != null);
    expect(archived).toBeDefined();
    expect(g.dues.some((d) => d.planId === archived?.id)).toBe(true);
  });

  it("seeds a coach who has taught nothing, and belts for the staff", () => {
    const g = build();
    const coaches = g.members.filter((m) => m.role === "instructor");
    expect(coaches.length).toBeGreaterThanOrEqual(3);
    const teaching = new Set(g.templates.map((t) => t.instructorId));
    expect(coaches.some((c) => !teaching.has(c.userId))).toBe(true);
    const coachIds = new Set(coaches.map((c) => c.id));
    expect(g.ranks.some((r) => coachIds.has(r.memberId))).toBe(true);
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
