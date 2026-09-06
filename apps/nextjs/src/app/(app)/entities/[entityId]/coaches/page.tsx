import { Suspense } from "react";

import { isStaff, runsBranch } from "@matops/domain";

import type { EntityPageProps } from "~/trpc/server";
import { CoachesScreen } from "~/app/_components/coaches-screen";
import { CoachesSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

async function CoachesData() {
  const academy = await currentAcademy();

  if (academy && isStaff(academy)) {
    prefetch(trpc.membership.members.queryOptions());
    prefetch(trpc.stats.coaches.queryOptions({ window: "this_month" }));
    if (runsBranch(academy)) {
      prefetch(trpc.membership.staff.queryOptions());
      prefetch(trpc.invite.list.queryOptions());
    }
  }

  return (
    <HydrateClient>
      <CoachesScreen />
    </HydrateClient>
  );
}

export default async function CoachesPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<CoachesSkeleton />}>
      <CoachesData />
    </Suspense>
  );
}
