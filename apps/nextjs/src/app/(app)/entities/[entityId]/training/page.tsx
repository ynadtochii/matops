import { Suspense } from "react";
import { connection } from "next/server";

import type { EntityPageProps } from "~/trpc/server";
import { MyClassesScreen } from "~/app/_components/my-classes-screen";
import { MyClassesSkeleton } from "~/app/_components/skeletons";
import { HydrateClient, prefetch, setRequestEntity, trpc } from "~/trpc/server";

async function TrainingData() {
  await connection();

  prefetch(trpc.booking.mine.queryOptions());
  prefetch(trpc.stats.me.queryOptions());

  return (
    <HydrateClient>
      <MyClassesScreen />
    </HydrateClient>
  );
}

export default async function TrainingPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<MyClassesSkeleton />}>
      <TrainingData />
    </Suspense>
  );
}
