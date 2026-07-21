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
 * `pending` and `active` rows. A `suspended` or `removed` member keeps a row
 * (history is preserved) but has NO access — so the enrolled tier must reject
 * them, not just check that a row exists. See docs/issues/23 and spec §4.
 */
export function canEnroll(m: Membership): boolean {
  return m.status === "pending" || m.status === "active";
}

/** An approved member — owner, instructor, or student, once active. */
export function isActiveMember(m: Pick<Membership, "status">): boolean {
  return m.status === "active";
}

/** Active owner or instructor — may run the schedule and take attendance. */
export function isStaff(m: Membership): boolean {
  return isActiveMember(m) && (m.role === "owner" || m.role === "instructor");
}

/** Active owner — academy settings, invites, roster. */
export function isOwner(m: Membership): boolean {
  return isActiveMember(m) && m.role === "owner";
}

/** Suspended — access revoked by an owner; kept for history, not active. */
export function isSuspended(m: Membership): boolean {
  return m.status === "suspended";
}
