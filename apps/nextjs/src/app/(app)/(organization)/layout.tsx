import { OrganizationShell } from "~/app/_components/organization-shell";
import { getSession } from "~/auth/server";

/**
 * The organization level (ADR 127). A route group, so `/overview`, `/people`,
 * `/memberships`, `/staff` and `/settings` keep the paths they already have and
 * gain the shell they never had.
 *
 * The landing redirect and `/profile` sit outside this group on purpose: both
 * forward into a branch and neither wants chrome.
 */
export default async function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) return null;

  return (
    <OrganizationShell
      user={{ name: session.user.name, email: session.user.email }}
    >
      {children}
    </OrganizationShell>
  );
}
