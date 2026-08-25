import { Suspense } from "react";

import { isOwner, isStaff } from "@matops/domain";

import { MembersScreen } from "~/app/_components/members-screen";
import { MembersSkeleton } from "~/app/_components/skeletons";
import { currentAcademy, HydrateClient, prefetch, trpc } from "~/trpc/server";

async function MembersData() {
  const academy = await currentAcademy();

  if (academy && isStaff(academy)) {
    prefetch(trpc.membership.members.queryOptions());
    if (isOwner(academy)) {
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

export default function MembersPage() {
  return (
    <Suspense fallback={<MembersSkeleton />}>
      <MembersData />
    </Suspense>
  );
}
