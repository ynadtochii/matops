import { Suspense } from "react";

import { PageLoader } from "~/app/_components/mat-loader";
import { OrganizationPersonScreen } from "~/app/_components/organization-person-screen";
import { HydrateClient, myEntities, prefetch, trpc } from "~/trpc/server";

export default async function OrganizationPersonPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return (
    <Suspense fallback={<PageLoader label="Opening this person" />}>
      <PersonData userId={userId} />
    </Suspense>
  );
}

async function PersonData({ userId }: { userId: string }) {
  const { canRunOrganization } = await myEntities();
  if (canRunOrganization) {
    // The same read the directory draws, so arriving from the list is a cache
    // hit and arriving by link still works.
    prefetch(trpc.stats.organizationMembers.queryOptions());
    prefetch(trpc.accessPlan.forUser.queryOptions({ userId }));
  }

  return (
    <HydrateClient>
      <OrganizationPersonScreen userId={userId} />
    </HydrateClient>
  );
}
