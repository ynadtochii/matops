import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { canRemoveOrDemote } from "@matops/domain";

import type { DbExec } from "./client";
import type { DbReader } from "./tenant";
import { member, organization, user } from "./auth-schema";
import { entity, entityMembership } from "./entity-schema";

export interface Membership {
  /** Better Auth role on the member row: "owner" | "instructor" | "student". */
  role: string;
  /** "pending" until an owner approves, then "active" (docs/issues/20, 23). */
  status: string;
  memberId: string;
  joinedAt: Date;
}

/**
 * Look up the caller's membership in one academy. Reads Better Auth's `member`
 * table on the base connection (that table has no RLS policy, RLS is only on
 * our domain tables, see docs/issues/12), scoped explicitly by user + academy.
 * Returns null if the user is not a member of that academy.
 *
 * `exec` is REQUIRED on every base-connection read AND write in this module, and
 * no default falls back to the module singleton: a missed call site has to be a
 * compile error, not a silent connection swap (docs/issues/60).
 */
export async function getMembership(
  userId: string,
  organizationId: string,
  exec: DbReader,
): Promise<Membership | null> {
  const rows = await exec
    .select({
      memberId: member.id,
      role: member.role,
      status: member.status,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, organizationId),
        isNull(organization.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    memberId: row.memberId,
    role: row.role,
    status: row.status ?? "pending",
    joinedAt: row.joinedAt,
  };
}

/** One entity the caller may act in, and how (ADR 124). */
export interface EntityMembership {
  id: string;
  organizationId: string;
  entityId: string;
  role: string;
  status: string;
  joinedAt: Date | null;
  createdAt: Date;
}

/**
 * Look up the caller's membership in one entity. Reads on the BASE connection
 * because it runs before the request transaction opens, which is the same
 * reason {@link getMembership} does (docs/issues/60). Returns null when the
 * person has no membership row for that entity, which the entity procedure
 * turns into a refusal.
 */
export async function getEntityMembership(
  userId: string,
  entityId: string,
  exec: DbReader,
): Promise<EntityMembership | null> {
  const rows = await exec
    .select({
      id: entityMembership.id,
      organizationId: entityMembership.organizationId,
      entityId: entityMembership.entityId,
      role: entityMembership.role,
      status: entityMembership.status,
      joinedAt: entityMembership.joinedAt,
      createdAt: entityMembership.createdAt,
    })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.userId, userId),
        eq(entityMembership.entityId, entityId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** One entity, as the request tiers need to see it. */
export interface ScopedEntity {
  id: string;
  organizationId: string;
  type: string;
  name: string;
}

/**
 * Load one live entity, but only if it belongs to `organizationId`. A caller
 * naming an entity of another organization gets null, so the tier answers the
 * same way it does for an entity that does not exist and cannot be used to
 * enumerate other people's gyms. Base connection, pre-transaction.
 */
export async function getEntityInOrganization(
  entityId: string,
  organizationId: string,
  exec: DbReader,
): Promise<ScopedEntity | null> {
  const rows = await exec
    .select({
      id: entity.id,
      organizationId: entity.organizationId,
      type: entity.type,
      name: entity.name,
    })
    .from(entity)
    .where(
      and(
        eq(entity.id, entityId),
        eq(entity.organizationId, organizationId),
        isNull(entity.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Every live entity of one organization, oldest first with the default first.
 * The entity selector and the organization overview both read it.
 */
export async function listEntitiesOf(
  organizationId: string,
  exec: DbReader,
): Promise<ScopedEntity[]> {
  return exec
    .select({
      id: entity.id,
      organizationId: entity.organizationId,
      type: entity.type,
      name: entity.name,
    })
    .from(entity)
    .where(
      and(eq(entity.organizationId, organizationId), isNull(entity.deletedAt)),
    )
    .orderBy(desc(entity.isDefault), entity.createdAt);
}

/**
 * The entities of one organization that this person actually holds a live
 * membership in. The organization owner is not special here: the caller decides
 * whether to use this or {@link listEntitiesOf}, because an owner reaches every
 * entity and a coach must not be offered a door that would refuse them.
 */
export async function listEntitiesForUser(
  organizationId: string,
  userId: string,
  exec: DbReader,
): Promise<ScopedEntity[]> {
  return exec
    .select({
      id: entity.id,
      organizationId: entity.organizationId,
      type: entity.type,
      name: entity.name,
    })
    .from(entity)
    .innerJoin(
      entityMembership,
      and(
        eq(entityMembership.entityId, entity.id),
        eq(entityMembership.userId, userId),
      ),
    )
    .where(
      and(eq(entity.organizationId, organizationId), isNull(entity.deletedAt)),
    )
    .orderBy(desc(entity.isDefault), entity.createdAt);
}

/**
 * Resolve the caller's `member.id` in one academy (base connection — the member
 * table has no RLS). Payment tables key dues + claims by `member.id`, but the
 * tRPC context only carries `user.id` + `academyId`, so a student-facing payments
 * resolver maps one to the other here. Returns null if not a member.
 */
export async function getMemberIdForUser(
  userId: string,
  academyId: string,
  exec: DbReader,
): Promise<string | null> {
  const rows = await exec
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, academyId)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Mark a member row active. Used by the onboarding hook (the academy creator is
 * an active owner at once — docs/issues/20) and by owner approval. Writes the
 * Better Auth `member` table on the base connection (no RLS there).
 */
export async function setMemberActive(
  memberId: string,
  exec: DbExec,
): Promise<void> {
  await exec
    .update(member)
    .set({ status: "active" })
    .where(eq(member.id, memberId));
}

/** One academy the user belongs to, with the caller's role/status there. */
export interface UserAcademy {
  academyId: string;
  name: string;
  slug: string;
  timeZone: string | null;
  country: string | null;
  address: string | null;
  mapUrl: string | null;
  curriculumForStudents: boolean;
  role: string;
  status: string;
  invitedRole: string | null;
  joinedAt: Date;
}

/**
 * Every academy the user is a member of (any status), for the switcher lens.
 *
 * `exec` is REQUIRED like every other reader in this module (docs/issues/60).
 * It was the one helper still closing over the module singleton, so the router
 * tests could not reach it and it hit the real pool from inside a test run.
 */
export async function listMembershipsForUser(
  userId: string,
  exec: DbReader,
): Promise<UserAcademy[]> {
  const rows = await exec
    .select({
      academyId: organization.id,
      name: organization.name,
      slug: organization.slug,
      timeZone: organization.timeZone,
      country: organization.country,
      address: organization.address,
      mapUrl: organization.mapUrl,
      curriculumForStudents: organization.curriculumForStudents,
      role: member.role,
      status: member.status,
      invitedRole: member.invitedRole,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), isNull(organization.deletedAt)));

  return rows.map((r) => ({ ...r, status: r.status ?? "pending" }));
}

/** Set the user's display name + phone at self-join (spec S1, minimal fields). */
export async function updateUserProfile(
  userId: string,
  profile: { name: string; phone: string },
  exec: DbExec,
): Promise<void> {
  await exec
    .update(user)
    .set({ name: profile.name, phone: profile.phone })
    .where(eq(user.id, userId));
}

/** A full member row plus the joined user profile, for the member list (spec O4). */
export interface MemberRow {
  memberId: string;
  userId: string;
  role: string;
  status: string;
  invitedRole: string | null;
  name: string;
  email: string;
  phone: string | null;
  createdAt: Date;
}

/** Every member of one academy, newest first, with the user profile joined. */
export async function listMembersOf(
  academyId: string,
  exec: DbReader,
): Promise<MemberRow[]> {
  const rows = await exec
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      status: member.status,
      invitedRole: member.invitedRole,
      name: user.name,
      email: user.email,
      phone: user.phone,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, academyId));

  return rows
    .map((r) => ({ ...r, status: r.status ?? "pending" }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** One member row by id, or null. Includes the academy id so owner mutations can
 * verify the target belongs to the caller's academy (the table has no RLS). */
export async function getMemberById(
  memberId: string,
  exec: DbReader,
): Promise<{
  id: string;
  academyId: string;
  userId: string;
  role: string;
  status: string;
  invitedRole: string | null;
} | null> {
  const rows = await exec
    .select({
      id: member.id,
      academyId: member.organizationId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      invitedRole: member.invitedRole,
    })
    .from(member)
    .where(eq(member.id, memberId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { ...row, status: row.status ?? "pending" };
}

/** Write a new role + status (owner approval grants the role here). */
export async function setMemberRoleStatus(
  memberId: string,
  next: { role: string; status: string },
  exec: DbExec,
): Promise<void> {
  await exec
    .update(member)
    .set({ role: next.role, status: next.status })
    .where(eq(member.id, memberId));
}

/** Set only the status (suspend, or soft-remove — keeps the row + its history). */
export async function setMemberStatus(
  memberId: string,
  status: string,
  exec: DbExec,
): Promise<void> {
  await exec.update(member).set({ status }).where(eq(member.id, memberId));
}

/**
 * Set a member's status (suspend / remove) ATOMICALLY with the "never ownerless"
 * check (spec §4). The check and the write must not race: two owners removing
 * each other at the same time could each read `2 active owners`, both pass a
 * separate check, and leave the academy with none. So we do it in ONE
 * transaction, locking the academy's member rows with `FOR UPDATE` so concurrent
 * mutations serialize, re-run the pure `canRemoveOrDemote` guard on the freshly
 * locked rows, and only then write. Returns `{ ok: false }` (no write) when the
 * change would drop the last active owner.
 *
 * Runs on the base connection (the `member` table has no RLS — RLS is only on our
 * domain tables, docs/issues/12); isolation comes from the explicit `academyId`
 * filter plus the row lock.
 */
export async function setMemberStatusIfNotLastOwner(
  academyId: string,
  memberId: string,
  status: string,
  exec: DbExec,
): Promise<{ ok: boolean }> {
  return exec.transaction(async (tx) => {
    const rows = await tx
      .select({ id: member.id, role: member.role, status: member.status })
      .from(member)
      .where(eq(member.organizationId, academyId))
      .for("update");

    const members = rows.map((r) => ({
      id: r.id,
      role: r.role,
      status: r.status ?? "pending",
    }));

    if (!canRemoveOrDemote(members, memberId)) {
      return { ok: false };
    }

    await tx.update(member).set({ status }).where(eq(member.id, memberId));
    return { ok: true };
  });
}

/** Set only the role (promote a member to co-owner). */
export async function setMemberRole(
  memberId: string,
  role: string,
  exec: DbExec,
): Promise<void> {
  await exec.update(member).set({ role }).where(eq(member.id, memberId));
}

/**
 * Set a member's ROLE (demote an owner → instructor) ATOMICALLY with the "never
 * ownerless" check (spec §4). The sibling of `setMemberStatusIfNotLastOwner`:
 * same locked transaction, same `canRemoveOrDemote` re-check on the freshly
 * locked rows — so two owners stepping each other down at the same time cannot
 * both pass and strand the gym. Writes the role only when the change keeps at
 * least one active owner; returns `{ ok: false }` (no write) otherwise.
 */
export async function setMemberRoleIfNotLastOwner(
  academyId: string,
  memberId: string,
  role: string,
  exec: DbExec,
): Promise<{ ok: boolean }> {
  return exec.transaction(async (tx) => {
    const rows = await tx
      .select({ id: member.id, role: member.role, status: member.status })
      .from(member)
      .where(eq(member.organizationId, academyId))
      .for("update");

    const members = rows.map((r) => ({
      id: r.id,
      role: r.role,
      status: r.status ?? "pending",
    }));

    if (!canRemoveOrDemote(members, memberId)) {
      return { ok: false };
    }

    await tx.update(member).set({ role }).where(eq(member.id, memberId));
    return { ok: true };
  });
}

/**
 * Create — or re-open — a PENDING membership for a self-joining user
 * (docs/issues/14, 20). The member holds the harmless Better Auth default role
 * (`member`, not an academy role); the real role is granted only at approval. The
 * intended role rides on `invitedRole`.
 *
 * Idempotent by (user, academy): if a live membership already exists it is left
 * as-is; a previously removed one is re-opened to pending. Returns the resulting
 * status so the API can tell "joined" from "already a member".
 */
export async function createPendingMembership(
  input: {
    userId: string;
    academyId: string;
    invitedRole: string;
  },
  exec: DbExec,
): Promise<{ status: string; alreadyMember: boolean }> {
  const existing = await exec
    .select({ id: member.id, status: member.status })
    .from(member)
    .where(
      and(
        eq(member.userId, input.userId),
        eq(member.organizationId, input.academyId),
      ),
    )
    .limit(1);

  const row = existing[0];
  if (row) {
    const status = row.status ?? "pending";
    // Still waiting: the newest link wins, so an instructor link opened after a
    // student one is approved as an instructor, not as a stale student.
    if (status === "pending") {
      await exec
        .update(member)
        .set({ invitedRole: input.invitedRole })
        .where(eq(member.id, row.id));
      return { status, alreadyMember: true };
    }
    // Already active: changing an approved member's role is the owner's call
    // (membership.setRole), not a link's.
    if (status === "active") {
      return { status, alreadyMember: true };
    }
    // Removed/rejected/suspended → re-open as pending with the fresh intent.
    await exec
      .update(member)
      .set({
        status: "pending",
        role: "member",
        invitedRole: input.invitedRole,
      })
      .where(eq(member.id, row.id));
    return { status: "pending", alreadyMember: false };
  }

  await exec.insert(member).values({
    id: randomUUID(),
    organizationId: input.academyId,
    userId: input.userId,
    role: "member",
    status: "pending",
    invitedRole: input.invitedRole,
    createdAt: new Date(),
  });
  return { status: "pending", alreadyMember: false };
}

export interface ResolvedAccount {
  userId: string;
  /** True when the address already had an account before this call. */
  existed: boolean;
}

/**
 * The account an owner-promoted lead signs into (ADR 118). Email is Better
 * Auth's identity, so the address alone decides: an existing user is reused and
 * their name and phone are left alone (they own that profile, the gym does
 * not), and a new one is written unverified. Better Auth's magic-link verify
 * finds a user by email and flips `email_verified` itself on first sign-in, so
 * nothing here has to claim the address is proven.
 *
 * The lookup is case-insensitive because `user.email` is unique on the exact
 * string, and an owner typing `Pat@Example.com` must not fork a second account.
 */
export async function resolveAccountByEmail(
  input: { email: string; name: string; phone: string },
  exec: DbExec,
): Promise<ResolvedAccount> {
  const email = input.email.trim().toLowerCase();
  const existing = await exec
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, email))
    .limit(1);

  const found = existing[0];
  if (found) return { userId: found.id, existed: true };

  const userId = randomUUID();
  await exec.insert(user).values({
    id: userId,
    name: input.name,
    email,
    emailVerified: false,
    phone: input.phone,
  });
  return { userId, existed: false };
}
