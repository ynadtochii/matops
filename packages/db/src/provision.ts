import { randomUUID } from "node:crypto";
import { and, eq, isNull, notExists } from "drizzle-orm";

import { slugify } from "@matops/domain";

import type { DbExec } from "./client";
import type { DbReader } from "./tenant";
import { generateAcademyCode } from "./academy-code";
import { member, organization } from "./auth-schema";
import { DEFAULT_TRACK_NAME } from "./curriculum";
import { curriculumTrack } from "./curriculum-schema";
import { academyProfile, entity, entityMembership } from "./entity-schema";

export interface ProvisionResult {
  organizationId: string;
  entityId: string;
  /** Which steps this run had to make. Empty means nothing was missing. */
  created: string[];
}

export interface EntityRows {
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
  curriculumForStudents?: boolean;
  publicBookingEnabled?: boolean;
  publicApiKey?: string | null;
  publicApiOrigins?: string[] | null;
}

/**
 * The four rows a working place needs: the entity, its academy profile, an
 * owner membership, and a curriculum track to place a block on.
 *
 * Every step is an `ON CONFLICT DO NOTHING` insert, so the whole thing is safe
 * to run again. Postgres already holds the uniqueness (the two primary keys,
 * `entity_membership_one_per_user`, `curriculum_track_one_default`), so asking
 * in application code first would be slower and would still race.
 */
async function provisionEntityRows(
  input: EntityRows,
  exec: DbExec,
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
      .values({
        entityId: input.entityId,
        curriculumForStudents: input.curriculumForStudents ?? false,
        publicBookingEnabled: input.publicBookingEnabled ?? false,
        publicApiKey: input.publicApiKey,
        publicApiOrigins: input.publicApiOrigins,
      })
      .onConflictDoNothing()
      .returning({ id: academyProfile.entityId }),
  );

  if (input.ownerUserId) {
    mark(
      "entity_membership",
      await exec
        .insert(entityMembership)
        .values({
          organizationId: input.organizationId,
          entityId: input.entityId,
          userId: input.ownerUserId,
          role: "owner",
          status: "active",
          joinedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: entityMembership.id }),
    );
  }

  mark(
    "curriculum_track",
    await exec
      .insert(curriculumTrack)
      .values({
        academyId: input.entityId,
        name: DEFAULT_TRACK_NAME,
        isDefault: true,
      })
      .onConflictDoNothing()
      .returning({ id: curriculumTrack.id }),
  );

  return created;
}

/**
 * Give an organization the rows a working gym needs, and repair a partial one.
 *
 * Better Auth can create an `organization` row and then fail before our own
 * setup finishes, which would leave an owner signed in to a gym with no place
 * to run classes. Calling this again creates nothing and reports an empty
 * `created`.
 *
 * The default entity takes the organization's OWN id (Decision 5), so a QR
 * poster or check-in link that names the organization still resolves. Its
 * six-digit code is minted here: the code lives on the entity now, because a
 * gym's second academy needs one of its own. Runs on the base connection,
 * beside the other creation writes.
 */
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
    },
    exec,
  );
  return { organizationId, entityId: organizationId, created };
}

/**
 * Add a second place to an organization that already has one.
 *
 * Unlike the default entity it gets its own id, slug and public code, so the
 * two academies share an owner and nothing else: separate schedule, separate
 * roster, separate booking link. The caller has already checked the type is one
 * we implement and that the caller owns the organization.
 */
export async function createEntity(
  input: {
    organizationId: string;
    type: string;
    name: string;
    ownerUserId?: string;
    timeZone?: string | null;
  },
  exec: DbExec,
): Promise<ProvisionResult> {
  const entityId = randomUUID();
  const slug = `${slugify(input.name)}-${entityId.slice(0, 6)}`;
  const created = await provisionEntityRows(
    {
      organizationId: input.organizationId,
      entityId,
      type: input.type,
      name: input.name,
      slug,
      publicCode: await generateAcademyCode(exec),
      ownerUserId: input.ownerUserId,
      timeZone: input.timeZone,
    },
    exec,
  );
  return { organizationId: input.organizationId, entityId, created };
}

/**
 * The organizations this person OWNS that hold no live entity.
 *
 * Better Auth can write the `organization` row and then die before our own rows
 * land, which strands the owner: they are signed in to a gym with no place to
 * run classes, and "Start a gym" would only make a second organization. The
 * post-login gate reads this and re-runs {@link provisionOrganization}, which
 * is idempotent, so a repair costs nothing when nothing is missing.
 */
export async function organizationsMissingEntity(
  userId: string,
  exec: DbReader,
): Promise<string[]> {
  const rows = await exec
    .select({ id: organization.id })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        eq(member.userId, userId),
        eq(member.role, "owner"),
        isNull(organization.deletedAt),
        notExists(
          exec
            .select({ id: entity.id })
            .from(entity)
            .where(
              and(
                eq(entity.organizationId, organization.id),
                isNull(entity.deletedAt),
              ),
            ),
        ),
      ),
    );
  return rows.map((r) => r.id);
}
