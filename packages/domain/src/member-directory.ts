/**
 * One person, however many branches they train at (ADR 126). Pure — the caller
 * reads each branch in its own scope and hands the rows here to be combined.
 *
 * Grouped by USER ID and never by display name. Two people called Ana Silva are
 * two people, and a directory that merged them would put one member's rank,
 * dues and attendance on another's row.
 */

import { isStaffRole, isStudentMember } from "./access";
import { isPendingCoach } from "./membership";

/** One person's standing at ONE branch, as that branch's own roster reports it. */
export interface DirectoryEntry {
  entityId: string;
  entityName: string;
  /** `entity_membership.id`, which is what a branch screen's `?member=` names. */
  memberId: string | null;
  userId: string;
  name: string;
  email: string | null;
  /** Their branch membership status: active, pending, suspended… */
  status: string;
  role: string;
  /** The role a pending seat was invited to hold. Null for everybody else. */
  invitedRole: string | null;
  /** A shared membership covers them here. */
  covered: boolean;
  planNames: string[];
  verdict: string | null;
  recentVisits: number;
}

export interface DirectoryBranch {
  entityId: string;
  entityName: string;
  memberId: string | null;
  status: string;
  role: string;
  invitedRole: string | null;
  covered: boolean;
  verdict: string | null;
  recentVisits: number;
}

export interface DirectoryRow {
  userId: string;
  name: string;
  email: string | null;
  /** Every branch they belong to, name-ordered. */
  branches: DirectoryBranch[];
  /** Every plan covering them anywhere, deduplicated. */
  planNames: string[];
  /** Visits across ALL branches in the window: the person's own total. */
  recentVisits: number;
}

/**
 * Combine per-branch rows into one row per person.
 *
 * The name and email come from the branch that lists them first by name, which
 * is arbitrary but stable; a person has one account, so the copies agree.
 * Nothing here deduplicates by name, and nothing merges two user ids.
 */
export function combineDirectory(entries: DirectoryEntry[]): DirectoryRow[] {
  const byUser = new Map<string, DirectoryRow>();
  for (const e of [...entries].sort((a, b) =>
    a.entityName.localeCompare(b.entityName),
  )) {
    const held = byUser.get(e.userId) ?? {
      userId: e.userId,
      name: e.name,
      email: e.email,
      branches: [],
      planNames: [],
      recentVisits: 0,
    };
    held.branches.push({
      entityId: e.entityId,
      entityName: e.entityName,
      memberId: e.memberId,
      status: e.status,
      role: e.role,
      invitedRole: e.invitedRole,
      covered: e.covered,
      verdict: e.verdict,
      recentVisits: e.recentVisits,
    });
    held.planNames = [...new Set([...held.planNames, ...e.planNames])].sort();
    // Attendance is the PERSON's total across branches. The per-branch figures
    // stay on each badge, so a branch total is never confused with a head count.
    held.recentVisits += e.recentVisits;
    byUser.set(e.userId, held);
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Does this person match the owner's filters? All of them, or none set. */
export function matchesDirectoryFilter(
  row: DirectoryRow,
  filter: { entityId?: string; planName?: string; status?: string },
): boolean {
  if (
    filter.entityId &&
    !row.branches.some((b) => b.entityId === filter.entityId)
  ) {
    return false;
  }
  if (filter.planName && !row.planNames.includes(filter.planName)) return false;
  if (filter.status && !row.branches.some((b) => b.status === filter.status)) {
    return false;
  }
  return true;
}

/**
 * The people who RUN a branch, out of the rows the directory is already built
 * from (ADR 127): an owner or an instructor anywhere, plus anybody waiting on a
 * coach seat. One row per person, however many branches.
 *
 * A lens, not a second read. The staff screen and the member screen answer from
 * the same rows, so they cannot disagree about who somebody is.
 */
export function staffRows(rows: DirectoryRow[]): DirectoryRow[] {
  return rows.filter((r) => r.branches.some((b) => isStaffRole(b)));
}

/**
 * Coach requests waiting anywhere in the gym: the Staff nav badge.
 *
 * Counted per BRANCH and not per person, because two branches waiting on the
 * same person are two decisions for the owner to make.
 */
export function pendingCoachCount(rows: DirectoryRow[]): number {
  return rows.reduce((n, r) => n + r.branches.filter(isPendingCoach).length, 0);
}

export function studentRows(rows: DirectoryRow[]): DirectoryRow[] {
  return rows.filter((row) => row.branches.some(isStudentMember));
}
