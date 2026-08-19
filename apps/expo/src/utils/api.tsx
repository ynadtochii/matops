import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import type { AppRouter } from "@matops/api";

import { authClient } from "./auth";
import { getBaseUrl } from "./base-url";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

/**
 * A set of typesafe hooks for consuming your API.
 */
export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: createTRPCClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === "development" ||
          (opts.direction === "down" && opts.result instanceof Error),
        colorMode: "ansi",
      }),
      httpBatchLink({
        transformer: superjson,
        url: `${getBaseUrl()}/api/trpc`,
        // The session lives in the Expo SecureStore, not the OS cookie jar. We
        // attach it ourselves via the `Cookie` header below. `credentials:
        // "omit"` stops React Native's native cookie store (NSHTTPCookieStorage
        // on iOS) from ALSO auto-attaching whatever it captured from past
        // `Set-Cookie` responses — an old token the SecureStore no longer knows
        // about and that sign-out never clears. Without this, requests carry two
        // `better-auth.session_token` cookies (the stale native one first, ours
        // second) and Better Auth reads the stale one → every call is
        // UNAUTHORIZED. The @better-auth/expo client does the same on its own
        // fetch (that's why auth calls worked while tRPC did not).
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "omit" });
        },
        headers() {
          const headers = new Map<string, string>();
          headers.set("x-trpc-source", "expo-react");

          const cookies = authClient.getCookie();
          if (cookies) {
            headers.set("Cookie", cookies);
          }
          return headers;
        },
      }),
    ],
  }),
  queryClient,
});

export type { RouterInputs, RouterOutputs } from "@matops/api";
