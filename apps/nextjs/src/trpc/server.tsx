import type { TRPCQueryOptions } from "@trpc/tanstack-react-query";
import { cache } from "react";
import { headers } from "next/headers";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

import type { AppRouter } from "@matops/api";
import { appRouter, createTRPCContext } from "@matops/api";

import { auth } from "~/auth/server";
import { createQueryClient } from "./query-client";

export interface EntityPageProps {
  params: Promise<{ entityId: string }>;
}

/**
 * The entity this render is for. `cache()` scopes it to the one request, and
 * every page under `[entityId]` writes it before it prefetches, which is the
 * only way a server component can name the entity: the header the browser
 * sends never reaches an RSC render (ADR 124). The layout cannot do it alone,
 * because a client navigation re-renders the page and not the layout above it.
 */
const requestEntity = cache(() => ({ id: undefined as string | undefined }));

export function setRequestEntity(entityId: string): void {
  requestEntity().id = entityId;
}

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component.
 */
const baseContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");

  return createTRPCContext({
    headers: heads,
    auth,
  });
});

/**
 * The session read is cached for the request; the entity is not. The layout
 * that owns the `[entityId]` segment writes it after the organization read has
 * already built the context, so freezing it there would leave every screen
 * under the entity naming no entity at all.
 */
const createContext = async () => ({
  ...(await baseContext()),
  requestedEntityId: requestEntity().id,
});

export const getQueryClient = cache(createQueryClient);

export const trpc = createTRPCOptionsProxy<AppRouter>({
  router: appRouter,
  ctx: createContext,
  queryClient: getQueryClient,
});

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: T,
): void {
  const queryClient = getQueryClient();
  if (queryOptions.queryKey[1]?.type === "infinite") {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    void queryClient.prefetchInfiniteQuery(queryOptions as any);
    return;
  }
  void queryClient.prefetchQuery(queryOptions);
}

export async function myEntities() {
  const queryClient = getQueryClient();
  const options = trpc.entity.list.queryOptions();
  await queryClient.prefetchQuery(options);
  return (
    queryClient.getQueryData(options.queryKey) ?? {
      organizationId: "",
      canCreateBranches: false,
      canCreateGeneralBranches: false,
      canRunOrganization: false,
      curriculumEnabled: false,
      referralsEnabled: false,
      role: "member",
      entities: [],
    }
  );
}

export async function currentAcademy() {
  const queryClient = getQueryClient();
  const options = trpc.academy.current.queryOptions();
  await queryClient.prefetchQuery(options);
  return queryClient.getQueryData(options.queryKey) ?? null;
}
