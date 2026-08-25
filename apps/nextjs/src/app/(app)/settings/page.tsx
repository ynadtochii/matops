import { Suspense } from "react";

import { isOwner } from "@matops/domain";

import { SettingsScreen } from "~/app/_components/settings-screen";
import { SettingsSkeleton } from "~/app/_components/skeletons";
import { currentAcademy, HydrateClient, prefetch, trpc } from "~/trpc/server";

async function SettingsData() {
  const academy = await currentAcademy();

  if (academy && isOwner(academy)) {
    prefetch(trpc.academy.settings.queryOptions());
    prefetch(trpc.payments.getRequisites.queryOptions());
  }

  return (
    <HydrateClient>
      <SettingsScreen />
    </HydrateClient>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsData />
    </Suspense>
  );
}
