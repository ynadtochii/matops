import { Suspense } from "react";

import { PageLoader } from "~/app/_components/mat-loader";
import { MembershipsScreen } from "~/app/_components/memberships-screen";
import { HydrateClient, myEntities, prefetch, trpc } from "~/trpc/server";

export default function MembershipsPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening your memberships" />}>
      <MembershipsData />
    </Suspense>
  );
}

async function MembershipsData() {
  const { canRunOrganization } = await myEntities();
  if (canRunOrganization) {
    prefetch(trpc.accessPlan.list.queryOptions());
  }

  return (
    <HydrateClient>
      <MembershipsScreen />
    </HydrateClient>
  );
}
