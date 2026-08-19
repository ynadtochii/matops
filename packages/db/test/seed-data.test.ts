import { describe, expect, it } from "vitest";

import { paymentStatus } from "@matops/domain";

import { buildSeedGraph } from "../src/seed/data";
import { SEED_ACADEMIES, seedMemberId } from "../src/seed/registry";

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

  it("makes YOU owner of ALPHA and an active student of BETA", () => {
    const g = build();
    const alphaYou = g.members.find(
      (m) => m.id === seedMemberId(SEED_ACADEMIES.alpha.key, "you"),
    );
    const betaYou = g.members.find(
      (m) => m.id === seedMemberId(SEED_ACADEMIES.beta.key, "you"),
    );
    expect(alphaYou).toMatchObject({
      userId: realUser.id,
      role: "owner",
      status: "active",
    });
    expect(betaYou).toMatchObject({
      userId: realUser.id,
      role: "student",
      status: "active",
    });
  });

  it("never gives YOUR real user a seed_ id (teardown must spare it)", () => {
    const g = build();
    // Every fake user is seed-prefixed; the real user appears only as a member.
    expect(g.users.every((u) => u.id.startsWith("seed_"))).toBe(true);
    expect(g.users.some((u) => u.id === realUser.id)).toBe(false);
    expect(g.members.some((m) => m.userId === realUser.id)).toBe(true);
  });

  it("covers every member status on the ALPHA member list", () => {
    const g = build();
    const alphaStatuses = new Set(
      g.members
        .filter((m) => m.organizationId === SEED_ACADEMIES.alpha.id)
        .map((m) => m.status),
    );
    for (const s of ["active", "pending", "suspended", "removed"]) {
      expect(alphaStatuses).toContain(s);
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

  it("leaves YOU without an open claim, so 'I paid' stays testable", () => {
    const g = build();
    const yourBetaMember = seedMemberId(SEED_ACADEMIES.beta.key, "you");
    // Only a PENDING claim blocks the button (pc_uniq_open_claim is partial on
    // status = 'pending'), so YOU may hold confirmed history and still tap it.
    expect(
      g.claims.some(
        (c) => c.memberId === yourBetaMember && c.status === "pending",
      ),
    ).toBe(false);
    // But some fake member does have an open pending claim.
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
    const ids = new Set([SEED_ACADEMIES.alpha.id, SEED_ACADEMIES.beta.id]);
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
    expect(g.referralAudits).toHaveLength(g.referrals.length);
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
});
