/**
 * Pure authorization predicates for academy membership. No I/O — the tRPC
 * procedure tiers (packages/api) and any UI gate call these, so the rule lives in
 * ONE tested place. See docs/issues/20 (roles) and 23 (pending = view-only).
 */
export interface Membership {
  /** "owner" | "instructor" | "student" (Better Auth member role). */
  role: string;
  /** "pending" until an owner approves, then "active". */
  status: string;
}

/**
 * May this membership use the "enrolled" (view-only) tier at all? True only for
 * `pending` and `active` rows. A `suspended`, `archived` or `removed` member
 * keeps a row (history is preserved) but has NO access — so the enrolled tier
 * must reject them, not just check that a row exists. A whitelist on purpose: a
 * new status is denied until someone deliberately admits it. See docs/issues/23,
 * docs/issues/84 and spec §4.
 */
export function canEnroll(m: Membership): boolean {
  return m.status === "pending" || m.status === "active";
}

/** An approved member — owner, instructor, or student, once active. */
export function isActiveMember(m: Pick<Membership, "status">): boolean {
  return m.status === "active";
}

/**
 * Active owner, manager or instructor — may run the schedule and take
 * attendance. `manager` is here because a gym's manager reaches every branch
 * (ADR 129); they hold no `entity_membership` of their own, so the standing is
 * synthesized per request from their organization role.
 */
export function isStaff(m: Membership): boolean {
  return (
    isActiveMember(m) &&
    (m.role === "owner" || m.role === "manager" || m.role === "instructor")
  );
}

/** Active owner — academy settings, invites, members. */
export function isOwner(m: Membership): boolean {
  return isActiveMember(m) && m.role === "owner";
}

/**
 * Active manager of the GYM (spec FP7, ADR 128).
 *
 * A manager runs the day to day: the gym's people, plans, payments, staff and
 * reports, assigning memberships, confirming claims, announcing, and finishing
 * setup. They are not an owner, and the difference is the destructive half:
 * deleting the gym, making or removing an owner, the commercial account, and
 * switching a branch onto shared memberships all stay with owners.
 */
export function isManager(m: Membership): boolean {
  return isActiveMember(m) && m.role === "manager";
}

/**
 * May this person run the gym's daily work?
 *
 * The one predicate every organization-level read and ordinary write asks, so
 * adding a role later changes one line rather than forty call sites. Owner-only
 * actions keep asking `isOwner` instead, which is what makes them owner-only.
 */
export function runsOrganization(m: Membership): boolean {
  return isOwner(m) || isManager(m);
}

/**
 * May this person run this BRANCH's daily work (ADR 129)?
 *
 * The branch twin of {@link runsOrganization}: the schedule, attendance, local
 * members and their approvals, instructor assignments, leads, plans, dues,
 * claims and ordinary branch settings. Four actions stay on `isOwner` instead,
 * and that difference is the permission model: making or removing an owner,
 * permanent erase, deleting the branch, and the commercial account.
 */
export const runsBranch = runsOrganization;

/** Suspended — access revoked by an owner; kept for history, not active. */
export function isSuspended(m: Pick<Membership, "status">): boolean {
  return m.status === "suspended";
}

/**
 * Archived — the member left the gym (docs/issues/84). Access is revoked and
 * their upcoming bookings were cancelled, but every row they own is kept and an
 * owner can restore them. Distinct from `removed`, which an owner never sees: it
 * marks an applicant who was declined and was never a member at all.
 */
export function isArchived(m: Pick<Membership, "status">): boolean {
  return m.status === "archived";
}

/**
 * Does this membership still belong on the gym's roster? False once they are
 * archived or declined. The one predicate behind the member list and the
 * growth counts, so the two cannot disagree about who counts as a current
 * member.
 */
export function isOnRoster(m: Pick<Membership, "status">): boolean {
  return !isArchived(m) && m.status !== "removed";
}

export function isStaffRole(m: {
  role: string;
  invitedRole?: string | null;
  status?: string;
}): boolean {
  return (
    ["owner", "manager", "instructor"].includes(m.role) ||
    (m.status === "pending" &&
      ["owner", "manager", "instructor"].includes(m.invitedRole ?? ""))
  );
}

export function isStudentMember(m: {
  role: string;
  invitedRole?: string | null;
  status?: string;
}): boolean {
  return (
    !isStaffRole(m) &&
    (m.role === "student" ||
      (m.role === "member" &&
        m.status === "pending" &&
        (m.invitedRole ?? "student") === "student"))
  );
}
