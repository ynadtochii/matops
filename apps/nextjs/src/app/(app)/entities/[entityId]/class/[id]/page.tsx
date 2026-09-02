import { Suspense } from "react";

import { ClassDetail } from "~/app/_components/class-detail";
import { ClassDetailSkeleton } from "~/app/_components/skeletons";
import { HydrateClient, prefetch, setRequestEntity, trpc } from "~/trpc/server";

function ClassData({ id }: { id: string }) {
  prefetch(trpc.class.get.queryOptions({ id }));
  prefetch(trpc.class.attendees.queryOptions({ id }));

  return (
    <HydrateClient>
      <ClassDetail classId={id} />
    </HydrateClient>
  );
}

export default async function ClassPage({
  params,
}: {
  params: Promise<{ entityId: string; id: string }>;
}) {
  const { entityId, id } = await params;
  setRequestEntity(entityId);

  return (
    <Suspense fallback={<ClassDetailSkeleton />}>
      <ClassData id={id} />
    </Suspense>
  );
}
