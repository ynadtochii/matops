import { Suspense } from "react";
import { connection } from "next/server";

import { MyClassesScreen } from "~/app/_components/my-classes-screen";
import { MyClassesSkeleton } from "~/app/_components/skeletons";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

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

export default function TrainingPage() {
  return (
    <Suspense fallback={<MyClassesSkeleton />}>
      <TrainingData />
    </Suspense>
  );
}
