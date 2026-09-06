import { Suspense } from "react";

import { runsBranch } from "@matops/domain";

import type { EntityPageProps } from "~/trpc/server";
import { ReferralsScreen } from "~/app/_components/referrals-screen";
import { ReferralsSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

async function ReferralsData() {
  const academy = await currentAcademy();

  if (academy && runsBranch(academy)) {
    prefetch(trpc.referral.dashboard.queryOptions());
  }

  return (
    <HydrateClient>
      <ReferralsScreen />
    </HydrateClient>
  );
}

export default async function ReferralsPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<ReferralsSkeleton />}>
      <ReferralsData />
    </Suspense>
  );
}
