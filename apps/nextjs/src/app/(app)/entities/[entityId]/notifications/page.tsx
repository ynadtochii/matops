import { Suspense } from "react";

import type { EntityPageProps } from "~/trpc/server";
import { NotificationsScreen } from "~/app/_components/notifications-screen";
import { NotificationsSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

async function NotificationsData() {
  await currentAcademy();

  prefetch(trpc.notification.list.queryOptions());

  return (
    <HydrateClient>
      <NotificationsScreen />
    </HydrateClient>
  );
}

export default async function NotificationsPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<NotificationsSkeleton />}>
      <NotificationsData />
    </Suspense>
  );
}
