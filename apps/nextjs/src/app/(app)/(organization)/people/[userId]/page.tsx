import { Suspense } from "react";

import { PageLoader } from "~/app/_components/mat-loader";
import { OrganizationPersonScreen } from "~/app/_components/organization-person-screen";
import { HydrateClient, myEntities, prefetch, trpc } from "~/trpc/server";

export default async function OrganizationPersonPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId: personId } = await params;
  return (
    <Suspense fallback={<PageLoader label="Opening this person" />}>
      <PersonData personId={personId} />
    </Suspense>
  );
}

async function PersonData({ personId }: { personId: string }) {
  const { canRunOrganization } = await myEntities();
  if (canRunOrganization) {
    prefetch(trpc.person.get.queryOptions({ personId, includeArchived: true }));
  }

  return (
    <HydrateClient>
      <OrganizationPersonScreen personId={personId} />
    </HydrateClient>
  );
}
