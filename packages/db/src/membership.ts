import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { canRemoveOrDemote } from "@matops/domain";

import type { DbExec } from "./client";
import type { DbReader, TenantTx } from "./tenant";
import { member, organization, user } from "./auth-schema";
import { academyProfile, entity, entityMembership } from "./entity-schema";
import { person } from "./person-schema";

/** The statuses `canEnroll` admits, as a SQL filter (docs/issues/23). */
const ENROLLABLE_STATUSES = ["pending", "active"];

export interface Membership {
  /** Better Auth role on the member row: "owner" | "instructor" | "student". */
  role: string;
  /** "pending" until an owner approves, then "active" (docs/issues/20, 23). */
  status: string;
  memberId: string;
  joinedAt: Date;
}

/**
 * Look up the caller's membership of one ORGANIZATION. Reads Better Auth's
 * `member` table on the base connection (that table has no RLS policy, RLS is
 * only on our domain tables, see docs/issues/12), scoped explicitly by user +
 * organization. Returns null if the user does not belong to it.
 *
 * The row's EXISTENCE is the membership, which is why the status is a constant.
 * Whether a person may do anything at a place is `entity_membership`'s answer,
 * and `member.status` was dropped with the mirror in the contract migration
 * (ADR 124). `purge` deletes this row once the last entity membership is gone.
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
    status: "active",
    joinedAt: row.joinedAt,
  };
}

/** One entity the caller may act in, and how (ADR 124). */
export interface EntityMembership {
  id: string;
  personId: string | null;
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
      personId: sql<
        string | null
      >`coalesce(${entityMembership.personId}, ${person.id})`,
      organizationId: entityMembership.organizationId,
      entityId: entityMembership.entityId,
      role: entityMembership.role,
      status: entityMembership.status,
      joinedAt: entityMembership.joinedAt,
      createdAt: entityMembership.createdAt,
    })
    .from(entityMembership)
    .leftJoin(
      person,
      and(
        eq(person.organizationId, entityMembership.organizationId),
        eq(person.accountUserId, userId),
      ),
    )
    .where(
      and(
        or(
          eq(entityMembership.userId, userId),
          eq(entityMembership.personId, person.id),
        ),
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
    .leftJoin(
      person,
      and(
        eq(person.organizationId, entityMembership.organizationId),
        eq(person.accountUserId, userId),
      ),
    )
    .innerJoin(entity, eq(entity.id, entityMembership.entityId))
    .innerJoin(
      organization,
      eq(organization.id, entityMembership.organizationId),
    )
    .where(
      and(
        or(
          eq(entityMembership.userId, userId),
          eq(entityMembership.personId, person.id),
        ),
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
  membershipEnforcedAt: Date | null;
}

/**
 * Load one live entity, but only if it belongs to `organizationId`. A caller
 * naming an entity of another organization gets null, so the tier answers the
 * same way it does for an entity that does not exist and cannot be used to
 * enumerate other people's gyms. Base connection, pre-transaction.
 *
 * `status` is read beside `deleted_at` so the column is an access control
 * rather than decoration: setting it to anything but `active` closes the mat.
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
      membershipEnforcedAt: entity.membershipEnforcedAt,
    })
    .from(entity)
    .where(
      and(
        eq(entity.id, entityId),
        eq(entity.organizationId, organizationId),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The gyms this person RUNS, as an owner or a manager, whether or not any of
 * them has a branch yet (ADR 128, widened by ADR 129).
 *
 * `listMembershipsForUser` cannot answer this: it joins `member` to `entity`,
 * so an owner whose gym has no branch reads as belonging to nothing, and the
 * post-login gate would offer them the student join-by-code screen (ADR 128).
 */
export async function listOwnedOrganizations(
  userId: string,
  exec: DbReader,
): Promise<{ organizationId: string; name: string }[]> {
  return exec
    .select({ organizationId: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        eq(member.userId, userId),
        // Managers run the gym too, so they land on it and may make it active
        // (ADR 129). The destructive half is still refused by the owner tiers.
        inArray(member.role, ["owner", "manager"]),
        isNull(organization.deletedAt),
      ),
    )
    .orderBy(member.createdAt);
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
      membershipEnforcedAt: entity.membershipEnforcedAt,
    })
    .from(entity)
    .where(
      and(
        eq(entity.organizationId, organizationId),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
      ),
    )
    .orderBy(desc(entity.isDefault), entity.createdAt);
}

/**
 * The entities of one organization that this person actually holds a live
 * membership in. The organization owner is not special here: the caller decides
 * whether to use this or {@link listEntitiesOf}, because an owner reaches every
 * entity and a coach must not be offered a door that would refuse them.
 *
 * `suspended`, `archived` and `removed` rows are left out for the same reason:
 * the entity tier would refuse the click, so offering it is offering a door
 * that does not open.
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
      membershipEnforcedAt: entity.membershipEnforcedAt,
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
      and(
        eq(entity.organizationId, organizationId),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
        inArray(entityMembership.status, ENROLLABLE_STATUSES),
      ),
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
  /** Set once shared memberships decide access here (ADR 126). */
  membershipEnforcedAt: Date | null;
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
 * An active ORGANIZATION owner gets a row for every entity of that organization
 * whether or not they hold a membership at it, and their organization role wins
 * over whatever the entity membership says. That is ADR 124 §2 ("an active
 * organization owner reaches every entity") and it is the same rule
 * `resolveEntity` applies, so the screen and the API cannot disagree about which
 * mats are open.
 *
 * `exec` is REQUIRED like every other reader in this module (docs/issues/60).
 * It was the one helper still closing over the module singleton, so the router
 * tests could not reach it and it hit the real pool from inside a test run.
 */
export async function listMembershipsForUser(
  userId: string,
  exec: DbReader,
): Promise<UserAcademy[]> {
  const entityCols = {
    academyId: entity.id,
    organizationId: entity.organizationId,
    type: entity.type,
    name: entity.name,
    slug: entity.slug,
    timeZone: entity.timeZone,
    country: entity.country,
    address: entity.address,
    mapUrl: entity.mapUrl,
    curriculumForStudents: sql<boolean>`coalesce(${academyProfile.curriculumForStudents}, false)`,
    membershipEnforcedAt: entity.membershipEnforcedAt,
  };

  const owned = await exec
    .select({ ...entityCols, joinedAt: member.createdAt })
    .from(member)
    .innerJoin(entity, eq(entity.organizationId, member.organizationId))
    .leftJoin(academyProfile, eq(academyProfile.entityId, entity.id))
    .innerJoin(organization, eq(organization.id, entity.organizationId))
    .where(
      and(
        eq(member.userId, userId),
        eq(member.role, "owner"),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
        isNull(organization.deletedAt),
      ),
    );

  const rows = await exec
    .select({
      ...entityCols,
      role: entityMembership.role,
      status: entityMembership.status,
      invitedRole: entityMembership.invitedRole,
      joinedAt: entityMembership.joinedAt,
      createdAt: entityMembership.createdAt,
    })
    .from(entityMembership)
    .innerJoin(entity, eq(entity.id, entityMembership.entityId))
    .leftJoin(academyProfile, eq(academyProfile.entityId, entity.id))
    .innerJoin(organization, eq(organization.id, entity.organizationId))
    .where(
      and(
        eq(entityMembership.userId, userId),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
        isNull(organization.deletedAt),
      ),
    );

  const byEntity = new Map<string, UserAcademy>();
  for (const { createdAt, joinedAt, ...r } of rows) {
    byEntity.set(r.academyId, { ...r, joinedAt: joinedAt ?? createdAt });
  }
  for (const r of owned) {
    const held = byEntity.get(r.academyId);
    byEntity.set(r.academyId, {
      ...r,
      role: "owner",
      status: "active",
      invitedRole: held?.invitedRole ?? null,
      joinedAt: held?.joinedAt ?? r.joinedAt,
    });
  }
  return [...byEntity.values()];
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
  personId: string;
  userId: string;
  accountUserId: string | null;
  role: string;
  status: string;
  invitedRole: string | null;
  name: string;
  email: string | null;
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
      personId: sql<string>`coalesce(${person.id}::text, ${entityMembership.userId})`,
      userId: sql<string>`coalesce(${person.id}::text, ${entityMembership.personId}::text, ${entityMembership.userId})`,
      accountUserId: sql<
        string | null
      >`coalesce(${person.accountUserId}, ${entityMembership.userId})`,
      role: entityMembership.role,
      status: entityMembership.status,
      invitedRole: entityMembership.invitedRole,
      name: sql<string>`coalesce(${person.name}, ${user.name})`,
      email: sql<string | null>`coalesce(${person.email}, ${user.email})`,
      phone: sql<string | null>`coalesce(${person.phone}, ${user.phone})`,
      createdAt: entityMembership.createdAt,
    })
    .from(entityMembership)
    .leftJoin(person, eq(entityMembership.personId, person.id))
    .leftJoin(user, eq(entityMembership.userId, user.id))
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
  personId: string;
  userId: string;
  accountUserId: string | null;
  role: string;
  status: string;
  invitedRole: string | null;
} | null> {
  const rows = await exec
    .select({
      id: entityMembership.id,
      academyId: entityMembership.entityId,
      personId: sql<string>`coalesce(${person.id}::text, ${entityMembership.userId})`,
      userId: sql<string>`coalesce(${person.id}::text, ${entityMembership.personId}::text, ${entityMembership.userId})`,
      accountUserId: sql<
        string | null
      >`coalesce(${person.accountUserId}, ${entityMembership.userId})`,
      role: entityMembership.role,
      status: entityMembership.status,
      invitedRole: entityMembership.invitedRole,
    })
    .from(entityMembership)
    .leftJoin(person, eq(entityMembership.personId, person.id))
    .leftJoin(user, eq(entityMembership.userId, user.id))
    .where(eq(entityMembership.id, memberId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Write role and status for one person at one entity (ADR 124).
 *
 * `entity_membership` is the only record: the Better Auth mirror it used to
 * keep in step went with `member.status` and `member.invited_role` in the
 * contract migration. `member.role` is untouched here on purpose — the Better
 * Auth organization plugin owns it, and it says who runs the ORGANIZATION,
 * which is a different question from who runs one mat.
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

  const patch: { role?: string; status?: string; joinedAt?: Date } = {};
  if (role !== undefined) patch.role = role;
  if (status !== undefined) {
    patch.status = status;
    if (status === "active") patch.joinedAt = new Date();
  }
  if (Object.keys(patch).length === 0) return;

  await exec
    .update(entityMembership)
    .set(patch)
    .where(
      and(
        eq(entityMembership.id, input.memberId),
        eq(entityMembership.entityId, input.entityId),
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
 * A mat left with no active owner is the thing worth refusing.
 *
 * There is no second check at the organization any more, and that is a
 * decision, not an oversight. It existed because the Better Auth row mirrored
 * the entity role, so demoting someone at one mat also stripped the
 * organization role that was their way into the other. The mirror is gone with
 * the contract migration: `member.role` is now written only when Better Auth
 * creates the row, so no entity change can touch it and there is nothing left
 * to guard (ADR 124).
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
    })
    .from(entityMembership)
    .where(eq(entityMembership.entityId, entityId))
    .for("update");

  return canRemoveOrDemote(
    rows.flatMap((r) =>
      r.userId === null
        ? []
        : [{ id: r.userId, role: r.role, status: r.status }],
    ),
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
  // The organization row records that the person belongs to the gym at all, and
  // is reused untouched: it carries no status or intent any more, so there is
  // nothing about it a second link could change.
  await exec
    .insert(member)
    .values({
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      role: "member",
      createdAt: new Date(),
    })
    .onConflictDoNothing({
      target: [member.organizationId, member.userId],
    });

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
