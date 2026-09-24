import { TRPCError } from "@trpc/server";

import { resolveReceptionLink, withScope } from "@matops/db";

import { take } from "./rate-limit";
import { receptionBaseProcedure } from "./trpc";

export const RECEPTION_COOKIE = "matops-reception";

export const RECEPTION_UNAVAILABLE =
  "This reception link is not available. Please ask staff.";

function cookieToken(header: string | null): string | null {
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${RECEPTION_COOKIE}=`))
    ?.slice(RECEPTION_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

/**
 * The entrance credential (ADR 139). It is a cookie holding the permanent
 * link's secret, and it is valid for reception procedures only. Never for a
 * management one, and never alongside an account session, so a browser left
 * signed in at the door cannot reach the owner's screens through it.
 *
 * Every request re-resolves the live link, so disabling or replacing it stops
 * the old cookie on the next call rather than at some expiry.
 */
export const receptionProcedure = receptionBaseProcedure.use(
  async ({ ctx, next, path, type }) => {
    const token = cookieToken(ctx.headers.get("cookie"));
    if (ctx.session || !token) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: RECEPTION_UNAVAILABLE,
      });
    }
    const branch = await resolveReceptionLink(token, ctx.baseDb);
    if (!branch) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: RECEPTION_UNAVAILABLE,
      });
    }
    const limit = type === "mutation" ? 60 : 240;
    if (
      !take(`${path}:link:${branch.linkId}`, limit, 60_000) ||
      !take(`${path}:branch:${branch.academyId}`, limit * 4, 60_000)
    ) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Please wait a moment and try again.",
      });
    }
    const baseDb = ctx.baseDb;
    return next({
      ctx: {
        academyId: branch.academyId,
        organizationId: branch.organizationId,
        branch,
        withScope: <T>(body: Parameters<typeof withScope<T>>[1]) =>
          withScope(
            {
              organizationId: branch.organizationId,
              entityId: branch.academyId,
            },
            body,
            baseDb,
          ),
      },
    });
  },
);
