import { Suspense } from "react";

import { PageLoader } from "~/app/_components/mat-loader";
import { OverviewScreen } from "~/app/_components/overview-screen";
import { HydrateClient, myEntities, prefetch, trpc } from "~/trpc/server";

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening your academies" />}>
      <OverviewData />
    </Suspense>
  );
}

async function OverviewData() {
  const { canAdd } = await myEntities();
  if (canAdd) prefetch(trpc.stats.organization.queryOptions());

  return (
    <HydrateClient>
      <OverviewScreen />
    </HydrateClient>
  );
}
