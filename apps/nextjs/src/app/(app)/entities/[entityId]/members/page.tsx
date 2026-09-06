import { Suspense } from "react";

import { isStaff, runsBranch } from "@matops/domain";

import type { EntityPageProps } from "~/trpc/server";
import { MembersScreen } from "~/app/_components/members-screen";
import { MembersSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

async function MembersData() {
  const academy = await currentAcademy();

  if (academy && isStaff(academy)) {
    prefetch(trpc.membership.members.queryOptions());
    if (runsBranch(academy)) {
      prefetch(trpc.dropIn.list.queryOptions());
      prefetch(trpc.membership.archived.queryOptions());
    }
  }

  return (
    <HydrateClient>
      <MembersScreen />
    </HydrateClient>
  );
}

export default async function MembersPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<MembersSkeleton />}>
      <MembersData />
    </Suspense>
  );
}
