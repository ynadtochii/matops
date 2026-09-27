import { Suspense } from "react";

import type { EntityPageProps } from "~/trpc/server";
import { PaymentsScreen } from "~/app/_components/payments-screen";
import { ScreenSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

async function PaymentsData() {
  const academy = await currentAcademy();
  if (academy?.membershipEnforced) {
    prefetch(trpc.accessPlan.mine.queryOptions());
  }

  return (
    <HydrateClient>
      <PaymentsScreen />
    </HydrateClient>
  );
}

export default async function PaymentsPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <PaymentsData />
    </Suspense>
  );
}
