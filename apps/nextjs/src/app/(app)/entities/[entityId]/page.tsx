import { Suspense } from "react";

import {
  dashboardWeekWindow,
  isOwner,
  isStaff,
  studentWeekWindow,
} from "@matops/domain";

import type { EntityPageProps } from "~/trpc/server";
import { DashboardScreen } from "~/app/_components/dashboard-screen";
import { HomeSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

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

export default async function DashboardPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<HomeSkeleton />}>
      <DashboardData />
    </Suspense>
  );
}
