import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Access control for gym roles: owner · manager · instructor · student.
 *
 * This module is CLIENT-SAFE — it imports no server/db code, so both the server
 * auth config and the browser/Expo auth clients can share the exact same roles
 * (Better Auth requires that).
 *
 * At the Better Auth layer, `owner` has full organization control and everybody
 * else is member-level. The differences that matter to this product are
 * enforced in our tRPC procedure tiers rather than here: instructor versus
 * student by `staffProcedure` (docs/issues/20), and **manager versus owner** by
 * the organization tiers (ADR 128). That split is deliberate. Better Auth's
 * statements describe ITS objects, organizations, members and invitations,
 * while the things a manager may and may not do are ours: assigning a
 * membership, confirming a claim, switching a branch onto memberships.
 */
export const ac = createAccessControl(defaultStatements);

export const owner = ac.newRole(ownerAc.statements);
/**
 * Runs the gym day to day without owning it (spec FP7).
 *
 * Member-level at this layer on purpose: a manager must not be able to delete
 * the organization, promote an owner or remove one, and the surest way to
 * guarantee that is to withhold the Better Auth statements that would let them,
 * rather than to remember a check at each call site.
 */
export const manager = ac.newRole(memberAc.statements);
export const instructor = ac.newRole(memberAc.statements);
export const student = ac.newRole(memberAc.statements);

export const roles = { owner, manager, instructor, student };

/** The role names, as stored on the Better Auth `member` row. */
export type AcademyRole = keyof typeof roles;
