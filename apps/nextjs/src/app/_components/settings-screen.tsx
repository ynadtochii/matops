"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { AcademyIdentity } from "./academy-identity";
import { Invites } from "./invites";
import { PageHeader } from "./page-header";
import { PaymentRequisites } from "./payment-requisites";
import { ErrorState, SkeletonRows } from "./states";
import { VenueCheckin } from "./venue-checkin";

/**
 * Settings screen (IA ticket 02, spec O6) — academy identity (rename the name;
 * the code is fixed), the join mechanics (invite links), and the venue check-in
 * QR poster. Owner-only (guarded by the nav + server procedures).
 */
export function SettingsScreen() {
  const trpc = useTRPC();
  const academy = useQuery(trpc.academy.current.queryOptions());

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your academy, how people join it, your bank details, and the check-in poster."
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
          <Invites />
          <PaymentRequisites />
          <VenueCheckin
            academyId={academy.data.academyId}
            academyName={academy.data.name}
          />
        </div>
      )}
    </>
  );
}
