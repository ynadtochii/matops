"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { AcademyDangerZone } from "./academy-danger-zone";
import { AcademyIdentity } from "./academy-identity";
import { AcademyLocation } from "./academy-location";
import { PageHeader } from "./page-header";
import { ErrorState, SkeletonRows } from "./states";

/**
 * Settings screen (IA ticket 02, spec O6) — the academy itself: rename it, read
 * its code, set the time zone and address, delete it (ADR 68). Everything that
 * belongs to a job lives with that job now: staff and
 * the instructor link on Coaches, the student link and the check-in poster on
 * Members, bank details on Payments. Owner-only (guarded by the nav + server
 * procedures).
 */
export function SettingsScreen() {
  const trpc = useTRPC();
  const academy = useQuery(trpc.academy.current.queryOptions());

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your academy: name, code, time zone, and where you train."
      />
      {academy.isPending ? (
        <SkeletonRows rows={3} />
      ) : academy.isError || !academy.data ? (
        <ErrorState
          label="your settings"
          onRetry={() => void academy.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <AcademyIdentity name={academy.data.name} code={academy.data.code} />
          <AcademyLocation address={academy.data.address} />
          <AcademyDangerZone name={academy.data.name} />
        </div>
      )}
    </>
  );
}
