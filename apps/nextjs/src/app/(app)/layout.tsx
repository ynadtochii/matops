import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { AppShell } from "../_components/app-shell";

/**
 * The authed shell layout (IA ticket 02). Gates on the session server-side, then
 * hands off to the client `AppShell`, which resolves the active academy and
 * renders either onboarding or the sidebar + the routed screen.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email }}>
      {children}
    </AppShell>
  );
}
