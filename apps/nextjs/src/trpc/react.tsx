"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import SuperJSON from "superjson";

import type { AppRouter } from "@matops/api";
import { entityFromPath } from "@matops/domain";

import { env } from "~/env";
import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  } else {
    // Browser: use singleton pattern to keep the same query client
    return (clientQueryClientSingleton ??= createQueryClient());
  }
};

export const { useTRPC, TRPCProvider } = createTRPCContext<AppRouter>();

/**
 * Drop every cached row when the URL names a different academy (ADR 125).
 *
 * The entity travels in a header, not in the query key, so two academies
 * produce identical keys, and the selector switches with a `<Link>`, a soft
 * navigation that keeps the cache. Without this, mat A's six-digit code, join
 * QR and public booking key are served under mat B's URL for as long as their
 * stale time.
 *
 * It runs during render rather than in an effect, and ABOVE the hydration
 * boundary, so the previous academy's rows are gone before the new one's
 * prefetched rows land and before anything below can read either. The last id
 * is held per tab rather than in a ref, because a navigation between two values
 * of `[entityId]` may remount this component, and a remounted ref would forget
 * the academy it is supposed to be replacing. On the first load there is no
 * previous id and nothing is dropped.
 *
 * The entity layout mounts it because it already knows the id: the root
 * provider would need `usePathname`, which makes the static shell dynamic
 * (ADR 91).
 */
let lastEntityId: string | undefined;

function switchedAcademy(entityId: string): boolean {
  const switched = lastEntityId !== undefined && lastEntityId !== entityId;
  lastEntityId = entityId;
  return switched;
}

export function EntityCacheBoundary({ entityId }: { entityId: string }) {
  const queryClient = useQueryClient();
  if (switchedAcademy(entityId)) queryClient.removeQueries();
  return null;
}

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        loggerLink({
          enabled: (op) =>
            env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        // NOT httpBatchStreamLink: a streamed response flushes its headers
        // before the resolvers run, so the `Set-Cookie` that `nextCookies()`
        // writes during a mutation is dropped and the session cookie cache
        // (ADR 81) stays stale for five minutes. See docs/issues/83.
        httpBatchLink({
          transformer: SuperJSON,
          url: getBaseUrl() + "/api/trpc",
          headers() {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");
            const entityId = entityFromPath(window.location.pathname);
            if (entityId) headers.set("x-matops-entity", entityId);
            return headers;
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

const getBaseUrl = () => {
  if (typeof window !== "undefined") return window.location.origin;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  // eslint-disable-next-line no-restricted-properties
  return `http://localhost:${process.env.PORT ?? 3004}`;
};
