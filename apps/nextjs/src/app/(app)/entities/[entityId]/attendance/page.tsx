import { Suspense } from "react";

import { isStaff } from "@matops/domain";

import type { EntityPageProps } from "~/trpc/server";
import { Attendance } from "~/app/_components/attendance";
import { PageHeader } from "~/app/_components/page-header";
import { ScreenSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

async function AttendanceData() {
  const academy = await currentAcademy();

  if (academy && isStaff(academy)) {
    prefetch(
      trpc.attendance.reviewQueue.queryOptions({
        status: "needs_review",
        offset: 0,
      }),
    );
  }

  return (
    <HydrateClient>
      <PageHeader
        title="Attendance"
        subtitle="Review past classes and confirm who attended."
      />
      <Attendance />
    </HydrateClient>
  );
}

export default async function AttendancePage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <AttendanceData />
    </Suspense>
  );
}
