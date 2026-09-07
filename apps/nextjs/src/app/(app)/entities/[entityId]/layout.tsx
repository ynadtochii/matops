import { Suspense } from "react";

import { AppShell } from "~/app/_components/app-shell";
import { PageLoader } from "~/app/_components/mat-loader";
import { getSession } from "~/auth/server";
import { EntityCacheBoundary } from "~/trpc/react";
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
      <EntityShell entityId={entityId}>{children}</EntityShell>
    </Suspense>
  );
}

async function EntityShell({
  entityId,
  children,
}: {
  entityId: string;
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) return null;

  await currentAcademy();

  return (
    <>
      <EntityCacheBoundary />
      <HydrateClient>
        <AppShell
          entityId={entityId}
          user={{ name: session.user.name, email: session.user.email }}
        >
          {children}
        </AppShell>
      </HydrateClient>
    </>
  );
}
