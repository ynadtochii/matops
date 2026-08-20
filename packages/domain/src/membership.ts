/**
 * Pure member-list + approval rules. No I/O — the owner tRPC procedures call these so
 * the transitions live in one tested place (docs/issues/14, 20; spec O4, §4).
 */
import type { Membership } from "./access";
import { isOwner } from "./access";

/** A member row as the membership rules see it. */
export interface MemberRow extends Membership {
  id: string;
}

// --- Approval (pending → active) ---------------------------------------------

export interface PendingMembership {
  status: string;
  /** The role to grant at approval; set from the invite at join time. */
  invitedRole: string | null;
}

/** Only a pending member can be approved (idempotency + no re-grant). */
export function canApprove(m: Pick<PendingMembership, "status">): boolean {
  return m.status === "pending";
}

/**
 * The role + status to write when an owner approves a pending member. The real
 * academy role is granted ONLY here (docs/issues/14, 20): a pending member holds
 * the harmless default role until this point. Falls back to "student" if the
 * invited role was somehow never recorded.
 */
export function approveMembership(m: PendingMembership): {
  role: string;
  status: "active";
} {
  return { role: m.invitedRole ?? "student", status: "active" };
}

/**
 * A join request for a COACH seat: still pending, and the link they opened
 * carried the instructor role. Owners handle these on the Coaches screen (O10),
 * so the Members requests tab stays the student queue.
 */
export function isPendingCoach(m: {
  status: string;
  invitedRole?: string | null;
}): boolean {
  return m.status === "pending" && m.invitedRole === "instructor";
}

// --- Never ownerless (spec §4) -----------------------------------------------

/** How many members are currently ACTIVE owners. */
export function activeOwnerCount(members: MemberRow[]): number {
  return members.filter((m) => isOwner(m)).length;
}

/**
 * True if removing / suspending / demoting this member would leave the academy
 * with no active owner. Owners can promote a co-owner first, then step down —
 * but the last active owner cannot be dropped (spec §4 "never ownerless").
 */
export function wouldLeaveOwnerless(
  members: MemberRow[],
  targetId: string,
): boolean {
  const target = members.find((m) => m.id === targetId);
  if (!target || !isOwner(target)) return false;
  return activeOwnerCount(members) <= 1;
}

/** Guard for remove / suspend / demote actions. */
export function canRemoveOrDemote(
  members: MemberRow[],
  targetId: string,
): boolean {
  return !wouldLeaveOwnerless(members, targetId);
}

// --- Client is the role lens (docs/issues/18) --------------------------------

/**
 * True if this membership belongs in the WEB (owner/instructor) lens: an active
 * owner or instructor, or a pending instructor still awaiting approval (they wait
 * on the web, not the student app). Pending/active students belong to the mobile
 * lens instead. Drives which academies the web switcher lists.
 */
export function isWebLensMembership(m: {
  role: string;
  invitedRole?: string | null;
}): boolean {
  return (
    m.role === "owner" ||
    m.role === "instructor" ||
    m.invitedRole === "instructor"
  );
}

/**
 * True if this membership belongs in the MOBILE (student) lens: an active
 * student, or a pending member invited as a student (they wait on the app, on
 * the schedule — spec S3/S4). The complement of the web lens per membership, so
 * one person can be web-lens at one gym and student-lens at another. Drives the
 * mobile switcher + `academy.listMineStudent` (the deferred mobile pass).
 */
export function isStudentLensMembership(m: {
  role: string;
  invitedRole?: string | null;
}): boolean {
  return m.role === "student" || m.invitedRole === "student";
}
