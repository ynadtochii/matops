"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import type { Organization } from "./entity";
import { useTRPC } from "~/trpc/react";
import { OrganizationProvider } from "./entity";
import { PageLoader } from "./mat-loader";
import { ErrorState } from "./states";

/**
 * Resolves the organization once for everything under `(app)`, entity screens
 * and the overview alike, so the two cannot disagree about which academies a
 * person may open.
 */
export function OrganizationBoundary({
  initialData,
  initialDataUpdatedAt,
  children,
}: {
  initialData: Organization | undefined;
  initialDataUpdatedAt: number | undefined;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const mine = useQuery({
    ...trpc.entity.list.queryOptions(),
    initialData,
    initialDataUpdatedAt,
  });

  if (mine.isPending) return <PageLoader label="Opening your gym" />;

  if (mine.isError) {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <ErrorState label="your gyms" onRetry={() => void mine.refetch()} />
      </div>
    );
  }

  return (
    <OrganizationProvider organization={mine.data}>
      {children}
    </OrganizationProvider>
  );
}
