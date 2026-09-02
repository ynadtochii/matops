import { Suspense } from "react";
import { redirect } from "next/navigation";

import { PageLoader } from "~/app/_components/mat-loader";
import { OrganizationBoundary } from "~/app/_components/organization-boundary";
import { getSession } from "~/auth/server";
import { getQueryClient, HydrateClient, trpc } from "~/trpc/server";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader label="Opening your academy" />}>
      <Authed>{children}</Authed>
    </Suspense>
  );
}

async function Authed({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(trpc.entity.list.queryOptions());

  return (
    <HydrateClient>
      <OrganizationBoundary>{children}</OrganizationBoundary>
    </HydrateClient>
  );
}
