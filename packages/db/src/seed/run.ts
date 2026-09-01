/**
 * Seed IO layer — writes the pure {@link buildSeedGraph} dataset to the database.
 *
 * Runs on the BASE connection (the trusted service role that owns the tables),
 * setting `academy_id` explicitly on every row — the same pattern the
 * materialization sweep and drop-in helpers use (docs/issues/12). No `withScope`
 * is needed: the seed is trusted infrastructure, not request-scoped app code.
 *
 * The executor is INJECTED (never imported here) so this module has no
 * connection side effect and stays unit-testable against PGlite.
 */
import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray } from "drizzle-orm";

import type { SeedAcademy, SeedExec } from "./registry";
import { DEFAULT_TRACK_NAME } from "../curriculum";
import { materializeTemplate } from "../materialize";
import {
  academyInvite,
  academyProfile,
  classInstance,
  classParticipation,
  classTemplate,
  curriculumTrack,
  dropIn,
  dropInVisit,
  entity,
  entityMembership,
  member,
  memberDues,
  memberNote,
  memberRank,
  memberReferral,
  memberReferralAudit,
  membershipPlan,
  organization,
  paymentClaim,
  paymentSettings,
  rankPromotion,
  user,
} from "../schema";
import { buildSeedGraph } from "./data";
import { seedAcademyList } from "./registry";

export interface SeedOptions {
  /** The real, already-registered user you sign in as (looked up by the CLI). */
  realUser: { id: string; name: string };
  now?: Date;
  academy?: SeedAcademy;
}

/** Row counts written, per table — returned so the CLI can report the run. */
export type SeedReport = Record<string, number>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Insert a batch (skipping empties) and add its length to the report. */
async function insert<T extends Record<string, unknown>>(
  report: SeedReport,
  label: string,
  exec: SeedExec,
  table: Parameters<SeedExec["insert"]>[0],
  rows: T[],
): Promise<void> {
  if (rows.length === 0) return;
  // onConflictDoNothing keeps a re-run from erroring on the natural unique keys
  // (public_code, cl_uniq_template_start, md_uniq_academy_member, …).
  await exec.insert(table).values(rows).onConflictDoNothing();
  report[label] = (report[label] ?? 0) + rows.length;
}

/**
 * Seed the full demo dataset. Order respects the few real foreign keys
 * (plans before dues/claims, templates before classes, classes before
 * participations). Assumes the target is empty of seed rows — the CLI guards
 * that; call `removeAll` first (or `seed reset`) to rebuild.
 */
export async function seedAll(
  exec: SeedExec,
  opts: SeedOptions,
): Promise<SeedReport> {
  const now = opts.now ?? new Date();
  const graph = buildSeedGraph({
    realUser: opts.realUser,
    now,
    academy: opts.academy,
    newId: () => randomUUID(),
  });

  const report: SeedReport = {};

  // 1. Auth rows (fake users; real user already exists) → orgs → members → invites.
  await insert(report, "user", exec, user, graph.users);
  await insert(report, "organization", exec, organization, graph.organizations);
  await insert(
    report,
    "curriculum_track",
    exec,
    curriculumTrack,
    graph.organizations.map((org) => ({
      academyId: org.id,
      name: DEFAULT_TRACK_NAME,
      isDefault: true,
    })),
  );
  await insert(report, "entity", exec, entity, graph.entities);
  await insert(
    report,
    "academy_profile",
    exec,
    academyProfile,
    graph.academyProfiles,
  );
  await insert(report, "member", exec, member, graph.members);
  await insert(
    report,
    "entity_membership",
    exec,
    entityMembership,
    graph.entityMemberships,
  );
  await insert(report, "academy_invite", exec, academyInvite, graph.invites);

  // 2. Payments price list first (dues + claims FK the plan).
  await insert(report, "membership_plan", exec, membershipPlan, graph.plans);

  // 3. Templates → past classes → their participations.
  await insert(report, "class_template", exec, classTemplate, graph.templates);
  await insert(report, "class(past)", exec, classInstance, graph.pastClasses);
  await insert(
    report,
    "class_participation(past)",
    exec,
    classParticipation,
    graph.participations,
  );

  // 4. The rest of the payments + rank + notes + leads.
  await insert(report, "member_dues", exec, memberDues, graph.dues);
  await insert(report, "payment_claim", exec, paymentClaim, graph.claims);
  await insert(
    report,
    "payment_settings",
    exec,
    paymentSettings,
    graph.settings,
  );
  await insert(report, "member_rank", exec, memberRank, graph.ranks);
  await insert(report, "rank_promotion", exec, rankPromotion, graph.promotions);
  await insert(report, "member_note", exec, memberNote, graph.notes);
  await insert(report, "drop_in", exec, dropIn, graph.dropIns);
  await insert(report, "drop_in_visit", exec, dropInVisit, graph.dropInVisits);
  await insert(
    report,
    "member_referral",
    exec,
    memberReferral,
    graph.referrals,
  );
  await insert(
    report,
    "member_referral_audit",
    exec,
    memberReferralAudit,
    graph.referralAudits,
  );

  // 5. Materialize FUTURE classes from the seeded templates (reuses the real
  //    engine — fills [now, horizon) with no overlap against the past classes).
  const ids = seedAcademyList.map((a) => a.id);
  const templates = await exec
    .select()
    .from(classTemplate)
    .where(inArray(classTemplate.academyId, ids));
  let futureCreated = 0;
  for (const t of templates) {
    futureCreated += await materializeTemplate(exec, t, { now });
  }
  report["class(future)"] = futureCreated;

  // 6. Book a subset of active students onto the upcoming classes so the
  //    schedule shows counts and the mobile Training tab has bookings.
  if (futureCreated > 0) {
    report["class_participation(future)"] = await bookFutureClasses(
      exec,
      graph,
      now,
      ids,
    );
    report["class(cancelled)"] = await cancelOneUpcoming(exec, now, ids);
  }

  return report;
}

/** Cancel the LAST upcoming class of each academy, so the cancelled state shows. */
async function cancelOneUpcoming(
  exec: SeedExec,
  now: Date,
  academyIds: string[],
): Promise<number> {
  let cancelled = 0;
  for (const academyId of academyIds) {
    const rows = await exec
      .select({ id: classInstance.id })
      .from(classInstance)
      .where(
        and(
          eq(classInstance.academyId, academyId),
          gte(classInstance.startsAt, new Date(now.getTime() + 3 * DAY_MS)),
        ),
      )
      .orderBy(classInstance.startsAt)
      .limit(1);
    const target = rows[0];
    if (!target) continue;
    await exec
      .update(classInstance)
      .set({ status: "cancelled" })
      .where(eq(classInstance.id, target.id));
    cancelled += 1;
  }
  return cancelled;
}

/**
 * Attach confirmed bookings (+ one provisional pending booking per academy) to
 * every upcoming class. Runs after materialization because the class ids are
 * database-generated. Updates `booking_count` to match.
 */
async function bookFutureClasses(
  exec: SeedExec,
  graph: ReturnType<typeof buildSeedGraph>,
  now: Date,
  academyIds: string[],
): Promise<number> {
  // Active students + pending students per academy, from the graph's member rows.
  // Students the dataset marked as drifting are skipped: a booking tomorrow
  // would contradict the "dormant" band the O1 widget shows for them.
  const quiet = new Set(graph.quietStudentIds);
  const activeByAcademy = new Map<string, string[]>();
  const pendingByAcademy = new Map<string, string[]>();
  for (const m of graph.members) {
    const acad = m.organizationId;
    if (quiet.has(m.userId)) continue;
    if (m.role === "student" && m.status === "active") {
      activeByAcademy.set(acad, [
        ...(activeByAcademy.get(acad) ?? []),
        m.userId,
      ]);
    } else if (m.status === "pending" && m.invitedRole === "student") {
      pendingByAcademy.set(acad, [
        ...(pendingByAcademy.get(acad) ?? []),
        m.userId,
      ]);
    }
  }

  const upcoming = await exec
    .select()
    .from(classInstance)
    .where(
      and(
        inArray(classInstance.academyId, academyIds),
        gte(classInstance.startsAt, now),
      ),
    );
  // Only book the next ~10 days so far-future classes stay empty (realistic).
  const horizon = new Date(now.getTime() + 10 * DAY_MS);

  const bookings: (typeof classParticipation.$inferInsert)[] = [];
  const countByClass = new Map<string, number>();
  const packedAcademies = new Set<string>();
  upcoming.forEach((cls, ci) => {
    if (cls.startsAt > horizon) return;
    const active = activeByAcademy.get(cls.academyId) ?? [];
    // A deterministic ~60% of active students book each class. The first small
    // class of an academy gets EVERYONE, so the over-capacity (red) count shows.
    const packed = cls.capacity <= 12 && !packedAcademies.has(cls.academyId);
    if (packed) packedAcademies.add(cls.academyId);
    const booked = packed
      ? active
      : active.filter((_, si) => (si + ci) % 5 < 3);
    booked.forEach((userId) => {
      bookings.push({
        id: randomUUID(),
        academyId: cls.academyId,
        classId: cls.id,
        studentId: userId,
        bookingStatus: "booked",
        bookingTier: "confirmed",
        bookedAt: now,
        attendanceStatus: "unmarked",
      });
    });
    countByClass.set(cls.id, booked.length);
    // One provisional (pending-student) booking on the first upcoming class.
    const pending = pendingByAcademy.get(cls.academyId) ?? [];
    if (ci === 0 && pending[0]) {
      bookings.push({
        id: randomUUID(),
        academyId: cls.academyId,
        classId: cls.id,
        studentId: pending[0],
        bookingStatus: "booked",
        bookingTier: "provisional", // never counted toward booking_count
        bookedAt: now,
        attendanceStatus: "unmarked",
      });
    }
  });

  if (bookings.length === 0) return 0;
  await exec.insert(classParticipation).values(bookings).onConflictDoNothing();

  // Sync booking_count (confirmed only) on each booked class.
  for (const [classId, count] of countByClass) {
    if (count > 0) {
      await exec
        .update(classInstance)
        .set({ bookingCount: count })
        .where(eq(classInstance.id, classId));
    }
  }
  return bookings.length;
}
