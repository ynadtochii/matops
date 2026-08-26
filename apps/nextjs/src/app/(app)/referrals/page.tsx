import { Suspense } from "react";

import { isOwner } from "@matops/domain";

import { ReferralsScreen } from "~/app/_components/referrals-screen";
import { ReferralsSkeleton } from "~/app/_components/skeletons";
import { currentAcademy, HydrateClient, prefetch, trpc } from "~/trpc/server";

async function ReferralsData() {
  const academy = await currentAcademy();

  if (academy && isOwner(academy)) {
    prefetch(trpc.referral.dashboard.queryOptions());
  }

  return (
    <HydrateClient>
      <ReferralsScreen />
    </HydrateClient>
  );
}

export default function ReferralsPage() {
  return (
    <Suspense fallback={<ReferralsSkeleton />}>
      <ReferralsData />
    </Suspense>
  );
}
