/**
 * "Fill an existing academy" mode — add fake students (and their dues, bookings,
 * attendance, ranks, notes) AROUND the real owner of a real academy, so the gym
 * looks alive when you sign in. Unlike the two-fake-academy seed (data.ts/run.ts),
 * this writes into a REAL academy, so teardown must be surgical:
 *
 *   - it NEVER touches the academy, its plans, its templates, its real classes,
 *     or its real members;
 *   - it removes ONLY rows tied to a `seed_` member/user id.
 *
 * Fake students reuse the academy's EXISTING plans (dues) and EXISTING classes
 * (bookings/attendance) — the seed adds no plan/class/template of its own here.
 * `booking_count` on each real class is RECOMPUTED from its confirmed bookings on
 * both fill and clear, so it stays correct with fakes added or removed.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull, like } from "drizzle-orm";

import { paymentPeriod } from "@matops/domain";

import type { SeedExec } from "./registry";
import { recomputeBookingCounts } from "../erase";
import {
  classInstance,
  classParticipation,
  entity,
  entityMembership,
  member,
  memberDues,
  memberNote,
  memberRank,
  memberReferral,
  memberReferralAudit,
  membershipPlan,
  paymentClaim,
  rankPromotion,
  user,
} from "../schema";
import { SEED_MARKER } from "./registry";

const DAY_MS = 24 * 60 * 60 * 1000;

export type FillReport = Record<string, number>;

const FIRST_NAMES = [
  "Sam",
  "Alex",
  "Jordan",
  "Casey",
  "Riley",
  "Taylor",
  "Morgan",
  "Jamie",
  "Drew",
  "Quinn",
  "Avery",
  "Reese",
  "Skyler",
  "Cameron",
  "Rowan",
  "Emerson",
  "Finley",
  "Hayden",
  "Kai",
  "Lennox",
  "Marlow",
  "Nico",
];
const LAST_NAMES = [
  "Silva",
  "Nguyen",
  "Kowalski",
  "Okafor",
  "Rossi",
  "Haddad",
  "Novak",
  "Costa",
  "Fischer",
  "Dubois",
  "Ivanov",
  "Popescu",
  "Andersen",
  "Reyes",
  "Bauer",
  "Moreau",
  "Larsen",
  "Kovac",
  "Weber",
  "Sato",
  "Mensah",
  "Petrov",
];

/** A fake student to add to a real academy, all ids `seed_`-prefixed. */
interface FakeStudent {
  userId: string;
  orgMemberId: string;
  memberId: string;
  name: string;
  email: string;
  phone: string;
  status: string; // active | pending | suspended | removed
  role: string; // student | member (pending holds the harmless default)
  invitedRole: string;
}

/** A short, stable per-academy key so fake ids don't collide across academies. */
function academyKey(academyId: string): string {
  return academyId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase();
}

/** The `user.id` prefix for THIS academy's fakes — the exact teardown key. */
function fillUserPrefix(academyId: string): string {
  return `${SEED_MARKER}user_fill_${academyKey(academyId)}_`;
}

/** Build the fake-student list for one academy (varied statuses for the UI). */
function buildFakeStudents(academyId: string, count = 20): FakeStudent[] {
  const key = academyKey(academyId);
  return Array.from({ length: count }, (_, i) => {
    const handle = `fill_${key}_s${String(i + 1).padStart(2, "0")}`;
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`;
    // Mostly active; a couple pending, one pending-instructor, one suspended, one removed.
    let status = "active";
    let role = "student";
    let invitedRole = "student";
    if (i === 14 || i === 15) {
      status = "pending";
      role = "member";
    } else if (i === 16) {
      status = "pending";
      role = "member";
      invitedRole = "instructor";
    } else if (i === 17) {
      status = "suspended";
    } else if (i === 18) {
      status = "removed";
    }
    return {
      userId: `${SEED_MARKER}user_${handle}`,
      orgMemberId: `${SEED_MARKER}mem_${handle}`,
      memberId: `${SEED_MARKER}emem_${handle}`,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.${key}${i + 1}@example.com`,
      phone: `+38050${String(2000000 + i).slice(-7)}`,
      status,
      role,
      invitedRole,
    };
  });
}

/** How many fake (seed_) members this academy currently holds. */
export async function academyFakeCount(
  exec: SeedExec,
  academyId: string,
): Promise<number> {
  const rows = await exec
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, academyId),
        like(member.id, `${SEED_MARKER}%`),
      ),
    );
  return rows.length;
}

/** Resolve an academy by its 6-digit public code → { id, name } or null. */
export async function findAcademyByPublicCode(
  exec: SeedExec,
  code: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await exec
    .select({ id: entity.id, name: entity.name })
    .from(entity)
    .where(and(eq(entity.publicCode, code), isNull(entity.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** The academy's active owner user id (for audit fields), or null. */
async function findOwnerUserId(
  exec: SeedExec,
  academyId: string,
): Promise<string | null> {
  const rows = await exec
    .select({ userId: entityMembership.userId })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.entityId, academyId),
        eq(entityMembership.role, "owner"),
        eq(entityMembership.status, "active"),
      ),
    )
    .limit(1);
  return rows[0]?.userId ?? null;
}

/**
 * Add fake students + their data to a real academy. Assumes it has no fake
 * members yet (the CLI guards; run `clear` first to rebuild).
 */
export async function fillAcademy(
  exec: SeedExec,
  opts: { academyId: string; now?: Date; studentCount?: number },
): Promise<FillReport> {
  const now = opts.now ?? new Date();
  const academyId = opts.academyId;
  const report: FillReport = {};
  const students = buildFakeStudents(academyId, opts.studentCount ?? 20);
  const active = students.filter((s) => s.status === "active");
  // Staff id for audit fields (marked_by / updated_by / author). Falls back to the
  // fake's own id if the academy somehow has no active owner.
  const staffId =
    (await findOwnerUserId(exec, academyId)) ??
    active[0]?.userId ??
    "seed_system";

  // 1. Fake users + members.
  await exec
    .insert(user)
    .values(
      students.map((s) => ({
        id: s.userId,
        name: s.name,
        email: s.email,
        emailVerified: true,
        phone: s.phone,
      })),
    )
    .onConflictDoNothing();
  report.user = students.length;

  await exec
    .insert(member)
    .values(
      students.map((s, i) => ({
        id: s.orgMemberId,
        organizationId: academyId,
        userId: s.userId,
        role: s.role,
        createdAt: new Date(now.getTime() - (150 - i * 3) * DAY_MS),
      })),
    )
    .onConflictDoNothing();
  report.member = students.length;

  await exec
    .insert(entityMembership)
    .values(
      students.map((s, i) => {
        const createdAt = new Date(now.getTime() - (150 - i * 3) * DAY_MS);
        return {
          id: s.memberId,
          organizationId: academyId,
          entityId: academyId,
          userId: s.userId,
          role: s.role,
          status: s.status,
          invitedRole: s.invitedRole,
          joinedAt: s.status === "active" ? createdAt : null,
          createdAt,
          updatedAt: createdAt,
        };
      }),
    )
    .onConflictDoNothing();
  report.entity_membership = students.length;

  // 2. Dues on the academy's EXISTING plans (skip if the owner has none yet).
  const plans = await exec
    .select({
      id: membershipPlan.id,
      priceMinor: membershipPlan.priceMinor,
      currency: membershipPlan.currency,
    })
    .from(membershipPlan)
    .where(
      and(
        eq(membershipPlan.academyId, academyId),
        isNull(membershipPlan.deletedAt),
      ),
    );
  const primary = plans[0];
  if (primary) {
    const dueOffsets = [2, 22, -6, 40, -20]; // paid / due-soon / overdue mix
    const duesTargets = students.filter(
      (s) => s.status === "active" || s.status === "suspended",
    );
    await exec
      .insert(memberDues)
      .values(
        duesTargets.map((s, i) => ({
          id: randomUUID(),
          academyId,
          memberId: s.memberId,
          planId: (plans[i % plans.length] ?? primary).id,
          nextDueAt: new Date(
            now.getTime() + (dueOffsets[i % dueOffsets.length] ?? 0) * DAY_MS,
          ),
        })),
      )
      .onConflictDoNothing();
    report.member_dues = duesTargets.length;

    // One fake open claim plus confirmed history for referral reporting.
    if (active[0]) {
      await exec.insert(paymentClaim).values({
        id: randomUUID(),
        academyId,
        memberId: active[0].memberId,
        planId: primary.id,
        amountMinor: primary.priceMinor,
        currency: primary.currency,
        period: paymentPeriod(now),
        status: "pending",
      });
      const confirmed = active.slice(0, 8).flatMap((student, index) => {
        const plan = plans[index % plans.length] ?? primary;
        return [
          {
            id: randomUUID(),
            academyId,
            memberId: student.memberId,
            planId: plan.id,
            amountMinor: plan.priceMinor,
            currency: plan.currency,
            period: paymentPeriod(now),
            status: "confirmed" as const,
            confirmedBy: staffId,
            confirmedAt: now,
            claimedAt: new Date(now.getTime() - DAY_MS),
          },
          {
            id: randomUUID(),
            academyId,
            memberId: student.memberId,
            planId: plan.id,
            amountMinor: plan.priceMinor,
            currency: plan.currency,
            period: paymentPeriod(new Date(now.getTime() - 45 * DAY_MS)),
            status: "confirmed" as const,
            confirmedBy: staffId,
            confirmedAt: new Date(now.getTime() - 45 * DAY_MS),
            claimedAt: new Date(now.getTime() - 46 * DAY_MS),
          },
        ];
      });
      if (confirmed.length > 0) {
        await exec.insert(paymentClaim).values(confirmed);
      }
      let rejectedCount = 0;
      // A rejected claim — the third claim state, so a demo shows all three.
      if (active[1]) {
        await exec.insert(paymentClaim).values({
          id: randomUUID(),
          academyId,
          memberId: active[1].memberId,
          planId: primary.id,
          amountMinor: primary.priceMinor,
          currency: primary.currency,
          period: paymentPeriod(new Date(now.getTime() - 32 * DAY_MS)),
          status: "rejected",
          claimedAt: new Date(now.getTime() - 30 * DAY_MS),
        });
        rejectedCount = 1;
      }
      report.payment_claim = 1 + confirmed.length + rejectedCount;
    }
  }

  // Multiple referrers + unassigned examples. All referral rows target fakes,
  // which keeps `clear` surgical even though the actor is the real owner.
  const referralCandidates = active.slice(-2);
  const referralTargets = active
    .slice(0, Math.max(0, active.length - referralCandidates.length))
    .slice(0, 10);
  const referralRows = referralTargets.map((student, index) => ({
    id: randomUUID(),
    academyId,
    studentMemberId: student.memberId,
    referrerMemberId:
      referralCandidates[index % referralCandidates.length]?.memberId,
    assignedBy: staffId,
    createdAt: new Date(now.getTime() - 60 * DAY_MS),
    updatedAt: new Date(now.getTime() - 60 * DAY_MS),
  }));
  if (
    referralRows.length > 0 &&
    referralRows.every((row) => row.referrerMemberId)
  ) {
    await exec.insert(memberReferral).values(referralRows);
    await exec.insert(memberReferralAudit).values(
      referralRows.map((row) => ({
        id: randomUUID(),
        academyId,
        studentMemberId: row.studentMemberId,
        oldReferrerMemberId: null,
        newReferrerMemberId: row.referrerMemberId,
        action: "assigned" as const,
        actorId: staffId,
        occurredAt: row.createdAt,
      })),
    );
    report.member_referral = referralRows.length;
    report.member_referral_audit = referralRows.length;
  }

  // 3. Bookings + attendance on the academy's EXISTING classes.
  const classes = await exec
    .select({ id: classInstance.id, startsAt: classInstance.startsAt })
    .from(classInstance)
    .where(
      and(
        eq(classInstance.academyId, academyId),
        isNull(classInstance.deletedAt),
        eq(classInstance.status, "scheduled"),
      ),
    )
    .orderBy(classInstance.startsAt);
  const bookHorizon = new Date(now.getTime() + 10 * DAY_MS);
  const parts: (typeof classParticipation.$inferInsert)[] = [];
  const lastPastIndex = classes.reduce(
    (last, cls, i) => (cls.startsAt < now ? i : last),
    -1,
  );
  classes.forEach((cls, ci) => {
    const isPast = cls.startsAt < now;
    // The most recent past class stays unmarked, so the owner can demo
    // "mark all present" on it.
    const leaveUnmarked = ci === lastPastIndex;
    const isBookable = !isPast && cls.startsAt <= bookHorizon;
    if (!isPast && !isBookable) return; // far-future stays empty
    const takers = active.filter((_, si) => (si + ci) % 3 !== 0);
    // Every 4th class keeps a cancelled booking (student booked, then bailed).
    const quitter = active.find((_, si) => (si + ci) % 3 === 0);
    if (ci % 4 === 0 && quitter) {
      parts.push({
        id: randomUUID(),
        academyId,
        classId: cls.id,
        studentId: quitter.userId,
        bookingStatus: "cancelled",
        bookingTier: "confirmed",
        bookedAt: new Date(cls.startsAt.getTime() - 2 * DAY_MS),
        cancelledAt: new Date(cls.startsAt.getTime() - DAY_MS),
        attendanceStatus: "unmarked",
      });
    }
    takers.forEach((s, ti) => {
      const present = (ti + ci) % 5 !== 0;
      parts.push({
        id: randomUUID(),
        academyId,
        classId: cls.id,
        studentId: s.userId,
        bookingStatus: "booked",
        bookingTier: "confirmed",
        bookedAt: new Date(cls.startsAt.getTime() - DAY_MS),
        attendanceStatus:
          isPast && !leaveUnmarked
            ? present
              ? "present"
              : "absent"
            : "unmarked",
        attendedAt: isPast && !leaveUnmarked && present ? cls.startsAt : null,
        markedBy: isPast && !leaveUnmarked && present ? staffId : null,
      });
    });
  });
  if (parts.length > 0) {
    await exec.insert(classParticipation).values(parts).onConflictDoNothing();
    report.class_participation = parts.length;
  }

  // 4. Ranks + a promotion timeline + a couple of notes on fake members.
  const belts = ["White", "White", "Blue", "Blue", "Purple", "Brown"];
  const ranks: (typeof memberRank.$inferInsert)[] = [];
  const promos: (typeof rankPromotion.$inferInsert)[] = [];
  const notes: (typeof memberNote.$inferInsert)[] = [];
  active.forEach((s, i) => {
    const belt = belts[i % belts.length] ?? "White";
    const stripes = i % 4;
    ranks.push({
      id: randomUUID(),
      academyId,
      memberId: s.memberId,
      discipline: "bjj",
      belt,
      stripes,
      updatedBy: staffId,
    });
    promos.push({
      id: randomUUID(),
      academyId,
      memberId: s.memberId,
      discipline: "bjj",
      fromBelt: null,
      fromStripes: null,
      toBelt: "White",
      toStripes: 0,
      promotedBy: staffId,
      promotedAt: new Date(now.getTime() - 300 * DAY_MS),
    });
    if (belt !== "White") {
      promos.push({
        id: randomUUID(),
        academyId,
        memberId: s.memberId,
        discipline: "bjj",
        fromBelt: "White",
        fromStripes: 4,
        toBelt: belt,
        toStripes: stripes,
        promotedBy: staffId,
        promotedAt: new Date(now.getTime() - 30 * DAY_MS),
      });
    }
  });
  if (active[0]) {
    ranks.push({
      id: randomUUID(),
      academyId,
      memberId: active[0].memberId,
      discipline: "judo",
      belt: "Green",
      stripes: 0,
      updatedBy: staffId,
    });
    notes.push({
      id: randomUUID(),
      academyId,
      memberId: active[0].memberId,
      body: "Recovering from a knee tweak — go easy on leg locks for two weeks.",
      authorId: staffId,
    });
  }
  if (ranks.length > 0) {
    await exec.insert(memberRank).values(ranks).onConflictDoNothing();
    report.member_rank = ranks.length;
  }
  if (promos.length > 0) {
    await exec.insert(rankPromotion).values(promos).onConflictDoNothing();
    report.rank_promotion = promos.length;
  }
  if (notes.length > 0) {
    await exec.insert(memberNote).values(notes).onConflictDoNothing();
    report.member_note = notes.length;
  }

  // 5. Keep the real classes' booking_count honest with the fakes added.
  await recomputeBookingCounts(exec, academyId);

  return report;
}

/**
 * Remove every fake (seed_) row this seed added to a real academy — and NOTHING
 * else. Scoped to `academy_id = X AND <member/user id> LIKE 'seed_%'`, so the
 * academy, its plans, templates, real classes, and real members are untouched.
 */
export async function clearAcademy(
  exec: SeedExec,
  opts: { academyId: string },
): Promise<FillReport> {
  const academyId = opts.academyId;
  const seedLike = `${SEED_MARKER}%`;
  const report: FillReport = {};
  const del = async (
    label: string,
    run: () => Promise<{ rowCount?: number | null }>,
  ) => {
    report[label] = (await run()).rowCount ?? 0;
  };

  // Fake students' participation on the real classes (student_id is a seed user).
  await del("class_participation", () =>
    exec
      .delete(classParticipation)
      .where(
        and(
          eq(classParticipation.academyId, academyId),
          like(classParticipation.studentId, seedLike),
        ),
      ),
  );
  // Their dues / claims / rank / promotions / notes (member_id is a seed member).
  await del("payment_claim", () =>
    exec
      .delete(paymentClaim)
      .where(
        and(
          eq(paymentClaim.academyId, academyId),
          like(paymentClaim.memberId, seedLike),
        ),
      ),
  );
  await del("member_referral_audit", () =>
    exec
      .delete(memberReferralAudit)
      .where(
        and(
          eq(memberReferralAudit.academyId, academyId),
          like(memberReferralAudit.studentMemberId, seedLike),
        ),
      ),
  );
  await del("member_referral", () =>
    exec
      .delete(memberReferral)
      .where(
        and(
          eq(memberReferral.academyId, academyId),
          like(memberReferral.studentMemberId, seedLike),
        ),
      ),
  );
  await del("member_dues", () =>
    exec
      .delete(memberDues)
      .where(
        and(
          eq(memberDues.academyId, academyId),
          like(memberDues.memberId, seedLike),
        ),
      ),
  );
  await del("rank_promotion", () =>
    exec
      .delete(rankPromotion)
      .where(
        and(
          eq(rankPromotion.academyId, academyId),
          like(rankPromotion.memberId, seedLike),
        ),
      ),
  );
  await del("member_rank", () =>
    exec
      .delete(memberRank)
      .where(
        and(
          eq(memberRank.academyId, academyId),
          like(memberRank.memberId, seedLike),
        ),
      ),
  );
  await del("member_note", () =>
    exec
      .delete(memberNote)
      .where(
        and(
          eq(memberNote.academyId, academyId),
          like(memberNote.memberId, seedLike),
        ),
      ),
  );
  await del("entity_membership", () =>
    exec
      .delete(entityMembership)
      .where(
        and(
          eq(entityMembership.entityId, academyId),
          like(entityMembership.id, seedLike),
        ),
      ),
  );
  // The fake members themselves, then the fake user rows (scoped to THIS academy's
  // fill prefix — never another academy's fakes or any real user).
  await del("member", () =>
    exec
      .delete(member)
      .where(
        and(eq(member.organizationId, academyId), like(member.id, seedLike)),
      ),
  );
  await del("user", () =>
    exec.delete(user).where(like(user.id, `${fillUserPrefix(academyId)}%`)),
  );

  // Restore the real classes' booking_count now the fakes are gone.
  await recomputeBookingCounts(exec, academyId);

  return report;
}
