import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { currentAcademy, HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AppShell } from "../_components/app-shell";
import { PageLoader } from "../_components/mat-loader";

/**
 * The authed shell layout (IA ticket 02). Gates on the session server-side, then
 * hands off to the client `AppShell`, which resolves the active academy and
 * renders either onboarding or the sidebar + the routed screen.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader label="Opening your academy" />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}

async function AuthedShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  await currentAcademy();
  prefetch(trpc.academy.memberships.queryOptions());

  return (
    <HydrateClient>
      <AppShell user={{ name: session.user.name, email: session.user.email }}>
        {children}
      </AppShell>
    </HydrateClient>
  );
}
