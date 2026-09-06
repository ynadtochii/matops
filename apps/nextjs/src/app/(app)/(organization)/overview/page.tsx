import { Suspense } from "react";

import { PageLoader } from "~/app/_components/mat-loader";
import { OverviewScreen } from "~/app/_components/overview-screen";
import { HydrateClient, myEntities, prefetch, trpc } from "~/trpc/server";

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening your gym" />}>
      <OverviewData />
    </Suspense>
  );
}

async function OverviewData() {
  const { canRunOrganization } = await myEntities();
  if (canRunOrganization) prefetch(trpc.stats.organization.queryOptions());

  return (
    <HydrateClient>
      <OverviewScreen />
    </HydrateClient>
  );
}
