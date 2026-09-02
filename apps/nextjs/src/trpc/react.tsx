"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import SuperJSON from "superjson";

import type { AppRouter } from "@matops/api";

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

/**
 * The entity the URL names (ADR 124). Read per request rather than captured in
 * a provider, because a client-side navigation between two academies changes it
 * without remounting the tRPC client.
 */
export function entityFromPath(pathname: string): string | null {
  const match = /^\/entities\/([^/]+)/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const getBaseUrl = () => {
  if (typeof window !== "undefined") return window.location.origin;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  // eslint-disable-next-line no-restricted-properties
  return `http://localhost:${process.env.PORT ?? 3004}`;
};
