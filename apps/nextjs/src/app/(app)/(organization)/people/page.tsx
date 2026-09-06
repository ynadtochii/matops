import { Suspense } from "react";

import { PageLoader } from "~/app/_components/mat-loader";
import { PeopleScreen } from "~/app/_components/people-screen";
import { HydrateClient, myEntities, prefetch, trpc } from "~/trpc/server";

export default function PeoplePage() {
  return (
    <Suspense fallback={<PageLoader label="Opening your members" />}>
      <PeopleData />
    </Suspense>
  );
}

async function PeopleData() {
  const { canRunOrganization } = await myEntities();
  if (canRunOrganization)
    prefetch(trpc.stats.organizationMembers.queryOptions());

  return (
    <HydrateClient>
      <PeopleScreen />
    </HydrateClient>
  );
}
