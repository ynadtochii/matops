"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { OrganizationProvider } from "./entity";
import { PageLoader } from "./mat-loader";
import { ErrorState } from "./states";

/**
 * Resolves the organization once for everything under `(app)`, entity screens
 * and the overview alike, so the two cannot disagree about which academies a
 * person may open.
 */
export function OrganizationBoundary({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const mine = useQuery(trpc.entity.list.queryOptions());

  if (mine.isPending) return <PageLoader label="Opening your branch" />;

  if (mine.isError) {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <ErrorState label="your branches" onRetry={() => void mine.refetch()} />
      </div>
    );
  }

  return (
    <OrganizationProvider organization={mine.data}>
      {children}
    </OrganizationProvider>
  );
}
