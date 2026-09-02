import { Suspense } from "react";

import { isStaff } from "@matops/domain";

import { NotificationsScreen } from "~/app/_components/notifications-screen";
import { NotificationsSkeleton } from "~/app/_components/skeletons";
import { currentAcademy, HydrateClient, prefetch, trpc } from "~/trpc/server";

async function NotificationsData() {
  const academy = await currentAcademy();

  prefetch(trpc.notification.list.queryOptions());
  if (academy && isStaff(academy)) {
    prefetch(trpc.notification.audienceCounts.queryOptions());
  }

  return (
    <HydrateClient>
      <NotificationsScreen />
    </HydrateClient>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<NotificationsSkeleton />}>
      <NotificationsData />
    </Suspense>
  );
}
