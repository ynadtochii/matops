import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { canRemoveOrDemote } from "@matops/domain";

import type { DbExec } from "./client";
import type { DbReader, TenantTx } from "./tenant";
import { member, organization, user } from "./auth-schema";
import { academyProfile, entity, entityMembership } from "./entity-schema";

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

/**
 * The caller's membership at one entity, in the shape the academy tiers read.
 *
 * Role and status come from `entity_membership`, and `memberId` is that row's
 * id, because every dues, claim, rank, note and referral row keys on it. A
 * closed academy is not a membership, so the entity and its organization must
 * both still be live.
 */
export async function getAcademyMembership(
  userId: string,
  entityId: string,
  exec: DbReader,
): Promise<Membership | null> {
  const rows = await exec
    .select({
      memberId: entityMembership.id,
      role: entityMembership.role,
      status: entityMembership.status,
      joinedAt: entityMembership.joinedAt,
      createdAt: entityMembership.createdAt,
    })
    .from(entityMembership)
    .innerJoin(entity, eq(entity.id, entityMembership.entityId))
    .innerJoin(
      organization,
      eq(organization.id, entityMembership.organizationId),
    )
    .where(
      and(
        eq(entityMembership.userId, userId),
        eq(entityMembership.entityId, entityId),
        isNull(entity.deletedAt),
        isNull(organization.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    memberId: row.memberId,
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt ?? row.createdAt,
  };
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
 * Resolve the caller's `entity_membership.id` at one entity. Dues, claims,
 * ranks, notes and referrals all key on that id, but the tRPC context only
 * carries `user.id` and the entity id, so a student-facing resolver maps one to
 * the other here. Returns null if the person has no membership there.
 */
export async function getMemberIdForUser(
  userId: string,
  entityId: string,
  exec: DbReader,
): Promise<string | null> {
  const rows = await exec
    .select({ id: entityMembership.id })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.userId, userId),
        eq(entityMembership.entityId, entityId),
      ),
    )
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
  organizationId: string;
  type: string;
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
 * Every academy the user trains or works at, for the switcher lens. One row per
 * ENTITY membership, with that entity's own name, time zone and address, so a
 * gym with two mats shows two (ADR 124).
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
      academyId: entity.id,
      organizationId: entity.organizationId,
      type: entity.type,
      name: entity.name,
      slug: entity.slug,
      timeZone: entity.timeZone,
      country: entity.country,
      address: entity.address,
      mapUrl: entity.mapUrl,
      curriculumForStudents: academyProfile.curriculumForStudents,
      role: entityMembership.role,
      status: entityMembership.status,
      invitedRole: entityMembership.invitedRole,
      joinedAt: entityMembership.joinedAt,
      createdAt: entityMembership.createdAt,
    })
    .from(entityMembership)
    .innerJoin(entity, eq(entity.id, entityMembership.entityId))
    .innerJoin(academyProfile, eq(academyProfile.entityId, entity.id))
    .innerJoin(organization, eq(organization.id, entity.organizationId))
    .where(
      and(
        eq(entityMembership.userId, userId),
        isNull(entity.deletedAt),
        isNull(organization.deletedAt),
      ),
    );

  return rows.map(({ createdAt, joinedAt, ...r }) => ({
    ...r,
    joinedAt: joinedAt ?? createdAt,
  }));
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

/** Every member of one entity, newest first, with the user profile joined. */
export async function listMembersOf(
  entityId: string,
  exec: DbReader,
): Promise<MemberRow[]> {
  const rows = await exec
    .select({
      memberId: entityMembership.id,
      userId: entityMembership.userId,
      role: entityMembership.role,
      status: entityMembership.status,
      invitedRole: entityMembership.invitedRole,
      name: user.name,
      email: user.email,
      phone: user.phone,
      createdAt: entityMembership.createdAt,
    })
    .from(entityMembership)
    .innerJoin(user, eq(entityMembership.userId, user.id))
    .where(eq(entityMembership.entityId, entityId));

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** One entity membership by id, or null. Includes the entity id so owner
 * mutations can verify the target belongs to the caller's academy. */
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
      id: entityMembership.id,
      academyId: entityMembership.entityId,
      userId: entityMembership.userId,
      role: entityMembership.role,
      status: entityMembership.status,
      invitedRole: entityMembership.invitedRole,
    })
    .from(entityMembership)
    .where(eq(entityMembership.id, memberId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Write role and status for one person at one entity (ADR 124).
 *
 * `entity_membership` is the operational record and the source of truth. The
 * Better Auth `member` row is written to match and is a MIRROR: it is what the
 * academy procedure tiers still read, and both clients still use those tiers,
 * so letting the two disagree would show a person one thing and let them do
 * another. Wave 7 drops `member.status` and `member.invited_role` and the
 * mirror goes with them.
 *
 * The caller names the person by `entity_membership.id`, which is the id every
 * router and both clients hold; the Better Auth row is found through the user
 * and organization behind it.
 */
type DbWriter = DbExec | TenantTx;

async function writeMembership(
  input: {
    entityId: string;
    memberId: string;
    next: { role?: string; status?: string };
  },
  exec: DbWriter,
): Promise<void> {
  const { role, status } = input.next;

  const entityPatch: { role?: string; status?: string; joinedAt?: Date } = {};
  if (role !== undefined) entityPatch.role = role;
  if (status !== undefined) {
    entityPatch.status = status;
    if (status === "active") entityPatch.joinedAt = new Date();
  }
  if (Object.keys(entityPatch).length === 0) return;

  const written = await exec
    .update(entityMembership)
    .set(entityPatch)
    .where(
      and(
        eq(entityMembership.id, input.memberId),
        eq(entityMembership.entityId, input.entityId),
      ),
    )
    .returning({
      userId: entityMembership.userId,
      organizationId: entityMembership.organizationId,
    });

  const target = written[0];
  if (!target) return;

  const memberPatch: { role?: string; status?: string } = {};
  if (role !== undefined) memberPatch.role = role;
  if (status !== undefined) memberPatch.status = status;
  await exec
    .update(member)
    .set(memberPatch)
    .where(
      and(
        eq(member.userId, target.userId),
        eq(member.organizationId, target.organizationId),
      ),
    );
}

/** Write a new role + status (owner approval grants the role here). */
export async function setMemberRoleStatus(
  entityId: string,
  memberId: string,
  next: { role: string; status: string },
  exec: DbExec,
): Promise<void> {
  await writeMembership({ entityId, memberId, next }, exec);
}

/** Set only the status (suspend, or soft-remove — keeps the row + its history). */
export async function setMemberStatus(
  entityId: string,
  memberId: string,
  status: string,
  exec: DbExec,
): Promise<void> {
  await writeMembership({ entityId, memberId, next: { status } }, exec);
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
/**
 * Lock the entity's memberships and answer whether this change may go ahead.
 *
 * Two checks, both of which must pass. The ENTITY check runs over
 * `entity_membership`, because that is where the operational role and status
 * live now: a mat left with no active owner is the thing worth refusing. The
 * ORGANIZATION check runs over the Better Auth rows, because those still decide
 * who may reach every entity. The person is named by `entity_membership.id`, so
 * both sets are keyed by the user behind each row and the pure rule compares
 * those.
 */
async function mayChangeEntityMembership(
  tx: TenantTx,
  entityId: string,
  memberId: string,
): Promise<boolean> {
  const targets = await tx
    .select({ userId: entityMembership.userId })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.id, memberId),
        eq(entityMembership.entityId, entityId),
      ),
    )
    .limit(1);
  const targetUserId = targets[0]?.userId;
  if (!targetUserId) return false;

  const rows = await tx
    .select({
      userId: entityMembership.userId,
      role: entityMembership.role,
      status: entityMembership.status,
      organizationId: entityMembership.organizationId,
    })
    .from(entityMembership)
    .where(eq(entityMembership.entityId, entityId))
    .for("update");

  const keepsTheMat = canRemoveOrDemote(
    rows.map((r) => ({ id: r.userId, role: r.role, status: r.status })),
    targetUserId,
  );
  if (!keepsTheMat) return false;

  // And the organization itself. The Better Auth row is written to match the
  // entity one, so stepping someone down at one mat also strips their
  // organization role — which is how an owner of two mats could end up locking
  // themselves out of both. Both checks must pass.
  const organizationId = rows[0]?.organizationId;
  if (!organizationId) return true;
  const orgRows = await tx
    .select({
      userId: member.userId,
      role: member.role,
      status: member.status,
    })
    .from(member)
    .where(eq(member.organizationId, organizationId))
    .for("update");

  return canRemoveOrDemote(
    orgRows.map((r) => ({
      id: r.userId,
      role: r.role,
      status: r.status ?? "pending",
    })),
    targetUserId,
  );
}

export async function setMemberStatusIfNotLastOwner(
  entityId: string,
  memberId: string,
  status: string,
  exec: DbExec,
): Promise<{ ok: boolean }> {
  return exec.transaction(async (tx) => {
    if (!(await mayChangeEntityMembership(tx, entityId, memberId))) {
      return { ok: false };
    }
    await writeMembership({ entityId, memberId, next: { status } }, tx);
    return { ok: true };
  });
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
  entityId: string,
  memberId: string,
  role: string,
  exec: DbExec,
): Promise<{ ok: boolean }> {
  return exec.transaction(async (tx) => {
    if (!(await mayChangeEntityMembership(tx, entityId, memberId))) {
      return { ok: false };
    }
    await writeMembership({ entityId, memberId, next: { role } }, tx);
    return { ok: true };
  });
}

/**
 * Create — or re-open — a PENDING membership for a self-joining user
 * (docs/issues/14, 20, ADR 124).
 *
 * Two rows, two jobs. The Better Auth `member` row records that the person
 * belongs to the ORGANIZATION at all, and is reused untouched if they already
 * do — someone who trains at one mat and opens a link to a second must not have
 * their first membership reset. The `entity_membership` row is the operational
 * one: pending, holding no academy role, with the intended role on
 * `invitedRole` until an owner approves.
 *
 * Idempotent on both. The status returned is the ENTITY's, because that is what
 * the join screen is telling the person about.
 */
async function upsertPendingEntityMembership(
  input: {
    userId: string;
    organizationId: string;
    entityId: string;
    invitedRole: string;
  },
  exec: DbExec,
): Promise<{ status: string; alreadyMember: boolean }> {
  const existing = await exec
    .select({ id: entityMembership.id, status: entityMembership.status })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.userId, input.userId),
        eq(entityMembership.entityId, input.entityId),
      ),
    )
    .limit(1);

  const row = existing[0];
  if (row) {
    if (row.status === "pending") {
      await exec
        .update(entityMembership)
        .set({ invitedRole: input.invitedRole })
        .where(eq(entityMembership.id, row.id));
      return { status: row.status, alreadyMember: true };
    }
    if (row.status === "active") {
      return { status: row.status, alreadyMember: true };
    }
    await exec
      .update(entityMembership)
      .set({
        status: "pending",
        role: "member",
        invitedRole: input.invitedRole,
        joinedAt: null,
      })
      .where(eq(entityMembership.id, row.id));
    return { status: "pending", alreadyMember: false };
  }

  await exec.insert(entityMembership).values({
    organizationId: input.organizationId,
    entityId: input.entityId,
    userId: input.userId,
    role: "member",
    status: "pending",
    invitedRole: input.invitedRole,
  });
  return { status: "pending", alreadyMember: false };
}

export async function createPendingMembership(
  input: {
    userId: string;
    organizationId: string;
    entityId: string;
    invitedRole: string;
  },
  exec: DbExec,
): Promise<{ status: string; alreadyMember: boolean }> {
  const academyId = input.organizationId;
  const existing = await exec
    .select({ id: member.id, status: member.status })
    .from(member)
    .where(
      and(
        eq(member.userId, input.userId),
        eq(member.organizationId, academyId),
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
    } else if (status !== "active") {
      // Removed/rejected/suspended → re-open as pending with the fresh intent.
      // An ACTIVE row is left alone: changing an approved member's role is the
      // owner's call (membership.setRole), not a link's, and someone already
      // training at a sibling entity must keep the access they have.
      await exec
        .update(member)
        .set({
          status: "pending",
          role: "member",
          invitedRole: input.invitedRole,
        })
        .where(eq(member.id, row.id));
    }
  } else {
    await exec.insert(member).values({
      id: randomUUID(),
      organizationId: academyId,
      userId: input.userId,
      role: "member",
      status: "pending",
      invitedRole: input.invitedRole,
      createdAt: new Date(),
    });
  }

  return upsertPendingEntityMembership(input, exec);
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
