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
import type { DbExec } from "@matops/db/client";
import { getMembership, withTenant } from "@matops/db";
import { db } from "@matops/db/client";
import {
  canEnroll,
  isActiveMember,
  isOwner,
  isStaff,
  isSuspended,
} from "@matops/domain";

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
   * they pass a PGlite-backed handle, so the whole seam (`withTenant`, the
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
  return {
    authApi,
    session,
    // Two db handles, two jobs. `ctx.db` (added by `enforceTenant` below) is the
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
 * 2. INITIALIZATION
 *
 * This is where the trpc api is initialized, connecting the context and
 * transformer
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
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

/**
 * Middleware for timing procedure execution and adding an articifial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev 100-500ms
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthed) procedure
 *
 * This is the base piece you use to build new queries and mutations on your
 * tRPC API. It does not guarantee that a user querying is authorized, but you
 * can still access user session data if they are logged in
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

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
 * Tenant seam (the important bit for a multi-academy app).
 *
 * Requires an authenticated user with an ACTIVE academy selected — Better Auth's
 * `session.activeOrganizationId` is the academy id. It loads the caller's
 * membership (role + status) in that academy, then runs the WHOLE resolver inside
 * `withTenant(academyId, …)` — a transaction that sets the RLS scope. So inside
 * these procedures `ctx.db` is the scoped transaction and every query is filtered
 * to the caller's academy by Postgres, even if a `where` is forgotten.
 *
 * See docs/issues/12 (RLS), 20 (roles), 23 (pending capability).
 */
const enforceTenant = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const academyId = ctx.session.session.activeOrganizationId;
  if (!academyId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No active academy selected",
    });
  }
  const user = ctx.session.user;
  // Membership lookup on the base connection (member table has no RLS), BEFORE
  // opening the scoped transaction.
  const membership = await getMembership(user.id, academyId, ctx.baseDb);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this academy",
    });
  }
  // A membership row is kept after suspend/remove (history), so existence is not
  // access. Only `pending` and `active` may enter the enrolled tier — otherwise a
  // suspended/removed member could still read (and, once Phase 3 lands on this
  // tier, book). See docs/issues/23 and spec §4.
  if (!canEnroll(membership)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      // A suspended member is reversible (an owner can restore them), so say so
      // rather than the harsher "removed" — the mobile app also gates on this.
      message: isSuspended(membership)
        ? "Your membership is suspended — contact your gym to restore access."
        : "Your access to this academy has been removed",
    });
  }
  // Work that must NOT run inside the tenant transaction: push + email sends,
  // which are slow network calls and would otherwise hold a pooled Postgres
  // connection open for their whole duration. Resolvers hand them here and they
  // fire after COMMIT, so a notification can also never resurrect a rolled-back
  // mutation. See docs/issues/60.
  const afterCommit: (() => Promise<void>)[] = [];
  const result = await withTenant(
    academyId,
    (tx) =>
      next({
        ctx: {
          db: tx,
          academyId,
          membership,
          afterCommit: (task: () => Promise<void>) => {
            afterCommit.push(task);
          },
          session: { ...ctx.session, user },
        },
      }),
    ctx.baseDb,
  );
  if (result.ok) for (const task of afterCommit) await task();
  return result;
});

/**
 * Enrolled procedure — any member of the active academy, INCLUDING `pending`
 * ones (view-only: browse the schedule, provisionally book/check-in). The full
 * `student` role is only granted at approval. See docs/issues/23.
 */
export const enrolledProcedure = t.procedure
  .use(timingMiddleware)
  .use(enforceTenant);

/** Member procedure — an APPROVED (active) member. */
export const memberProcedure = enrolledProcedure.use(({ ctx, next }) => {
  if (!isActiveMember(ctx.membership)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your membership is pending approval",
    });
  }
  return next();
});

/** Staff procedure — active owner OR instructor: runs the schedule + attendance. */
export const staffProcedure = memberProcedure.use(({ ctx, next }) => {
  if (!isStaff(ctx.membership)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff only" });
  }
  return next();
});

/** Owner procedure — active owner: academy settings, invites, members. */
export const ownerProcedure = memberProcedure.use(({ ctx, next }) => {
  if (!isOwner(ctx.membership)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner only" });
  }
  return next();
});
