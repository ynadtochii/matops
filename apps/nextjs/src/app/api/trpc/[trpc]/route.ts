import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter, createTRPCContext } from "@matops/api";

import { auth } from "~/auth/server";

/** The deepest `cause` in the chain: Drizzle's own message keeps only the SQL,
 * so the Postgres message ("cannot execute UPDATE in a read-only transaction")
 * is one level down and is the half that says why. ADR 83. */
const rootCause = (e: unknown): unknown =>
  e instanceof Error && e.cause ? rootCause(e.cause) : e;

const handler = async (req: NextRequest) => {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req,
    createContext: () =>
      createTRPCContext({
        auth: auth,
        headers: req.headers,
      }),
    onError({ error, path, type, ctx }) {
      if (path?.startsWith("reception.")) {
        console.error("Reception request failed", { path, code: error.code });
        if (error.code === "INTERNAL_SERVER_ERROR") {
          Sentry.captureException(new Error("Reception request failed"), {
            tags: { trpcPath: path, trpcType: type, code: error.code },
          });
        }
        return;
      }
      console.error(`>>> tRPC Error on '${path}'`, error);
      const root = rootCause(error);
      if (root !== error) console.error(`>>> caused by`, root);
      // tRPC converts every thrown error into a JSON response and never
      // rethrows, so Next's onRequestError never sees these. Report here or
      // the whole API is invisible.
      if (error.code !== "INTERNAL_SERVER_ERROR") return;
      Sentry.captureException(error.cause ?? error, {
        tags: { trpcPath: path ?? "<no-path>", trpcType: type },
        user: ctx?.session?.user
          ? { id: ctx.session.user.id, email: ctx.session.user.email }
          : undefined,
        extra: {
          organizationId:
            ctx?.session?.session.activeOrganizationId ?? undefined,
          entityId: ctx?.requestedEntityId,
        },
      });
    },
  });

  if (req.nextUrl.pathname.includes("reception.")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
};

export { handler as GET, handler as POST };
