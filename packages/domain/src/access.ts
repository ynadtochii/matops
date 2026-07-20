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

/** An approved member — owner, instructor, or student, once active. */
export function isActiveMember(m: Membership): boolean {
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
