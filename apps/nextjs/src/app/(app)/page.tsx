import { Suspense } from "react";

import {
  dashboardWeekWindow,
  isOwner,
  isStaff,
  studentWeekWindow,
} from "@matops/domain";

import { DashboardScreen } from "~/app/_components/dashboard-screen";
import { HomeSkeleton } from "~/app/_components/skeletons";
import { currentAcademy, HydrateClient, prefetch, trpc } from "~/trpc/server";

async function DashboardData() {
  const academy = await currentAcademy();

  if (academy && isStaff(academy)) {
    prefetch(trpc.class.week.queryOptions(dashboardWeekWindow(new Date())));
    prefetch(trpc.membership.members.queryOptions());
    prefetch(trpc.stats.dashboard.queryOptions());
    if (isOwner(academy)) {
      prefetch(trpc.dropIn.list.queryOptions());
      prefetch(trpc.payments.claims.queryOptions());
    }
  } else if (academy) {
    prefetch(trpc.class.mine.queryOptions(studentWeekWindow(new Date())));
  }

  return (
    <HydrateClient>
      <DashboardScreen />
    </HydrateClient>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <DashboardData />
    </Suspense>
  );
}
