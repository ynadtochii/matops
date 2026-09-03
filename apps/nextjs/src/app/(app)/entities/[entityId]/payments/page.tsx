import { Suspense } from "react";

import { isOwner } from "@matops/domain";

import type { EntityPageProps } from "~/trpc/server";
import { PaymentsScreen } from "~/app/_components/payments-screen";
import { PaymentsSkeleton } from "~/app/_components/skeletons";
import {
  currentAcademy,
  HydrateClient,
  prefetch,
  setRequestEntity,
  trpc,
} from "~/trpc/server";

async function PaymentsData() {
  const academy = await currentAcademy();

  if (academy && isOwner(academy)) {
    prefetch(trpc.payments.claims.queryOptions());
    prefetch(trpc.payments.plans.queryOptions());
    prefetch(trpc.membership.members.queryOptions());
  } else {
    prefetch(trpc.payments.myDues.queryOptions());
  }

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
