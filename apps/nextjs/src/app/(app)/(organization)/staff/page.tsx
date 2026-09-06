import { Suspense } from "react";

import { PageLoader } from "~/app/_components/mat-loader";
import { StaffScreen } from "~/app/_components/staff-screen";
import { HydrateClient, myEntities, prefetch, trpc } from "~/trpc/server";

export default function StaffPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening your staff" />}>
      <StaffData />
    </Suspense>
  );
}

async function StaffData() {
  const { canRunOrganization } = await myEntities();
  if (canRunOrganization)
    prefetch(trpc.stats.organizationMembers.queryOptions());

  return (
    <HydrateClient>
      <StaffScreen />
    </HydrateClient>
  );
}
