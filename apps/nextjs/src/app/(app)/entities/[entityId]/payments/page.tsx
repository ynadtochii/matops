import { Suspense } from "react";

import type { EntityPageProps } from "~/trpc/server";
import { PaymentsScreen } from "~/app/_components/payments-screen";
import { PaymentsSkeleton } from "~/app/_components/skeletons";
import { HydrateClient, prefetch, setRequestEntity, trpc } from "~/trpc/server";

function PaymentsData() {
  prefetch(trpc.accessPlan.mine.queryOptions());

  return (
    <HydrateClient>
      <PaymentsScreen />
    </HydrateClient>
  );
}

export default async function PaymentsPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<PaymentsSkeleton />}>
      <PaymentsData />
    </Suspense>
  );
}
