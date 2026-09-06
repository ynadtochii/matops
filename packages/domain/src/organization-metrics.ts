/**
 * What the owner group is actually doing, across branches (ADR 126). Pure — the
 * caller reads each branch in its own scope and hands the rows here.
 *
 * The rule this file exists to hold: a PERSON is counted once for the
 * organization, however many branches they belong to, while a BRANCH figure is
 * an enrolment or a visit and may count the same person again. Both numbers are
 * useful and they are not the same number, so they are named differently and
 * never added together.
 */

import type { EntitySummary } from "./dashboard";

export interface EntityMetricInput {
  entityId: string;
  entityName: string;
  /** Shared memberships decide access here, so eligibility is meaningful. */
  activated: boolean;
  members: {
    userId: string;
    role: string;
    status: string;
    /** When they joined THIS branch. */
    joinedAt: Date;
  }[];
  /** Users this branch currently admits. Empty at a branch not yet activated. */
  eligibleUserIds: string[];
  /** Distinct users with at least one attendance in the window. */
  attendedUserIds: string[];
  /** Attendance rows in the window: visits, not people. */
  visits: number;
  /** One entry per session in the window; capacity 0 means unlimited. */
  sessions: { capacity: number; reserved: number }[];
}

/** Each shared membership counted ONCE, whatever it covers. */
export interface PaymentTally {
  paid: number;
  withinGrace: number;
  blocked: number;
}

export interface BranchCount {
  entityId: string;
  entityName: string;
  count: number;
}

export interface OrganizationMetrics {
  /** Distinct people with an active student place at one branch or more. */
  enrolledMembers: number;
  /** Distinct people at least one activated branch currently admits. */
  membersWithAccess: number;
  /** Distinct people who trained anywhere in the window. */
  membersAttended: number;
  /** Visits per branch. One person can appear at several. */
  attendanceByBranch: BranchCount[];
  /** People whose FIRST place anywhere in this organization began in the window. */
  newMembers: number;
  payment: PaymentTally;
  /** Places taken against places offered, per branch. Unlimited sessions are out. */
  sessionUse: {
    entityId: string;
    entityName: string;
    reserved: number;
    places: number;
  }[];
  /**
   * Active student places per branch. Labelled ENROLMENTS, not members: adding
   * these up double-counts anybody who trains at two branches, which is exactly
   * the mistake `enrolledMembers` exists to avoid.
   */
  enrolmentsByBranch: BranchCount[];
}

/** A student place that counts: an approved student, not staff, not a leaver. */
function isEnrolledStudent(m: { role: string; status: string }): boolean {
  return m.role === "student" && m.status === "active";
}

export function organizationMetrics(
  entities: EntityMetricInput[],
  payment: PaymentTally,
  window: { from: Date; to: Date },
): OrganizationMetrics {
  const enrolled = new Set<string>();
  const withAccess = new Set<string>();
  const attended = new Set<string>();
  // The EARLIEST place each person holds anywhere here, which is what makes
  // "new member" an answer about the organization rather than about a branch:
  // somebody who joined the mat last year and the gym today is not new.
  const firstJoin = new Map<string, number>();

  for (const e of entities) {
    for (const m of e.members) {
      if (!isEnrolledStudent(m)) continue;
      enrolled.add(m.userId);
      const seen = firstJoin.get(m.userId);
      const at = m.joinedAt.getTime();
      if (seen === undefined || at < seen) firstJoin.set(m.userId, at);
    }
    for (const id of e.eligibleUserIds) withAccess.add(id);
    for (const id of e.attendedUserIds) attended.add(id);
  }

  const newMembers = [...firstJoin.values()].filter(
    (at) => at >= window.from.getTime() && at < window.to.getTime(),
  ).length;

  return {
    enrolledMembers: enrolled.size,
    membersWithAccess: withAccess.size,
    membersAttended: attended.size,
    attendanceByBranch: entities.map((e) => ({
      entityId: e.entityId,
      entityName: e.entityName,
      count: e.visits,
    })),
    newMembers,
    payment,
    sessionUse: entities.map((e) => ({
      entityId: e.entityId,
      entityName: e.entityName,
      reserved: e.sessions
        .filter((s) => s.capacity > 0)
        .reduce((n, s) => n + s.reserved, 0),
      places: e.sessions
        .filter((s) => s.capacity > 0)
        .reduce((n, s) => n + s.capacity, 0),
    })),
    enrolmentsByBranch: entities.map((e) => ({
      entityId: e.entityId,
      entityName: e.entityName,
      count: e.members.filter(isEnrolledStudent).length,
    })),
  };
}

export interface BranchRow {
  entityId: string;
  name: string;
  enrolments: number;
  visits: number;
  reserved: number;
  places: number;
  upcomingClasses: number;
  pendingMembers: number;
  newLeads: number;
  openClaims: number;
  waiting: number;
}

/**
 * One row per branch, carrying every figure the overview shows about it, with
 * the mats that want the owner first. The three per-branch arrays are keyed by
 * entity id and joined here rather than in the screen, so a branch is one thing
 * to read instead of the same name repeated down the page.
 */
export function branchRows(
  entities: readonly EntitySummary[],
  metrics?: Pick<
    OrganizationMetrics,
    "attendanceByBranch" | "sessionUse" | "enrolmentsByBranch"
  >,
): BranchRow[] {
  const at = <T extends { entityId: string }>(
    rows: readonly T[] | undefined,
    id: string,
  ) => rows?.find((r) => r.entityId === id);

  return entities
    .map((e) => {
      const use = at(metrics?.sessionUse, e.entityId);
      return {
        entityId: e.entityId,
        name: e.name,
        enrolments: at(metrics?.enrolmentsByBranch, e.entityId)?.count ?? 0,
        visits: at(metrics?.attendanceByBranch, e.entityId)?.count ?? 0,
        reserved: use?.reserved ?? 0,
        places: use?.places ?? 0,
        upcomingClasses: e.upcomingClasses,
        pendingMembers: e.pendingMembers,
        newLeads: e.newLeads,
        openClaims: e.openClaims,
        waiting: e.pendingMembers + e.newLeads + e.openClaims,
      };
    })
    .sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name));
}
