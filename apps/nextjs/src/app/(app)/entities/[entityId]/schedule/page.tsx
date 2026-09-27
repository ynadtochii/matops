import { Suspense } from "react";

import { isStaff, scheduleWeekWindow } from "@matops/domain";

import type { EntityPageProps } from "~/trpc/server";
import { ScheduleScreen } from "~/app/_components/schedule-screen";
import { ScreenSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

async function ScheduleData() {
  const academy = await currentAcademy();

  if (academy && isStaff(academy)) {
    prefetch(trpc.class.week.queryOptions(scheduleWeekWindow(new Date(), 0)));
    prefetch(trpc.template.list.queryOptions());
  }

  return (
    <HydrateClient>
      <ScheduleScreen />
    </HydrateClient>
  );
}

export default async function SchedulePage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <ScheduleData />
    </Suspense>
  );
}
