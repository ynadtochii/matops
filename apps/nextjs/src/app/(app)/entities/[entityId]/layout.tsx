import { Suspense } from "react";

import { PageLoader } from "~/app/_components/mat-loader";
import { currentAcademy, HydrateClient, setRequestEntity } from "~/trpc/server";

export default async function EntityLayout({
  params,
  children,
}: {
  params: Promise<{ entityId: string }>;
  children: React.ReactNode;
}) {
  // Before anything under this layout prefetches: every server-side tRPC call
  // in this render reads the entity from here (ADR 124).
  const { entityId } = await params;
  setRequestEntity(entityId);

  return (
    <Suspense fallback={<PageLoader label="Opening your branch" />}>
      <EntityShell>{children}</EntityShell>
    </Suspense>
  );
}

async function EntityShell({ children }: { children: React.ReactNode }) {
  await currentAcademy();

  return <HydrateClient>{children}</HydrateClient>;
}
