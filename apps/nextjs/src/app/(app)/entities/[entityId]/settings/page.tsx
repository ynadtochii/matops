import { Suspense } from "react";

import { isOwner } from "@matops/domain";

import type { EntityPageProps } from "~/trpc/server";
import { SettingsScreen } from "~/app/_components/settings-screen";
import { SettingsSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

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

export default async function SettingsPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsData />
    </Suspense>
  );
}
