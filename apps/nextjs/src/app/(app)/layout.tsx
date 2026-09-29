import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AcademyGate } from "~/app/_components/academy-gate";
import { AppShell } from "~/app/_components/app-shell";
import { PageLoader } from "~/app/_components/mat-loader";
import { OrganizationBoundary } from "~/app/_components/organization-boundary";
import { getSession } from "~/auth/server";
import { EntityCacheBoundary } from "~/trpc/react";
import { getQueryClient, trpc } from "~/trpc/server";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader label="Opening your gym" />}>
      <Authed>{children}</Authed>
    </Suspense>
  );
}

async function Authed({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!session.session.activeOrganizationId) return <AcademyGate />;

  const queryClient = getQueryClient();
  const options = trpc.entity.list.queryOptions();
  await queryClient.prefetchQuery(options);
  const organization = queryClient.getQueryState(options.queryKey);

  // Not HydrateClient: the request shares one query client, so a snapshot here
  // can catch the entity layout's in-flight `academy.current`. A late hydration
  // then mismatches the server HTML and the tab freezes (ADR 89 addendum).
  return (
    <OrganizationBoundary
      initialData={organization?.data}
      initialDataUpdatedAt={organization?.dataUpdatedAt}
    >
      <EntityCacheBoundary />
      <AppShell user={{ name: session.user.name, email: session.user.email }}>
        {children}
      </AppShell>
    </OrganizationBoundary>
  );
}
