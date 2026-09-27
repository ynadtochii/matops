import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { slugify } from "@matops/domain";

import type { DbExec } from "./client";
import type { DbWriter } from "./tenant";
import { generateAcademyCode } from "./academy-code";
import { organization } from "./auth-schema";
import { academyProfile, entity, entityMembership } from "./entity-schema";
import { ensureAccountPerson } from "./person";
import { classTemplate } from "./scheduling";

interface ProvisionResult {
  organizationId: string;
  entityId: string;
  /** Which steps this run had to make. Empty means nothing was missing. */
  created: string[];
}

interface EntityRows {
  organizationId: string;
  entityId: string;
  type: string;
  name: string;
  slug: string;
  publicCode: string;
  /** Omitted when the organization has no owner row yet; the place is still made. */
  ownerUserId?: string;
  timeZone?: string | null;
  country?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  isDefault?: boolean;
  membershipEnforcedAt?: Date | null;
}

/**
 * The rows a working place needs: the entity, an owner membership and its
 * academy profile.
 *
 * Every step is an `ON CONFLICT DO NOTHING` insert, so the whole thing is safe
 * to run again. Postgres already holds the uniqueness (the two primary keys and
 * `entity_membership_one_per_user`), so asking
 * in application code first would be slower and would still race.
 */
async function provisionEntityRows(
  input: EntityRows,
  exec: DbWriter,
): Promise<string[]> {
  const created: string[] = [];
  const mark = (step: string, made: unknown[]) => {
    if (made.length > 0) created.push(step);
  };

  mark(
    "entity",
    await exec
      .insert(entity)
      .values({
        id: input.entityId,
        organizationId: input.organizationId,
        type: input.type,
        name: input.name,
        slug: input.slug,
        isDefault: input.isDefault ?? false,
        timeZone: input.timeZone,
        country: input.country,
        address: input.address,
        mapUrl: input.mapUrl,
        publicCode: input.publicCode,
        membershipEnforcedAt: input.membershipEnforcedAt ?? null,
      })
      // Named target on purpose: the row carries three unique constraints, and
      // only the primary key means "already provisioned". A public-code or slug
      // collision has to raise rather than silently skip the entity and leave
      // the academy_profile insert to fail on a foreign key instead.
      .onConflictDoNothing({ target: entity.id })
      .returning({ id: entity.id }),
  );

  mark(
    "academy_profile",
    await exec
      .insert(academyProfile)
      .values({ entityId: input.entityId })
      .onConflictDoNothing()
      .returning({ id: academyProfile.entityId }),
  );

  if (input.ownerUserId) {
    const ownerPersonId = await ensureAccountPerson(
      exec,
      input.organizationId,
      input.ownerUserId,
    );
    mark(
      "entity_membership",
      await exec
        .insert(entityMembership)
        .values({
          organizationId: input.organizationId,
          entityId: input.entityId,
          userId: input.ownerUserId,
          personId: ownerPersonId,
          role: "owner",
          status: "active",
          joinedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: entityMembership.id }),
    );
  }

  return created;
}

export async function provisionOrganization(
  input: { organizationId: string; ownerUserId?: string },
  exec: DbExec,
): Promise<ProvisionResult> {
  const { organizationId, ownerUserId } = input;
  const rows = await exec
    .select({
      name: organization.name,
      slug: organization.slug,
    })
    .from(organization)
    .where(
      and(eq(organization.id, organizationId), isNull(organization.deletedAt)),
    )
    .limit(1);

  const org = rows[0];
  if (!org)
    throw new Error(`provision: no live organization ${organizationId}`);

  // A repair run must not mint a second code for a place that already has one.
  const existing = await exec
    .select({ code: entity.publicCode })
    .from(entity)
    .where(eq(entity.id, organizationId))
    .limit(1);

  const created = await provisionEntityRows(
    {
      ...org,
      organizationId,
      entityId: organizationId,
      type: "bjj_academy",
      publicCode: existing[0]?.code ?? (await generateAcademyCode(exec)),
      ownerUserId,
      isDefault: true,
      membershipEnforcedAt: null,
    },
    exec,
  );
  return { organizationId, entityId: organizationId, created };
}

/**
 * Copy the two things a new branch can usefully inherit: its recurring schedule
 * and the staff who run it (ADR 128).
 *
 * Nothing else is copied, and the list of what is left out is the point:
 * bookings, attendance, ranks, notes and payment history all belong
 * to the people at the branch they happened at, and a copy of them would be a
 * record of something that never took place.
 *
 * Templates arrive as a plan, not as a schedule: `generated_until` is left null
 * so the caller materializes them into the new branch's own classes.
 *
 * Students are not staff and are not copied. A person joins a branch, and
 * moving one silently would give them a place they never asked for.
 */
async function copyBranchSetup(
  input: {
    fromEntityId: string;
    toEntityId: string;
    organizationId: string;
  },
  exec: DbWriter,
): Promise<string[]> {
  const created: string[] = [];

  const templates = await exec
    .select()
    .from(classTemplate)
    .where(
      and(
        eq(classTemplate.academyId, input.fromEntityId),
        eq(classTemplate.status, "active"),
        isNull(classTemplate.deletedAt),
      ),
    );

  if (templates.length > 0) {
    await exec.insert(classTemplate).values(
      templates.map((t) => ({
        academyId: input.toEntityId,
        instructorId: t.instructorId,
        title: t.title,
        description: t.description,
        discipline: t.discipline,
        daysOfWeek: t.daysOfWeek,
        startsAtMinutes: t.startsAtMinutes,
        durationMinutes: t.durationMinutes,
        timeZone: t.timeZone,
        capacity: t.capacity,
        capacityPolicy: "soft",
      })),
    );
    created.push("class_template");
  }

  const staff = await exec
    .select({
      userId: entityMembership.userId,
      personId: entityMembership.personId,
      role: entityMembership.role,
    })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.entityId, input.fromEntityId),
        eq(entityMembership.status, "active"),
        inArray(entityMembership.role, ["owner", "instructor"]),
      ),
    );

  if (staff.length > 0) {
    const made = await exec
      .insert(entityMembership)
      .values(
        staff.map((m) => ({
          organizationId: input.organizationId,
          entityId: input.toEntityId,
          userId: m.userId,
          personId: m.personId,
          role: m.role,
          status: "active",
          joinedAt: new Date(),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: entityMembership.id });
    if (made.length > 0) created.push("staff");
  }

  return created;
}

/**
 * Add a branch to an organization, including its FIRST one (ADR 128).
 *
 * Registration writes no branch any more, so this is the only path that makes
 * one and it has to answer a question the old "second academy" version never
 * asked: is this the first? The answer decides two things that outlive it. The
 * first live branch is the organization's DEFAULT, which is a sort key and the
 * fallback several readers use. And it takes the organization's OWN id where
 * that id is free, because a QR poster, a check-in link or a seed script that
 * names the organization has to keep resolving (ADR 124 §1 called this
 * Decision 5).
 *
 * All of it runs in ONE transaction: the count, the id choice and every insert.
 * A branch made half way is worse than no branch, and two requests reading
 * "no branches yet" at the same moment would otherwise write two defaults.
 *
 * The caller has already checked the type is one we implement and that the
 * caller owns the organization.
 */
export async function createEntity(
  input: {
    organizationId: string;
    type: string;
    name: string;
    ownerUserId?: string;
    timeZone?: string | null;
    /**
     * Give the branch a known id instead of a random one. Only the seed passes
     * this, so its pilot gym is the same row on every run; nothing user-facing
     * chooses an id, because a guessable one is a worse id.
     */
    entityId?: string;
    /**
     * Take this branch's schedule and staff as a starting point. Owner-chosen
     * and always optional: an empty branch is the default (ADR 128).
     */
    copyFromEntityId?: string;
  },
  exec: DbExec,
): Promise<ProvisionResult> {
  return exec.transaction(async (tx) => {
    // Serialize on the organization row itself. Two people clicking "create
    // the first branch" at the same moment would otherwise both read zero
    // branches and both write a default; the partial unique index would then
    // refuse one of them with a constraint error instead of simply making it
    // the second branch. Locking here means the loser waits and reads one.
    const gym = await tx
      .select({ id: organization.id })
      .from(organization)
      .where(
        and(
          eq(organization.id, input.organizationId),
          isNull(organization.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!gym[0]) {
      throw new Error(
        `provision: no live organization ${input.organizationId}`,
      );
    }

    const live = await tx
      .select({ id: entity.id })
      .from(entity)
      .where(
        and(
          eq(entity.organizationId, input.organizationId),
          isNull(entity.deletedAt),
        ),
      )
      .limit(1);
    const first = live.length === 0;

    // The organization id is only free for the first branch, and only when
    // nothing already holds it: a branch soft-deleted earlier still owns the
    // row, so a second attempt has to take a fresh id rather than collide.
    const taken = first
      ? await tx
          .select({ id: entity.id })
          .from(entity)
          .where(eq(entity.id, input.organizationId))
          .limit(1)
      : [];
    const entityId =
      input.entityId ??
      (first && taken.length === 0 ? input.organizationId : randomUUID());
    const slug = `${slugify(input.name)}-${entityId.slice(0, 6)}`;
    const created = await provisionEntityRows(
      {
        organizationId: input.organizationId,
        entityId,
        type: input.type,
        name: input.name,
        slug,
        publicCode: await generateAcademyCode(tx),
        ownerUserId: input.ownerUserId,
        timeZone: input.timeZone,
        isDefault: first,
      },
      tx,
    );

    if (input.copyFromEntityId && created.includes("entity")) {
      created.push(
        ...(await copyBranchSetup(
          {
            fromEntityId: input.copyFromEntityId,
            toEntityId: entityId,
            organizationId: input.organizationId,
          },
          tx,
        )),
      );
    }

    return { organizationId: input.organizationId, entityId, created };
  });
}
