import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Access control for academy roles: owner · instructor · student.
 *
 * This module is CLIENT-SAFE — it imports no server/db code, so both the server
 * auth config and the browser/Expo auth clients can share the exact same roles
 * (Better Auth requires that).
 *
 * At the Better Auth layer, `owner` has full organization control; `instructor`
 * and `student` are member-level (they cannot manage membership or settings).
 * The instructor↔student difference — who may manage classes and take
 * attendance — is enforced in our tRPC procedure tiers (staffProcedure), not
 * here. See docs/issues/20-instructor-permissions-and-approval-gate.md.
 */
export const ac = createAccessControl(defaultStatements);

export const owner = ac.newRole(ownerAc.statements);
export const instructor = ac.newRole(memberAc.statements);
export const student = ac.newRole(memberAc.statements);

export const roles = { owner, instructor, student };

/** The role names, as stored on the Better Auth `member` row. */
export type AcademyRole = keyof typeof roles;
