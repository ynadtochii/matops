/**
 * "Fill an existing academy" mode — add fake students (and their dues, bookings,
 * attendance, ranks, notes) AROUND the real owner of a real academy, so the gym
 * looks alive when you sign in. Unlike the two-fake-academy seed (data.ts/run.ts),
 * this writes into a REAL academy, so teardown must be surgical:
 *
 *   - it NEVER changes the academy, its real plans, its real templates, its
 *     real classes, or its real members;
 *   - it removes ONLY rows tied to a `seed_` member/user id.
 *
 * Fake students reuse existing plans and classes. An empty academy gets marked
 * demo plans, templates, and classes that clear can identify and remove.
 * `booking_count` on each real class is RECOMPUTED from its confirmed bookings on
 * both fill and clear, so it stays correct with fakes added or removed.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, like } from "drizzle-orm";

import { monthOf, priceForMonth, resolveAcademyTimeZone } from "@matops/domain";

import type { SeedExec } from "./registry";
import { recomputeBookingCounts } from "../erase";
import { materializeTemplate } from "../materialize";
import {
  accessAssignment,
  accessAssignmentChange,
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  classInstance,
  classParticipation,
  classTemplate,
  entity,
  entityMembership,
  member,
  memberNote,
  memberRank,
  memberReferral,
  memberReferralAudit,
  membershipMonth,
  membershipMonthAudit,
  membershipPolicy,
  notification,
  person,
  rankPromotion,
  user,
} from "../schema";
import { monthsBack } from "./data";
import { SEED_MARKER } from "./registry";

const DAY_MS = 24 * 60 * 60 * 1000;
const FILL_TEMPLATE_MARKER = "[demo seed]";
const FILL_PLAN_MARKER = "[demo seed]";

type FillReport = Record<string, number>;

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
  personId: string;
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
      personId: randomUUID(),
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
  organizationId: string,
): Promise<number> {
  const rows = await exec
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        like(member.id, `${SEED_MARKER}%`),
      ),
    );
  return rows.length;
}

/**
 * Resolve an academy by its 6-digit public code, or null.
 *
 * Returns the organization id beside the entity id because the two are only
 * equal for a gym's DEFAULT academy (ADR 124), and `member` keys on the
 * organization while every tenant table keys on the entity.
 */
export async function findAcademyByPublicCode(
  exec: SeedExec,
  code: string,
): Promise<{ id: string; organizationId: string; name: string } | null> {
  const rows = await exec
    .select({
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
    })
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
  opts: {
    academyId: string;
    organizationId: string;
    now?: Date;
    studentCount?: number;
  },
): Promise<FillReport> {
  const now = opts.now ?? new Date();
  const academyId = opts.academyId;
  const organizationId = opts.organizationId;
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
        organizationId,
        userId: s.userId,
        role: s.role,
        createdAt: new Date(now.getTime() - (150 - i * 3) * DAY_MS),
      })),
    )
    .onConflictDoNothing();
  report.member = students.length;

  await exec
    .insert(person)
    .values(
      students.map((s) => ({
        id: s.personId,
        organizationId,
        accountUserId: s.userId,
        name: s.name,
        email: s.email,
        phone: s.phone,
      })),
    )
    .onConflictDoNothing();
  report.person = students.length;

  await exec
    .insert(entityMembership)
    .values(
      students.map((s, i) => {
        const createdAt = new Date(now.getTime() - (150 - i * 3) * DAY_MS);
        return {
          id: s.memberId,
          organizationId,
          entityId: academyId,
          personId: s.personId,
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

  // 2a. Memberships, if this branch runs the shared gate (ADR 126-129). Without
  //     them every fake reads as a person with no membership, which is the one
  //     state a filled academy should NOT be full of.
  Object.assign(
    report,
    await fillMemberships(exec, {
      academyId,
      organizationId,
      staffId,
      now,
      holders: students.filter(
        (student) =>
          student.status === "active" || student.status === "suspended",
      ),
    }),
  );

  const existingClasses = await exec
    .select({ id: classInstance.id })
    .from(classInstance)
    .where(
      and(
        eq(classInstance.academyId, academyId),
        isNull(classInstance.deletedAt),
      ),
    )
    .limit(1);
  if (existingClasses.length === 0) {
    const [academy] = await exec
      .select({ timeZone: entity.timeZone })
      .from(entity)
      .where(eq(entity.id, academyId));
    const templates = [
      {
        title: "Gi fundamentals",
        daysOfWeek: [1, 3, 5],
        startsAtMinutes: 18 * 60,
      },
      { title: "NoGi", daysOfWeek: [2, 4], startsAtMinutes: 19 * 60 },
      { title: "Open mat", daysOfWeek: [6], startsAtMinutes: 11 * 60 },
    ].map((template) => ({
      id: randomUUID(),
      academyId,
      instructorId: staffId,
      description: FILL_TEMPLATE_MARKER,
      discipline:
        template.title === "NoGi" ? ("nogi" as const) : ("bjj" as const),
      durationMinutes: 60,
      capacity: 24,
      capacityPolicy: "soft",
      publicBookable: true,
      timeZone: resolveAcademyTimeZone(academy?.timeZone),
      ...template,
    }));
    await exec.insert(classTemplate).values(templates);
    report.class_template = templates.length;
    const savedTemplates = await exec
      .select()
      .from(classTemplate)
      .where(
        inArray(
          classTemplate.id,
          templates.map((template) => template.id),
        ),
      );
    let created = 0;
    for (const template of savedTemplates) {
      created += await materializeTemplate(exec, template, { now });
    }
    report.class = created;
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
 * Put the fakes on the academy's OWN membership plans, the way the owner would.
 *
 * Reads the live plans that cover this branch and have a price for this month;
 * a gym still setting up has none, and then this writes nothing rather than
 * inventing a plan the owner never made. Last month is settled for everybody
 * and this month spreads across paid, silent, reminded and claimed.
 */
async function fillMemberships(
  exec: SeedExec,
  opts: {
    academyId: string;
    organizationId: string;
    staffId: string;
    now: Date;
    holders: FakeStudent[];
  },
): Promise<FillReport> {
  const { academyId, organizationId, staffId, now, holders } = opts;
  const report: FillReport = {};
  const [policy] = await exec
    .select({ timeZone: membershipPolicy.calendarTimeZone })
    .from(membershipPolicy)
    .where(eq(membershipPolicy.organizationId, organizationId));
  let timeZone = policy?.timeZone;
  if (!timeZone) {
    const [home] = await exec
      .select({ timeZone: entity.timeZone })
      .from(entity)
      .where(
        and(
          eq(entity.organizationId, organizationId),
          eq(entity.isDefault, true),
          isNull(entity.deletedAt),
        ),
      );
    timeZone = resolveAcademyTimeZone(home?.timeZone);
  }
  const month = monthOf(now, timeZone);
  const lastMonth = monthsBack(month, 1);

  const existingPlans = await exec
    .select({ id: accessPlan.id })
    .from(accessPlan)
    .where(eq(accessPlan.organizationId, organizationId));
  if (existingPlans.length === 0) {
    const seededPlans = [
      { id: randomUUID(), name: "Unlimited", priceMinor: 6500 },
      { id: randomUUID(), name: "8 classes", priceMinor: 5000 },
    ];
    await exec.insert(accessPlan).values(
      seededPlans.map((plan) => ({
        ...plan,
        organizationId,
        description: FILL_PLAN_MARKER,
        currency: "EUR",
      })),
    );
    await exec.insert(accessPlanPrice).values(
      seededPlans.map((plan) => ({
        organizationId,
        planId: plan.id,
        effectiveMonth: lastMonth,
        priceMinor: plan.priceMinor,
        currency: "EUR",
        recordedBy: staffId,
      })),
    );
    await exec.insert(accessPlanEntity).values(
      seededPlans.map((plan) => ({
        organizationId,
        planId: plan.id,
        entityId: academyId,
      })),
    );
    report.access_plan = seededPlans.length;
    report.access_plan_price = seededPlans.length;
    report.access_plan_entity = seededPlans.length;
  }

  const plans = await exec
    .select({ id: accessPlan.id, archivedAt: accessPlan.archivedAt })
    .from(accessPlan)
    .innerJoin(accessPlanEntity, eq(accessPlanEntity.planId, accessPlan.id))
    .where(
      and(
        eq(accessPlan.organizationId, organizationId),
        eq(accessPlanEntity.entityId, academyId),
        isNull(accessPlan.archivedAt),
      ),
    );
  const prices = await exec
    .select()
    .from(accessPlanPrice)
    .where(eq(accessPlanPrice.organizationId, organizationId));
  const sellable = plans.filter(
    (p) =>
      priceForMonth(
        prices.filter((row) => row.planId === p.id),
        month,
      ) !== null,
  );
  if (sellable.length === 0) return report;

  const assignments: (typeof accessAssignment.$inferInsert)[] = [];
  const months: (typeof membershipMonth.$inferInsert)[] = [];
  const audits: (typeof membershipMonthAudit.$inferInsert)[] = [];

  holders.forEach((s, i) => {
    const plan = sellable[i % sellable.length];
    if (!plan) return;
    const id = randomUUID();
    assignments.push({
      id,
      organizationId,
      personId: s.personId,
      planId: plan.id,
      assigningEntityId: academyId,
      startMonth: lastMonth,
      startsOn: lastMonth,
      status: s.status === "suspended" ? "suspended" : "active",
      assignedBy: staffId,
    });
    months.push({
      id: randomUUID(),
      organizationId,
      assignmentId: id,
      month: lastMonth,
      status: "confirmed",
      reviewedBy: staffId,
      reviewedAt: new Date(now.getTime() - 25 * DAY_MS),
    });
    audits.push({
      id: randomUUID(),
      organizationId,
      assignmentId: id,
      month: lastMonth,
      event: "confirmed",
      beforeStatus: null,
      afterStatus: "confirmed",
      actorId: staffId,
    });
    if (i > 2) {
      months.push({
        id: randomUUID(),
        organizationId,
        assignmentId: id,
        month,
        status: "confirmed",
        reviewedBy: staffId,
        reviewedAt: new Date(now.getTime() - 2 * DAY_MS),
      });
      audits.push({
        id: randomUUID(),
        organizationId,
        assignmentId: id,
        month,
        event: "confirmed",
        beforeStatus: null,
        afterStatus: "confirmed",
        actorId: staffId,
      });
    } else if (i === 2) {
      months.push({
        id: randomUUID(),
        organizationId,
        assignmentId: id,
        month,
        status: "reported",
        reportedAt: new Date(now.getTime() - DAY_MS),
      });
    }
  });

  if (assignments.length === 0) return report;
  await exec.insert(accessAssignment).values(assignments).onConflictDoNothing();
  await exec.insert(membershipMonth).values(months).onConflictDoNothing();
  await exec.insert(membershipMonthAudit).values(audits);
  report.access_assignment = assignments.length;
  report.membership_month = months.length;
  return report;
}

/**
 * Remove every marked demo row this seed added to a real academy.
 */
export async function clearAcademy(
  exec: SeedExec,
  opts: { academyId: string; organizationId: string },
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

  const fakeUsers = await exec
    .select({ id: user.id })
    .from(user)
    .where(
      like(user.id, `${fillUserPrefix(academyId).replaceAll("_", "\\_")}%`),
    );
  const fakeUserIds = fakeUsers.map((row) => row.id);
  const fakePeople = await exec
    .select({ id: person.id })
    .from(person)
    .where(
      and(
        eq(person.organizationId, opts.organizationId),
        inArray(person.accountUserId, fakeUserIds),
      ),
    );
  const fakePersonIds = fakePeople.map((row) => row.id);
  const held = await exec
    .select({ id: accessAssignment.id })
    .from(accessAssignment)
    .where(
      and(
        eq(accessAssignment.organizationId, opts.organizationId),
        inArray(accessAssignment.personId, fakePersonIds),
      ),
    );
  const heldIds = held.map((row) => row.id);
  if (heldIds.length > 0) {
    await del("membership_month_audit", () =>
      exec
        .delete(membershipMonthAudit)
        .where(inArray(membershipMonthAudit.assignmentId, heldIds)),
    );
    await del("membership_month", () =>
      exec
        .delete(membershipMonth)
        .where(inArray(membershipMonth.assignmentId, heldIds)),
    );
    await del("access_assignment_change", () =>
      exec
        .delete(accessAssignmentChange)
        .where(inArray(accessAssignmentChange.sourceAssignmentId, heldIds)),
    );
    await del("access_assignment", () =>
      exec
        .delete(accessAssignment)
        .where(inArray(accessAssignment.id, heldIds)),
    );
  }
  const seededPlans = await exec
    .select({ id: accessPlan.id })
    .from(accessPlan)
    .where(
      and(
        eq(accessPlan.organizationId, opts.organizationId),
        eq(accessPlan.description, FILL_PLAN_MARKER),
      ),
    );
  const seededPlanIds = seededPlans.map((row) => row.id);
  if (seededPlanIds.length > 0) {
    await del("access_plan_entity", () =>
      exec
        .delete(accessPlanEntity)
        .where(inArray(accessPlanEntity.planId, seededPlanIds)),
    );
    await del("access_plan_price", () =>
      exec
        .delete(accessPlanPrice)
        .where(inArray(accessPlanPrice.planId, seededPlanIds)),
    );
    await del("access_plan", () =>
      exec.delete(accessPlan).where(inArray(accessPlan.id, seededPlanIds)),
    );
  }
  // Messages the gym sent them. `notification.user_id` carries no foreign key,
  // so these would simply be left behind pointing at a user that is gone.
  await del("notification", () =>
    exec
      .delete(notification)
      .where(
        and(
          eq(notification.academyId, academyId),
          like(notification.userId, seedLike),
        ),
      ),
  );

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
  const seededTemplates = await exec
    .select({ id: classTemplate.id })
    .from(classTemplate)
    .where(
      and(
        eq(classTemplate.academyId, academyId),
        eq(classTemplate.description, FILL_TEMPLATE_MARKER),
      ),
    );
  const seededTemplateIds = seededTemplates.map((row) => row.id);
  if (seededTemplateIds.length > 0) {
    await del("class", () =>
      exec
        .delete(classInstance)
        .where(inArray(classInstance.templateId, seededTemplateIds)),
    );
    await del("class_template", () =>
      exec
        .delete(classTemplate)
        .where(inArray(classTemplate.id, seededTemplateIds)),
    );
  }
  // Their dues / claims / rank / promotions / notes (member_id is a seed member).
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
  await del("person", () =>
    exec.delete(person).where(inArray(person.id, fakePersonIds)),
  );
  // The fake members themselves, then the fake user rows (scoped to THIS academy's
  // fill prefix — never another academy's fakes or any real user).
  await del("member", () =>
    exec
      .delete(member)
      .where(
        and(
          eq(member.organizationId, opts.organizationId),
          inArray(member.userId, fakeUserIds),
        ),
      ),
  );
  await del("user", () =>
    exec.delete(user).where(inArray(user.id, fakeUserIds)),
  );

  // Restore the real classes' booking_count now the fakes are gone.
  await recomputeBookingCounts(exec, academyId);

  return report;
}
