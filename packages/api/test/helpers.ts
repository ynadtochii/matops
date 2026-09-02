import { PGlite } from "@electric-sql/pglite";
import { TRPCError } from "@trpc/server";

import type { DbExec } from "@matops/db/client";
import { eq, provisionOrganization } from "@matops/db";
import { entity, entityMembership, member, organization } from "@matops/db/schema";
import { execOn, freshDb } from "@matops/db/testing";

import type { createTRPCContext } from "../src/trpc";
import { appRouter } from "../src/root";

export type Ctx = Awaited<ReturnType<typeof createTRPCContext>>;

export interface Harness {
  pg: PGlite;
  exec: DbExec;
  close: () => Promise<void>;
  as: (
    userId: string,
    academyId: string | null,
    headers?: Headers,
  ) => ReturnType<typeof caller>;
  ctxFor: (userId: string, academyId: string | null, headers?: Headers) => Ctx;
  /** What `setActiveOrganization` was last told, per user. */
  activeOrgOf: (userId: string) => string | undefined;
}

function caller(ctx: Ctx) {
  return appRouter.createCaller(ctx);
}

/**
 * Every tenant tier reads `x-matops-entity`, and in these fixtures the academy
 * IS the organization's default entity, so a caller that does not care names
 * it by default. Pass a bare `new Headers()` to make a request that names no
 * entity, which is what the refusal tests are about.
 */
function entityHeaders(academyId: string | null): Headers {
  const headers = new Headers();
  if (academyId) headers.set("x-matops-entity", academyId);
  return headers;
}

/**
 * The four Better Auth calls the routers make, over PGlite. This stands in for
 * the organization plugin, so it must reproduce what the plugin does or the
 * tests would be testing the stand-in: an organization row plus an owner
 * `member` row. The six-digit code and the default academy come from
 * `provisionOrganization`, which the routers call themselves.
 *
 * Anything not implemented here still throws, so a router reaching for an
 * untested Better Auth call fails loudly instead of silently doing nothing.
 */
function fakeAuthApi(
  userId: string,
  exec: DbExec,
  activeOrg: Map<string, string>,
) {
  const impl: Record<string, (arg: never) => Promise<unknown>> = {
    createOrganization: async (arg: {
      body: { name: string; slug: string };
    }) => {
      const id = `org_${arg.body.slug}`;
      await exec.insert(organization).values({
        id,
        name: arg.body.name,
        slug: arg.body.slug,
        createdAt: new Date(),
      });
      await exec.insert(member).values({
        id: `mem_${id}_${userId}`,
        organizationId: id,
        userId,
        role: "owner",
        createdAt: new Date(),
      });
      activeOrg.set(userId, id);
      return { id, name: arg.body.name, slug: arg.body.slug };
    },
    updateOrganization: async (arg: {
      body: { organizationId: string; data: { name?: string } };
    }) => {
      if (arg.body.data.name !== undefined) {
        await exec
          .update(organization)
          .set({ name: arg.body.data.name })
          .where(eq(organization.id, arg.body.organizationId));
      }
      return { id: arg.body.organizationId };
    },
    setActiveOrganization: (arg: { body: { organizationId: string } }) => {
      activeOrg.set(userId, arg.body.organizationId);
      return Promise.resolve({ id: arg.body.organizationId });
    },
    getSession: () => Promise.resolve(null),
  };

  return new Proxy(impl, {
    get(target, key) {
      const fn = target[String(key)];
      if (fn) return fn;
      return () => {
        throw new Error(
          `ctx.authApi.${String(key)}() is not wired in router tests`,
        );
      };
    },
  });
}

/**
 * A seeded database, snapshotted once per test file.
 *
 * `seedAcademies` costs about 270ms, nearly all of it in one multi-statement
 * `pg.exec`, and the files that rebuild a harness per test paid it 20-odd times
 * each. Passing the spec to `harness` instead seeds once, dumps the result, and
 * loads that dump for every later call — so the saving of seeding in a
 * `beforeAll` is had without giving up the fresh database each test starts
 * from. Vitest runs each file in its own worker, so this cache is per file.
 */
const snapshots = new Map<string, Blob>();

export async function harness(academies?: AcademySpec[]): Promise<Harness> {
  // No default academies: `seedAcademies` builds its own organizations and
  // provisions their entities, so pre-made ones would collide on the id.
  const key = academies ? JSON.stringify(academies) : "";
  const cached = key ? snapshots.get(key) : undefined;
  const pg = cached ? new PGlite({ loadDataDir: cached }) : await freshDb([]);
  if (academies && !cached) {
    await seedAcademies(pg, academies);
    snapshots.set(key, await pg.dumpDataDir("gzip"));
  }
  const exec = execOn(pg);

  const activeOrg = new Map<string, string>();

  const ctxFor = (
    userId: string,
    academyId: string | null,
    headers = entityHeaders(academyId),
  ): Ctx => ({
    authApi: fakeAuthApi(userId, exec, activeOrg) as unknown as Ctx["authApi"],
    headers,
    session: {
      user: { id: userId, name: `User ${userId}` },
      session: { activeOrganizationId: academyId },
    } as unknown as Ctx["session"],
    requestedEntityId: headers.get("x-matops-entity") ?? undefined,
    baseDb: exec,
  });

  return {
    pg,
    exec,
    close: () => pg.close(),
    as: (userId, academyId, headers) =>
      caller(ctxFor(userId, academyId, headers)),
    ctxFor,
    activeOrgOf: (userId) => activeOrg.get(userId),
  };
}

/**
 * The tRPC error code a call rejects with, or a readable marker when it does
 * not. Asserting the CODE keeps a permission test tied to the contract rather
 * than to the wording of a message, which is user-facing copy and free to change.
 */
export async function rejectionCode(
  promise: Promise<unknown>,
): Promise<string> {
  try {
    await promise;
    return "resolved without error";
  } catch (err) {
    return err instanceof TRPCError
      ? err.code
      : `non-tRPC error: ${String(err)}`;
  }
}

function lit(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export interface MemberSpec {
  userId: string;
  role: "owner" | "instructor" | "student" | "member";
  status: "pending" | "active" | "suspended" | "removed" | "archived";
  name?: string;
  invitedRole?: string;
}

export interface AcademySpec {
  id: string;
  code: string;
  members: MemberSpec[];
}

/** The `entity_membership.id` every product row keys on (ADR 124). */
export function memberId(academyId: string, userId: string): string {
  return `emem_${academyId}_${userId}`;
}

function orgMemberId(academyId: string, userId: string): string {
  return `mem_${academyId}_${userId}`;
}

export async function seedAcademies(
  pg: PGlite,
  academies: AcademySpec[],
): Promise<void> {
  const seen = new Set<string>();
  const users: string[] = [];
  const orgs: string[] = [];
  const members: string[] = [];

  for (const academy of academies) {
    orgs.push(
      `(${lit(academy.id)}, ${lit(`Academy ${academy.id}`)}, ${lit(`slug-${academy.id}`)}, now())`,
    );
    for (const m of academy.members) {
      if (!seen.has(m.userId)) {
        seen.add(m.userId);
        users.push(
          `(${lit(m.userId)}, ${lit(m.name ?? `User ${m.userId}`)}, ${lit(`${m.userId}@test.local`)}, true, now(), now())`,
        );
      }
      members.push(
        `(${lit(orgMemberId(academy.id, m.userId))}, ${lit(academy.id)}, ${lit(m.userId)}, ${lit(m.role)}, now())`,
      );
    }
  }

  const statements: string[] = [];
  if (users.length)
    statements.push(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ${users.join(",")};`,
    );
  if (orgs.length)
    statements.push(
      `INSERT INTO "organization" (id, name, slug, created_at)
         VALUES ${orgs.join(",")};`,
    );
  if (members.length)
    statements.push(
      `INSERT INTO "member" (id, organization_id, user_id, role, created_at)
         VALUES ${members.join(",")};`,
    );
  if (statements.length) await pg.exec(statements.join("\n"));

  // Give each academy the rows production gives it: the default entity (whose id
  // is the organization id), its academy profile and a curriculum track. Uses
  // the REAL provisioner, so a fixture cannot drift from what `academy.create`
  // actually builds (ADR 124). The memberships are written here instead, with
  // predictable ids, because dues, ranks, notes and referrals key on them and a
  // test has to be able to name one.
  const exec = execOn(pg);
  for (const academy of academies) {
    await provisionOrganization({ organizationId: academy.id }, exec);
    // The provisioner mints a code; the spec names one so a test can type it.
    await exec
      .update(entity)
      .set({ publicCode: academy.code })
      .where(eq(entity.id, academy.id));
    if (!academy.members.length) continue;
    await exec
      .insert(entityMembership)
      .values(
        academy.members.map((m) => ({
          id: memberId(academy.id, m.userId),
          organizationId: academy.id,
          entityId: academy.id,
          userId: m.userId,
          role: m.role,
          status: m.status,
          invitedRole: m.invitedRole ?? null,
          joinedAt: m.status === "active" ? new Date() : null,
        })),
      )
      .onConflictDoNothing();
  }
}

export interface ClassSpec {
  id: string;
  academyId: string;
  instructorId: string;
  title?: string;
  startsInMinutes: number;
  durationMinutes?: number;
  capacity?: number;
  status?: "scheduled" | "cancelled";
  publicBookable?: boolean;
}

export async function seedClasses(
  pg: PGlite,
  classes: ClassSpec[],
): Promise<void> {
  const values = classes.map(
    (c) =>
      `(${lit(c.id)}, ${lit(c.academyId)}, ${lit(c.instructorId)}, ${lit(c.title ?? "Gi Fundamentals")}, now() + interval '${c.startsInMinutes} minutes', ${c.durationMinutes ?? 60}, ${c.capacity ?? 20}, ${lit(c.status ?? "scheduled")}, ${c.publicBookable ?? false}, now(), now())`,
  );
  await pg.exec(`
    INSERT INTO "class" (id, academy_id, instructor_id, title, starts_at, duration_minutes, capacity, status, public_bookable, created_at, updated_at)
      VALUES ${values.join(",")};
  `);
}

export interface ParticipationSpec {
  classId: string;
  academyId: string;
  studentId: string;
  attendanceStatus?: "unmarked" | "present" | "absent";
  bookingStatus?: "booked" | "cancelled" | "none";
  bookingTier?: "confirmed" | "provisional";
}

export async function seedParticipations(
  pg: PGlite,
  rows: ParticipationSpec[],
): Promise<void> {
  const values = rows.map(
    (r) =>
      `(gen_random_uuid(), ${lit(r.academyId)}, ${lit(r.classId)}, ${lit(r.studentId)}, ${lit(r.bookingStatus ?? "booked")}, ${lit(r.bookingTier ?? "confirmed")}, ${lit(r.attendanceStatus ?? "unmarked")}, now(), now(), now())`,
  );
  await pg.exec(`
    INSERT INTO "class_participation" (id, academy_id, class_id, student_id, booking_status, booking_tier, attendance_status, booked_at, created_at, updated_at)
      VALUES ${values.join(",")};
  `);
}

export async function storedBookingCount(
  pg: PGlite,
  classId: string,
): Promise<number> {
  const res = await pg.query<{ n: number }>(
    `SELECT booking_count AS n FROM "class" WHERE id = $1`,
    [classId],
  );
  return res.rows[0]?.n ?? -1;
}

export async function confirmedBookings(
  pg: PGlite,
  classId: string,
): Promise<number> {
  const res = await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "class_participation"
      WHERE class_id = $1 AND booking_status = 'booked' AND booking_tier = 'confirmed'`,
    [classId],
  );
  return res.rows[0]?.n ?? -1;
}
