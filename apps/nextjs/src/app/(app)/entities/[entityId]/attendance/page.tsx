import { Suspense } from "react";

import { attendanceWindow, isStaff } from "@matops/domain";

import { Attendance } from "~/app/_components/attendance";
import { PageHeader } from "~/app/_components/page-header";
import { AttendanceSkeleton } from "~/app/_components/skeletons";
import { currentAcademy, HydrateClient, prefetch, trpc } from "~/trpc/server";

async function AttendanceData() {
  const academy = await currentAcademy();

  if (academy && isStaff(academy)) {
    prefetch(trpc.class.week.queryOptions(attendanceWindow(new Date())));
  }

  return (
    <HydrateClient>
      <PageHeader
        title="Attendance"
        subtitle="Mark who trained — pick a class from the last two weeks."
      />
      <Attendance />
    </HydrateClient>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<AttendanceSkeleton />}>
      <AttendanceData />
    </Suspense>
  );
}
