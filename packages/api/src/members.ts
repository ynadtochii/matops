import { TRPCError } from "@trpc/server";

import type { DbExec, DbReader, MemberRow, TenantTx } from "@matops/db";
import {
  and,
  eq,
  getMemberById,
  inArray,
  listMembersOf,
  setMemberRoleStatus,
} from "@matops/db";
import { entity, member, user } from "@matops/db/schema";
import { isStaff, isStudentMember } from "@matops/domain";

import { notifyMembershipApproved } from "./notify";

/**
 * The one academy-membership guard (docs/issues/60). Five routers each kept a
 * private copy of "load the member, 404 if it is not mine"; the `member` table
 * carries no RLS policy, so this check is the ONLY thing scoping a member id to
 * the caller's academy. One copy means one place to get it right.
 */

/** A `member` row as the guard hands it back. */
export type MemberRecord = NonNullable<
  Awaited<ReturnType<typeof getMemberById>>
>;

/**
 * The slice of a tenant context these guards need.
 *
 * `db` is the RLS-scoped transaction, not the base connection. The identity
 * tables carry no policy and `matops_app` keeps SELECT on them, so the rows are
 * the same either way — but reaching for the base connection here would check a
 * SECOND connection out of the pool and hold it for the length of the
 * transaction it sits inside (migration 0020, docs/issues/62).
 */
export interface MemberScope {
  academyId: string;
  db: DbReader;
}

/**
 * Load a member by id and assert it belongs to the caller's academy. Throws
 * NOT_FOUND (never FORBIDDEN) for a foreign id, so a caller cannot probe which
 * member ids exist in other academies.
 */
export async function requireMember(
  ctx: MemberScope,
  memberId: string,
): Promise<MemberRecord> {
  const m = await getMemberById(memberId, ctx.db);
  if (m?.academyId !== ctx.academyId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
  }
  return m;
}

/**
 * The academy's ACTIVE staff (owners + instructors), name-ordered. The one
 * definition of "who may coach a class", read by the instructor picker, the
 * O10 roster, and `requireInstructor`.
 */
export async function staffOf(ctx: MemberScope): Promise<MemberRow[]> {
  return staffAmong(await rosterOf(ctx));
}

/**
 * The same filter over rows a caller already loaded. The O10 reads need every
 * member's name as well as the roster, and one academy read should serve both.
 */
export function staffAmong(rows: MemberRow[]): MemberRow[] {
  return rows.filter(isStaff).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Assert a user id may be credited as a class's instructor: an ACTIVE owner or
 * instructor of the caller's academy. `class.instructor_id` is a plain text
 * column with no FK and no RLS of its own, so nothing else stops a staff member
 * writing an arbitrary user id there — and every O10 coach figure reads off it.
 *
 * Throws NOT_FOUND rather than FORBIDDEN so a caller cannot probe which users
 * belong to other academies.
 */
export async function requireInstructor(
  ctx: MemberScope,
  userId: string,
): Promise<void> {
  const staff = await staffOf(ctx);
  if (!staff.some((r) => r.accountUserId === userId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Instructor not found" });
  }
}

/**
 * The academy's full roster. Thirteen call sites passed `ctx.academyId, ctx.db`
 * by hand; this is the same read behind the same context shape the other guards
 * in this file take.
 */
export async function rosterOf(ctx: MemberScope): Promise<MemberRow[]> {
  return listMembersOf(ctx.academyId, ctx.db);
}

/** Display name by `user.id`, for rows that store a user id. */
export function nameByUser(rows: MemberRow[]): Map<string, string> {
  return new Map(
    rows.flatMap((r) =>
      r.accountUserId ? [[r.accountUserId, r.name] as const] : [],
    ),
  );
}

/** Display name by `member.id`, for rows that store a member id. */
export function nameByMember(rows: MemberRow[]): Map<string, string> {
  return new Map(rows.map((r) => [r.memberId, r.name]));
}

/** The tenant handles activation needs: the base connection plus an RLS tx. */
interface ActivateScope {
  academyId: string;
  baseDb: DbExec;
  withScope: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>;
}

export async function activateMember(
  ctx: ActivateScope,
  input: {
    memberId: string;
    userId: string;
    granted: { role: string; status: string };
  },
): Promise<void> {
  await setMemberRoleStatus(
    ctx.academyId,
    input.memberId,
    input.granted,
    ctx.baseDb,
  );
  // Welcome push to the newly approved member (§4/S3, docs/issues/17).
  await notifyMembershipApproved(
    { academyId: ctx.academyId, userId: input.userId },
    ctx.baseDb,
  );
}

type DirectoryMemberRow = Omit<MemberRow, "memberId"> & {
  memberId: string | null;
  inheritedRole: boolean;
};

export async function directoryRosterOf(
  ctx: MemberScope,
): Promise<DirectoryMemberRow[]> {
  const rows: DirectoryMemberRow[] = (await rosterOf(ctx)).map((row) => ({
    ...row,
    inheritedRole: false,
  }));
  const organizationStaff = await ctx.db
    .select({
      userId: member.userId,
      role: member.role,
      name: user.name,
      email: user.email,
      phone: user.phone,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(entity, eq(entity.organizationId, member.organizationId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(entity.id, ctx.academyId),
        inArray(member.role, ["owner", "manager"]),
      ),
    );
  for (const person of organizationStaff) {
    const held = rows.find((row) => row.accountUserId === person.userId);
    if (held) {
      held.inheritedRole = true;
      held.role = held.role === "owner" ? "owner" : person.role;
      held.status = "active";
      held.invitedRole = null;
    } else {
      rows.push({
        ...person,
        personId: person.userId,
        accountUserId: person.userId,
        memberId: null,
        status: "active",
        invitedRole: null,
        inheritedRole: true,
      });
    }
  }
  return rows;
}

export async function studentRosterOf(ctx: MemberScope): Promise<MemberRow[]> {
  return (await directoryRosterOf(ctx)).filter(
    (row): row is DirectoryMemberRow & { memberId: string } =>
      row.memberId !== null && isStudentMember(row),
  );
}
