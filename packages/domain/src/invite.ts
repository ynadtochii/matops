/**
 * Which roles a shareable invite link may carry. Never "owner": co-owners are
 * promoted from the member list, not invited (docs/issues/20). The link carries the
 * *intended* role, but grants nothing until an owner approves (docs/issues/14).
 */
export const INVITABLE_ROLES = ["student", "instructor"] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}
