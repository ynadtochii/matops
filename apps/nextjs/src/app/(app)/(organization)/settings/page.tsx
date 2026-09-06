import { Suspense } from "react";

import { PageLoader } from "~/app/_components/mat-loader";
import { OrganizationSettingsScreen } from "~/app/_components/organization-settings-screen";
import { HydrateClient, myEntities, prefetch, trpc } from "~/trpc/server";

export default function OrganizationSettingsPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening your settings" />}>
      <SettingsData />
    </Suspense>
  );
}

async function SettingsData() {
  const { canRunOrganization } = await myEntities();
  if (canRunOrganization) prefetch(trpc.accessPlan.policy.queryOptions());

  return (
    <HydrateClient>
      <OrganizationSettingsScreen />
    </HydrateClient>
  );
}
