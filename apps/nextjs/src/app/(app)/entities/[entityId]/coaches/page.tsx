import { Suspense } from "react";

import { isOwner, isStaff } from "@matops/domain";

import { CoachesScreen } from "~/app/_components/coaches-screen";
import { CoachesSkeleton } from "~/app/_components/skeletons";
import { currentAcademy, HydrateClient, prefetch, trpc } from "~/trpc/server";

async function CoachesData() {
  const academy = await currentAcademy();

  if (academy && isStaff(academy)) {
    prefetch(trpc.membership.members.queryOptions());
    prefetch(trpc.stats.coaches.queryOptions({ window: "this_month" }));
    if (isOwner(academy)) {
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

export default function CoachesPage() {
  return (
    <Suspense fallback={<CoachesSkeleton />}>
      <CoachesData />
    </Suspense>
  );
}
