/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1)
 * 2. You want to create a new middleware or type of procedure (see Part 3)
 *
 * tl;dr - this is where all the tRPC server stuff is created and plugged in.
 * The pieces you will need to use are documented accordingly near the end
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod/v4";

import type { Auth } from "@matops/auth";
import type { DbReader, TenantTx } from "@matops/db";
import type { DbExec } from "@matops/db/client";
import type { Membership } from "@matops/domain";
import {
  eq,
  getEntityInOrganization,
  getEntityMembership,
  getMembership,
  withScope,
} from "@matops/db";
import { db } from "@matops/db/client";
import { organization } from "@matops/db/schema";
import {
  canEnroll,
  isActiveMember,
  isBjjAcademy,
  isManager,
  isOwner,
  isStaff,
  isSuspended,
  runsBranch,
  runsOrganization,
} from "@matops/domain";

import { clientIp, take } from "./rate-limit";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */

export const createTRPCContext = async (opts: {
  headers: Headers;
  auth: Auth;
  /**
   * The base (non-RLS) connection. The ONE injection point the router tests use:
   * they pass a PGlite-backed handle, so the whole seam (`withScope`, the
   * membership lookup, every `member`-table helper) runs its REAL query against
   * an ephemeral Postgres instead of a hand-written double. Production passes
   * nothing and gets the singleton pool. See docs/issues/60.
   */
  baseDb?: DbExec;
}) => {
  const authApi = opts.auth.api;
  const session = await authApi.getSession({
    headers: opts.headers,
  });
  // The client names the entity it is acting in on every request (ADR 124 §2).
  // Web sets it from the `[entityId]` route segment, mobile from the entity the
  // student picked. It is a REQUEST, not a fact: the entity procedure checks the
  // caller may use it and fails closed when it is missing or foreign.
  const requestedEntityId = opts.headers.get("x-matops-entity") ?? undefined;
  return {
    authApi,
    session,
    requestedEntityId,
    // Two db handles, two jobs. `ctx.db` (added by `enforceEntity` below) is the
    // RLS-scoped transaction and is the ONLY handle that may touch a tenant
    // table: a resolver on a non-tenant procedure has no `ctx.db` at all and
    // fails at typecheck if it reaches for one. `ctx.baseDb` is the base
    // connection, and exists solely for the Better Auth identity tables
    // (`member`, `user`, `organization`), which carry no RLS policy and so can
    // never be read through the tenant transaction. Migration 0020 revokes
    // matops_app's write access to those tables, and a lint rule blocks routers
    // from importing the raw `db` directly, so `ctx.baseDb` stays the only door.
    // See docs/issues/33, 60 and docs/architecture.md §5.
    baseDb: opts.baseDb ?? db,
    // Forwarded so resolvers can call Better Auth server APIs (createOrganization,
    // setActiveOrganization, …) on behalf of the signed-in user.
    headers: opts.headers,
  };
};

/**
 * Re-read the session from Postgres and re-sign it into the session cookie.
 *
 * ADR 81 caches the session + user rows in a signed cookie for five minutes, and
 * Better Auth answers `getSession` from that cookie without touching the
 * database. So any write that changes the `user` or `session` row behind Better
 * Auth's back stays invisible until the cookie expires: `updateUserProfile`
 * writes the row directly, and `createOrganization` sets
 * `activeOrganizationId` on the session row but never re-signs the cookie (only
 * `/organization/set-active` does). `disableCookieCache` forces the database
 * read, and Better Auth rewrites the cookie with the fresh copy.
 *
 * Call it after such a write, from a mutation. It only takes effect inside the
 * route handler, which is where `nextCookies()` can apply the `Set-Cookie`.
 */
export async function refreshSessionCookie(
  ctx: Pick<
    Awaited<ReturnType<typeof createTRPCContext>>,
    "authApi" | "headers"
  >,
) {
  await ctx.authApi.getSession({
    headers: ctx.headers,
    query: { disableCookieCache: true },
  });
}

/**
 * 2. INITIALIZATION
 *
 * This is where the trpc api is initialized, connecting the context and
 * transformer
 */
export const GENERIC_ERROR = "Something went wrong. Try again.";

// An uncaught throw reaches the client with the driver's own words, which for a
// Postgres error name the table, the column and the constraint. tRPC drops
// `stack` outside dev but never touches `message`.
export function publicErrorMessage(code: string, message: string): string {
  return code === "INTERNAL_SERVER_ERROR" &&
    process.env.NODE_ENV === "production"
    ? GENERIC_ERROR
    : message;
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    message: publicErrorMessage(error.code, shape.message),
    data: {
      ...shape.data,
      zodError:
        error.cause instanceof ZodError
          ? z.flattenError(error.cause as ZodError<Record<string, unknown>>)
          : null,
    },
  }),
});

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these
 * a lot in the /src/server/api/routers folder
 */

/**
 * This is how you create new routers and subrouters in your tRPC API
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/** Logs how long each procedure took, to the server console. */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Cap an unauthenticated procedure per caller IP. The join QR is on a public
 * wall, so anything behind it can be flooded from one laptop: the drop-in form
 * fills the lead table, and magic-link send burns the shared Resend quota.
 */
export function rateLimited(max: number, windowMs: number) {
  return t.middleware(({ ctx, path, next }) => {
    // A procedure with its own cap runs this middleware twice, once for the
    // default below and once for its own. Sharing one counter would trip the
    // tighter cap early, so the limit is part of the key.
    const key = `${path}:${max}:${windowMs}:${clientIp(ctx.headers)}`;
    if (!take(key, max, windowMs)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Wait a minute and try again.",
      });
    }
    return next();
  });
}

/**
 * Generous on purpose: a gym's students share one wifi address, so the whole
 * room is one caller here.
 */
export const PUBLIC_DEFAULT_MAX = 120;
const PUBLIC_DEFAULT_WINDOW_MS = 60_000;

/**
 * Public (unauthed) procedure
 *
 * This is the base piece you use to build new queries and mutations on your
 * tRPC API. It does not guarantee that a user querying is authorized, but you
 * can still access user session data if they are logged in
 */
export const publicProcedure = t.procedure
  .use(timingMiddleware)
  .use(rateLimited(PUBLIC_DEFAULT_MAX, PUBLIC_DEFAULT_WINDOW_MS));

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * ORGANIZATION scope (ADR 124). The caller, their live Better Auth membership,
 * and nothing about a place. Resolved before any transaction opens.
 */
async function resolveOrganization<U extends { id: string }>(ctx: {
  session?: {
    user?: U | null;
    session: { activeOrganizationId?: string | null };
  } | null;
  baseDb: DbExec;
}) {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const organizationId = ctx.session.session.activeOrganizationId;
  if (!organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No active organization selected",
    });
  }
  const user = ctx.session.user;
  const orgMembership = await getMembership(
    user.id,
    organizationId,
    ctx.baseDb,
  );
  if (!orgMembership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this organization",
    });
  }
  return { organizationId, orgMembership, user };
}

/** The caller's standing at the entity this request named. */
interface EntityMembershipContext {
  personId: string | null;
  role: string;
  status: string;
  joinedAt: Date;
  /** `entity_membership.id`, or null for an owner who holds no membership here. */
  memberId: string | null;
}

/**
 * ENTITY scope (ADR 124 §2). Starts from an authorized organization, then reads
 * the entity the CLIENT named in `x-matops-entity`. The session never selects
 * it, which is what lets two browser tabs show two places.
 *
 * Fails closed, and does so BEFORE a transaction opens: a missing header is a
 * `BAD_REQUEST` (the client is broken), a foreign or unknown entity is a
 * `FORBIDDEN`. An entity of another organization reads as null and gets the
 * same answer as one that does not exist, so this cannot enumerate other
 * people's gyms.
 *
 * An active organization owner or manager reaches every entity of the
 * organization (ADR 129). Anyone else needs a live `entity_membership`.
 */
async function resolveEntity<U extends { id: string }>(ctx: {
  session?: {
    user?: U | null;
    session: { activeOrganizationId?: string | null };
  } | null;
  requestedEntityId?: string;
  baseDb: DbExec;
}) {
  const { organizationId, orgMembership, user } =
    await resolveOrganization(ctx);
  const entityId = ctx.requestedEntityId;
  if (!entityId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No entity named. Send the x-matops-entity header.",
    });
  }
  const entity = await getEntityInOrganization(
    entityId,
    organizationId,
    ctx.baseDb,
  );
  if (!entity) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot use this entity",
    });
  }

  const entityMembership = await getEntityMembership(
    user.id,
    entityId,
    ctx.baseDb,
  );
  // What running the gym is worth at a branch (ADR 129). An owner reads
  // "owner"; a manager reads "manager" and never "owner", because the four
  // protected actions are told apart by exactly that word.
  const organizationRole = isOwner(orgMembership)
    ? "owner"
    : isManager(orgMembership)
      ? "manager"
      : null;

  if (!entityMembership && !organizationRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot use this entity",
    });
  }

  // Running the organization wins (ADR 124 §2, amended by the v7.2 review and
  // by ADR 129): it reaches every entity, including one where a co-owner
  // archived or suspended the entity membership, which they would otherwise
  // have no way to undo. A branch owner stays an owner even when the caller
  // only manages the organization. `memberId` is null when there is no entity
  // membership at all, because every dues, rank, note and referral row keys on
  // `entity_membership.id` and the Better Auth member id is a different id
  // space — so a manager with no row here cannot book as a student, and this
  // never enrols them as one.
  const membership: EntityMembershipContext = entityMembership
    ? {
        memberId: entityMembership.id,
        personId: entityMembership.personId,
        joinedAt: entityMembership.joinedAt ?? entityMembership.createdAt,
        role:
          entityMembership.role === "owner"
            ? "owner"
            : (organizationRole ?? entityMembership.role),
        status: organizationRole ? "active" : entityMembership.status,
      }
    : {
        memberId: null,
        personId: null,
        joinedAt: orgMembership.joinedAt,
        role: organizationRole ?? "student",
        status: "active",
      };

  if (!canEnroll(membership)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: isSuspended(membership)
        ? "Your membership is suspended — contact your gym to restore access."
        : "Your access to this academy has been removed",
    });
  }

  return { organizationId, entity, membership, entityMembership, user };
}

/** Run the resolver inside a scoped transaction, deferring the after-commit work. */
async function runScoped<T>(
  baseDb: DbExec,
  scope: { organizationId: string; entityId?: string },
  body: (
    tx: TenantTx,
    afterCommit: (task: (exec: DbExec) => Promise<void>) => void,
  ) => Promise<T>,
): Promise<T> {
  const tasks: ((exec: DbExec) => Promise<void>)[] = [];
  const result = await withScope(
    scope,
    (tx) =>
      body(tx, (task) => {
        tasks.push(task);
      }),
    baseDb,
  );
  for (const task of tasks) await task(baseDb);
  return result;
}

const enforceOrganization = t.middleware(async ({ ctx, next }) => {
  const { organizationId, orgMembership, user } =
    await resolveOrganization(ctx);
  const baseDb = ctx.baseDb;
  return runScoped(baseDb, { organizationId }, async (tx, afterCommit) => {
    const attempt = await next({
      ctx: {
        db: tx,
        organizationId,
        orgMembership,
        baseDb: undefined,
        afterCommit,
        session: { ...ctx.session, user },
      },
    });
    if (!attempt.ok) throw attempt.error;
    return attempt;
  });
});

const enforceEntity = t.middleware(async ({ ctx, next }) => {
  const { organizationId, entity, membership, entityMembership, user } =
    await resolveEntity(ctx);
  const baseDb = ctx.baseDb;
  return runScoped(
    baseDb,
    { organizationId, entityId: entity.id },
    async (tx, afterCommit) => {
      const attempt = await next({
        ctx: {
          db: tx,
          organizationId,
          entityId: entity.id,
          entity,
          academyId: entity.id,
          membership,
          entityMembership,
          baseDb: undefined,
          afterCommit,
          session: { ...ctx.session, user },
        },
      });
      if (!attempt.ok) throw attempt.error;
      return attempt;
    },
  );
});

/** Any live member of the organization. Sees the overview, never entity rows. */
export const organizationMemberProcedure = t.procedure
  .use(timingMiddleware)
  .use(enforceOrganization);

/**
 * Somebody who RUNS the gym: an owner, or a manager (spec FP7, ADR 128).
 *
 * The tier for the gym's daily work, reading its people, plans, payments,
 * staff and reports, and the ordinary writes that go with them. Owner-only
 * actions keep `organizationOwnerIdentityProcedure`, and that difference is the
 * whole permission model: it is spelled in the tier, not in a check somebody
 * has to remember at the top of a resolver.
 */
export const organizationManagerProcedure = organizationMemberProcedure.use(
  ({ ctx, next }) => {
    if (!runsOrganization(ctx.orgMembership)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Owners and managers only",
      });
    }
    return next();
  },
);

/**
 * The tenant tiers. Every one of them runs at ONE entity, the one the request
 * named in `x-matops-entity`, inside `withScope({ organizationId, entityId })`.
 * So `ctx.db` is the scoped transaction and Postgres filters every query to
 * that entity even if a `where` is forgotten (ADR 124, docs/issues/12, 20, 23).
 *
 */
export const enrolledProcedure = t.procedure
  .use(timingMiddleware)
  .use(enforceEntity);

/** Member — an APPROVED (active) member of the entity. */
export const memberProcedure = enrolledProcedure.use(({ ctx, next }) => {
  if (!isActiveMember(ctx.membership)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your membership is pending approval",
    });
  }
  return next();
});

/** Staff — active owner OR instructor: runs the schedule and attendance. */
export const staffProcedure = memberProcedure.use(({ ctx, next }) => {
  if (!isStaff(ctx.membership)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff only" });
  }
  return next();
});

/**
 * Runs this branch: an active owner, or a manager of the gym (ADR 129).
 *
 * The branch tier for the ordinary work — local members and their approvals,
 * leads, plans, dues, claims, instructor assignment and ordinary branch
 * settings. Spelled in the tier so a resolver never has to remember it.
 */
export const branchManagerProcedure = memberProcedure.use(({ ctx, next }) => {
  if (!runsBranch(ctx.membership)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Owners and managers only",
    });
  }
  return next();
});

/**
 * The BJJ-only tiers. Belts, promotions and the curriculum belong to a mat, so
 * a general space is refused them by the server, not by a hidden nav item
 * (ADR 126). The check runs after the entity is resolved, so it names the place
 * the request asked for and never the one a session happened to hold.
 */
const BJJ_ONLY = "Not a BJJ academy";

export const bjjEnrolledProcedure = enrolledProcedure.use(({ ctx, next }) => {
  if (!isBjjAcademy(ctx.entity.type)) {
    throw new TRPCError({ code: "FORBIDDEN", message: BJJ_ONLY });
  }
  return next();
});

export const bjjStaffProcedure = staffProcedure.use(({ ctx, next }) => {
  if (!isBjjAcademy(ctx.entity.type)) {
    throw new TRPCError({ code: "FORBIDDEN", message: BJJ_ONLY });
  }
  return next();
});

const MODULE_DISABLED = "This module is not enabled for this gym";

async function requireOrganizationModule(
  database: DbReader,
  organizationId: string,
  module: "curriculum" | "referrals",
) {
  const [row] = await database
    .select({
      enabled:
        module === "curriculum"
          ? organization.curriculumEnabled
          : organization.referralsEnabled,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!row?.enabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: MODULE_DISABLED });
  }
}

export const curriculumEnrolledProcedure = bjjEnrolledProcedure.use(
  async ({ ctx, next }) => {
    await requireOrganizationModule(ctx.db, ctx.organizationId, "curriculum");
    return next();
  },
);

export const curriculumStaffProcedure = bjjStaffProcedure.use(
  async ({ ctx, next }) => {
    await requireOrganizationModule(ctx.db, ctx.organizationId, "curriculum");
    return next();
  },
);

export const referralsBranchManagerProcedure = branchManagerProcedure.use(
  async ({ ctx, next }) => {
    await requireOrganizationModule(ctx.db, ctx.organizationId, "referrals");
    return next();
  },
);

/**
 * Identity procedures: same authorization as the tenant tiers, but NO ambient
 * transaction. They exist for the writes that touch `organization` or `member`
 * (ADR 68, 84). Those tables carry no RLS policy and migration `0020` revoked
 * `matops_app`'s write access, so the write must run on the base connection —
 * and doing that from inside `withScope` checks out a SECOND pool connection
 * and holds both (ADR 66), which deadlocks outright on a single-connection
 * PGlite. `ctx.withScope(fn)` lets a resolver that also touches tenant tables
 * open the scoped transaction around just that part, so the ORDER of the two
 * writes stays with the resolver, the only thing that knows which order is
 * recoverable.
 */
function identityProcedure(allow: (m: Membership) => boolean, denial: string) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const { organizationId, entity, membership, entityMembership } =
      await resolveEntity(ctx);
    if (!isActiveMember(membership) || !allow(membership)) {
      throw new TRPCError({ code: "FORBIDDEN", message: denial });
    }
    const baseDb = ctx.baseDb;
    return next({
      ctx: {
        organizationId,
        entityId: entity.id,
        entity,
        academyId: entity.id,
        membership,
        entityMembership,
        withScope: <T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> =>
          withScope({ organizationId, entityId: entity.id }, fn, baseDb),
      },
    });
  });
}

/**
 * Organization owner, with NO ambient transaction (ADR 92, applied to the new
 * scope). Adding an entity writes `academy_profile` and `curriculum_track`,
 * whose policies match on `app.academy_id` — and an organization transaction
 * leaves that unset on purpose, so those inserts would be refused by the very
 * rule that keeps entities apart. The write belongs on the base connection.
 */
export const organizationOwnerIdentityProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const { organizationId, orgMembership, user } =
      await resolveOrganization(ctx);
    if (!isActiveMember(orgMembership) || !isOwner(orgMembership)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Owner only" });
    }
    return next({
      ctx: { organizationId, orgMembership, session: { ...ctx.session, user } },
    });
  },
);

/**
 * The same owner-or-manager rule, with NO ambient transaction, for the reads
 * that open one entity scope each (ADR 92, ADR 124).
 */
export const organizationManagerIdentityProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const { organizationId, orgMembership, user } =
      await resolveOrganization(ctx);
    if (!runsOrganization(orgMembership)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Owners and managers only",
      });
    }
    return next({
      ctx: { organizationId, orgMembership, session: { ...ctx.session, user } },
    });
  },
);

export const organizationMemberIdentityProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const { organizationId, orgMembership, user } =
      await resolveOrganization(ctx);
    return next({
      ctx: {
        organizationId,
        orgMembership,
        baseDb: ctx.baseDb,
        session: { ...ctx.session, user },
      },
    });
  },
);

export const staffIdentityProcedure = identityProcedure(isStaff, "Staff only");
export const ownerIdentityProcedure = identityProcedure(isOwner, "Owner only");
export const branchManagerIdentityProcedure = identityProcedure(
  runsBranch,
  "Owners and managers only",
);
