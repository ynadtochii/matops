/**
 * Membership plans and what they cover (ADR 126). Pure rules, no I/O.
 *
 * A plan belongs to the ORGANIZATION and names the entities it covers by id, so
 * "BJJ Only" can mean one particular mat rather than every mat. A person holds
 * one assignment per plan, and their access is the union of the assignments
 * that are active: two valid memberships combine, and suspending one does not
 * take away what the other still covers.
 *
 * Whether an active assignment is also PAID is a different question, answered
 * by the monthly rules. Everything here is about coverage alone.
 */

export type AssignmentStatus = "active" | "suspended" | "cancelled";

export interface Plan {
  id: string;
  archived: boolean;
}

/** One person's assignment, carrying the coverage its plan holds right now. */
export interface AssignmentCoverage {
  id: string;
  userId: string;
  planId: string;
  status: AssignmentStatus;
  entityIds: string[];
}

/** Only an active assignment covers anything. */
function isLive(a: AssignmentCoverage): boolean {
  return a.status === "active";
}

function sorted(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

/**
 * Every entity this set of assignments covers, deduplicated and sorted.
 *
 * Pass one person's assignments to answer "where may they train". Suspended and
 * cancelled ones contribute nothing, which is what makes suspending a shared
 * membership take effect at every branch it covered at once.
 */
export function coveredEntities(assignments: AssignmentCoverage[]): string[] {
  return sorted(assignments.filter(isLive).flatMap((a) => a.entityIds));
}

/**
 * An archived plan is frozen: no rename, no coverage change. Existing
 * assignments keep the coverage they have until someone ends them, so archiving
 * stops new work without cutting anyone off mid-month.
 */
export function canEditPlan(plan: Plan): boolean {
  return !plan.archived;
}

export interface CoverageChange {
  added: string[];
  removed: string[];
}

/** Which entity ids a coverage edit adds and which it takes away. */
export function coverageChange(
  before: string[],
  next: string[],
): CoverageChange {
  const had = new Set(before);
  const will = new Set(next);
  return {
    added: sorted(next.filter((id) => !had.has(id))),
    removed: sorted(before.filter((id) => !will.has(id))),
  };
}

/** One person a coverage edit reaches, and what it does to them. */
export interface AffectedMember {
  userId: string;
  assignmentId: string;
  /** Entities this edit opens to them, where they may need an access decision. */
  gains: string[];
  /** Entities they will no longer reach, because nothing else of theirs covers them. */
  loses: string[];
}

/**
 * Who a coverage edit reaches, before it is applied.
 *
 * `loses` is the honest half: an entity leaves the plan, but the person keeps
 * reaching it if another active assignment still covers it, so it is not listed
 * as a loss. Somebody holding BJJ + Gym and Gym + Sauna loses nothing when the
 * gym is dropped from the first plan.
 *
 * Only active assignments are reached. A suspended one covers nothing today, so
 * an edit changes nothing for it; it picks up the new coverage if it resumes.
 */
export function affectedByCoverageChange(
  planId: string,
  next: string[],
  assignments: AssignmentCoverage[],
): AffectedMember[] {
  const { added, removed } = (() => {
    const on = assignments.find((a) => a.planId === planId);
    return coverageChange(on?.entityIds ?? [], next);
  })();

  return assignments
    .filter((a) => a.planId === planId && isLive(a))
    .map((a) => {
      const elsewhere = new Set(
        assignments
          .filter((o) => o.userId === a.userId && o.id !== a.id && isLive(o))
          .flatMap((o) => o.entityIds),
      );
      return {
        userId: a.userId,
        assignmentId: a.id,
        gains: added,
        loses: sorted(removed.filter((id) => !elsewhere.has(id))),
      };
    })
    .filter((m) => m.gains.length > 0 || m.loses.length > 0);
}
