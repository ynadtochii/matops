import { Suspense } from "react";

import { isStaff, scheduleWeekWindow } from "@matops/domain";

import { ScheduleScreen } from "~/app/_components/schedule-screen";
import { ScheduleSkeleton } from "~/app/_components/skeletons";
import { currentAcademy, HydrateClient, prefetch, trpc } from "~/trpc/server";

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

export default function SchedulePage() {
  return (
    <Suspense fallback={<ScheduleSkeleton />}>
      <ScheduleData />
    </Suspense>
  );
}
