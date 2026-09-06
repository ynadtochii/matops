"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { pendingCoachCount } from "@matops/domain";

import type { NavItem } from "./shell-frame";
import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { EntitySelector } from "./entity-selector";
import {
  DashboardIcon,
  MembersIcon,
  PaymentsIcon,
  SettingsIcon,
  ShellFrame,
} from "./shell-frame";

/**
 * The shell above the branches (ADR 127). Same frame as a branch, a different
 * list of items, and no entity: nothing here names a place, so no screen under
 * it sends `x-matops-entity` and every read is an organization procedure.
 *
 * A non-owner gets Overview alone, which is the branch list they already had.
 * That is the nav being tidy, not a guard: every organization procedure
 * authorizes the owner before it enumerates a single entity, so somebody typing
 * `/staff` learns nothing about a sibling branch (ADR 124).
 */
export function OrganizationShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const pathname = usePathname();
  const organization = useOrganization();
  // `canCreateBranches` is the owner answer `entity.list` already carries, so the shell
  // asks nobody a second time who this person is.
  const owner = organization.canRunOrganization;
  // People, Memberships and Staff are all about people at a branch, so before
  // the first one exists their empty states teach a new owner nothing and only
  // crowd out the one thing to do (ADR 128).
  const running = owner && organization.entities.length > 0;

  // The badge is what somebody has to answer: claims waiting for a yes or a no.
  const claims = useQuery({
    ...trpc.accessPlan.claims.queryOptions(),
    enabled: running,
  });
  // Coach requests waiting anywhere, off the same directory read the Staff
  // screen draws, so the badge and the list cannot disagree.
  const directory = useQuery({
    ...trpc.stats.organizationMembers.queryOptions(),
    enabled: running,
  });

  const items: NavItem[] = [
    {
      path: "/overview",
      label: "Gym overview",
      icon: <DashboardIcon />,
      show: true,
    },
    {
      path: "/people",
      label: "People",
      icon: <MembersIcon />,
      show: running,
      // Coach requests waiting anywhere. They live on the Staff TAB of this
      // screen now, so the count belongs to People and is not shown twice
      // (ADR 129).
      badge: pendingCoachCount(directory.data?.rows ?? []),
    },
    {
      path: "/memberships",
      label: "Memberships",
      icon: <PaymentsIcon />,
      show: running,
      badge: claims.data?.length ?? 0,
    },
    {
      path: "/settings",
      label: "Gym settings",
      icon: <SettingsIcon />,
      show: owner,
    },
  ]
    .filter((i) => i.show)
    .map((i) => ({ ...i, href: i.path }));

  const isCurrent = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  return (
    <ShellFrame
      items={items}
      isCurrent={isCurrent}
      homeHref="/overview"
      profileHref="/profile"
      selector={<EntitySelector organization={organization} />}
      user={user}
      roleLabel={organization.role}
      columnClass="mx-auto w-full max-w-6xl px-6 md:px-8"
    >
      {children}
    </ShellFrame>
  );
}
