"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  canVisit,
  entityFromPath,
  entityHref,
  isActiveMember,
  isStaff as isStaffOf,
  organizationHref,
  pathWithinEntity,
  runsBranch,
} from "@matops/domain";

import type { NavBadge, NavItem } from "./shell-frame";
import { useTRPC } from "~/trpc/react";
import { EntityProvider, useOrganization } from "./entity";
import { AddBranchDialog, EntitySelector } from "./entity-selector";
import { PageLoader } from "./mat-loader";
import { ShareLinksDialog } from "./share-links-dialog";
import {
  CoachesIcon,
  DashboardIcon,
  MembersIcon,
  NotificationsIcon,
  PaymentsIcon,
  ProfileIcon,
  ReferralsIcon,
  ScheduleIcon,
  SettingsIcon,
  ShareIcon,
  ShellFrame,
  TrainingIcon,
} from "./shell-frame";
import { ErrorState, NoAccessState } from "./states";

const NARROW_ROUTES = ["/class", "/profile"];

const GYM_GROUP = "Gym";

export const PlusIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    className="size-[18px] shrink-0"
    aria-hidden
  >
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

function contentWidth(pathname: string, isStaff: boolean): string {
  if (pathname.startsWith("/schedule")) return "max-w-[1600px]";
  if (!isStaff) {
    return pathname.startsWith("/class") ||
      pathname.startsWith("/notifications")
      ? "max-w-3xl"
      : "max-w-6xl";
  }
  if (NARROW_ROUTES.some((r) => pathname.startsWith(r))) {
    return "max-w-3xl";
  }
  return "max-w-6xl";
}

interface BranchNav {
  id: string;
  type: string;
  role: string;
  status: string;
  referralsEnabled?: boolean;
}

/**
 * The branch section of the sidebar, from one list both levels read. The
 * organization screens draw it too (ADR 129), so opening the gym no longer
 * swaps the whole menu out. They pass no badges: a count needs the branch
 * scope those screens never open.
 */
function branchNavItems(
  branch: BranchNav,
  badges: {
    students?: NavBadge;
    coaches?: NavBadge;
    claims?: NavBadge;
    unread?: NavBadge;
  } = {},
): NavItem[] {
  const isOwner = runsBranch(branch);
  const isStaff = isStaffOf(branch);
  const isPending = branch.status === "pending";
  return [
    {
      path: "/",
      label: isStaff ? "Dashboard" : "Schedule",
      icon: isStaff ? <DashboardIcon /> : <ScheduleIcon />,
      show: true,
    },
    {
      path: "/training",
      label: "My classes",
      icon: <TrainingIcon />,
      show: !isStaff,
    },
    {
      path: "/schedule",
      label: "Schedule",
      icon: <ScheduleIcon />,
      show: canVisit("/schedule", branch),
    },
    {
      path: "/members",
      label: "Roster",
      icon: <MembersIcon />,
      show: canVisit("/members", branch),
      badge: badges.students,
    },
    {
      path: "/coaches",
      label: "Coaches",
      icon: <CoachesIcon />,
      show: canVisit("/coaches", branch),
      badge: isOwner ? badges.coaches : undefined,
    },
    {
      path: "/referrals",
      label: "Referrals",
      icon: <ReferralsIcon />,
      show: canVisit("/referrals", branch),
    },
    {
      path: "/payments",
      label: "Membership",
      icon: <PaymentsIcon />,
      show: !isStaff,
    },
    {
      path: "/settings",
      label: "Branch settings",
      icon: <SettingsIcon />,
      show: canVisit("/settings", branch),
    },
    {
      path: "/notifications",
      label: "Notifications",
      icon: <NotificationsIcon />,
      show: !isPending,
      badge: badges.unread,
    },
    {
      path: "/profile",
      label: "Profile",
      icon: <ProfileIcon />,
      show: !isStaff,
    },
  ]
    .filter((i) => i.show)
    .map((i) => ({ ...i, href: entityHref(branch.id, i.path) }));
}

/**
 * The owner/instructor web shell (IA ticket 02). Fetches the active academy:
 * while it loads → the mat loader; if the user has no academy → onboarding (no
 * chrome); otherwise the shell wraps the routed screen and puts the resolved
 * academy in context, so no screen under it re-fetches or re-tests it.
 * `routes.ts` says who may open which path: the sidebar hides what a person
 * cannot use and the shell refuses to render it if they type the URL anyway.
 * That is convenience, not security. The tRPC tier is the guard.
 *
 * The frame itself is `ShellFrame`, which the organization shell draws too
 * (ADR 127). Everything academy-shaped stays here: the badges, the dues strip
 * and the route guard.
 */
type NavigationSummary = RouterOutputs["stats"]["navigationSummary"];
type NavigationCount =
  NavigationSummary["counts"][keyof NavigationSummary["counts"]];

function badgeFor(
  status: "pending" | "error" | "success",
  count: NavigationCount | undefined,
): NavBadge {
  if (status === "pending") return { state: "loading" };
  if (status === "error") return { state: "error" };
  return count ?? { state: "unavailable" };
}

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const organization = useOrganization();
  const routeEntityId = entityFromPath(pathname);
  const organizationRoute = routeEntityId === null;
  const queryBranchId = searchParams.get("branch");
  const routeBranch = routeEntityId
    ? organization.entities.find((entity) => entity.id === routeEntityId)
    : undefined;
  const selectedBranch = organizationRoute
    ? (organization.entities.find((entity) => entity.id === queryBranchId) ??
      organization.entities[0])
    : routeBranch;

  useEffect(() => {
    if (!organizationRoute) return;
    const next = new URLSearchParams(searchParams.toString());
    if (selectedBranch) next.set("branch", selectedBranch.id);
    else next.delete("branch");
    if (next.toString() === searchParams.toString()) return;
    router.replace(`${pathname}${next.size > 0 ? `?${next}` : ""}`);
  }, [organizationRoute, pathname, router, searchParams, selectedBranch]);

  const current = useQuery({
    ...trpc.academy.current.queryOptions(),
    enabled: routeEntityId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 10000 : false,
  });
  const summary = useQuery(
    trpc.stats.navigationSummary.queryOptions({
      organizationId: organization.organizationId,
      branchId: selectedBranch?.id ?? null,
    }),
  );
  const summaryStatus = summary.isPending
    ? "pending"
    : summary.isError
      ? "error"
      : "success";
  let content = children;
  if (routeEntityId) {
    if (current.isPending) {
      content = <PageLoader label="Opening your branch" />;
    } else if (current.isError) {
      content = (
        <div className="mx-auto w-full max-w-md p-8">
          <ErrorState
            label="your branch"
            onRetry={() => void current.refetch()}
          />
        </div>
      );
    } else if (!current.data) {
      content = (
        <div className="mx-auto w-full max-w-md p-8">
          <NoAccessState />
        </div>
      );
    }
  }

  const chrome = (
    <ShellChrome
      user={user}
      pathname={pathname}
      organizationRoute={organizationRoute}
      selectedBranch={selectedBranch}
      academy={routeEntityId ? current.data : undefined}
      summary={summary.data}
      summaryStatus={summaryStatus}
    >
      {content}
    </ShellChrome>
  );

  return routeEntityId && current.data ? (
    <EntityProvider entity={current.data}>{chrome}</EntityProvider>
  ) : (
    chrome
  );
}

function ShellChrome({
  user,
  pathname,
  organizationRoute,
  selectedBranch,
  academy,
  summary,
  summaryStatus,
  children,
}: {
  user: { name: string; email: string };
  pathname: string;
  organizationRoute: boolean;
  selectedBranch:
    ReturnType<typeof useOrganization>["entities"][number] | undefined;
  academy: RouterOutputs["academy"]["current"] | undefined;
  summary: NavigationSummary | undefined;
  summaryStatus: "pending" | "error" | "success";
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const organization = useOrganization();
  const [addingBranch, setAddingBranch] = useState(false);
  const activeBranch = academy ?? selectedBranch;
  const entityId = academy?.academyId ?? selectedBranch?.id;
  const within = organizationRoute ? pathname : pathWithinEntity(pathname);
  const isStaff = activeBranch ? isStaffOf(activeBranch) : false;
  const isPending = activeBranch?.status === "pending";
  const branch = activeBranch
    ? {
        ...activeBranch,
        id: entityId ?? "",
        referralsEnabled: organization.referralsEnabled,
      }
    : undefined;
  const counts = summary?.counts;
  const unreadBadge = badgeFor(summaryStatus, counts?.unread);
  const unreadCount =
    unreadBadge.state === "ready" ? unreadBadge.count : undefined;
  const memberships = useQuery({
    ...trpc.accessPlan.mine.queryOptions(),
    enabled:
      !!academy && !isStaff && isActiveMember({ status: academy.status }),
  });
  const warning = memberships.data?.memberships.find(
    (item) => item.warning,
  )?.warning;
  const duesStrip = warning?.detail ?? null;
  const duesStripLocked = warning?.verdict === "blocked";
  const branchItems = branch
    ? branchNavItems(branch, {
        students: badgeFor(summaryStatus, counts?.roster),
        coaches: badgeFor(summaryStatus, counts?.coaches),
        claims: badgeFor(summaryStatus, counts?.branchClaims),
        unread: unreadBadge,
      }).map((item) => ({
        ...item,
        path: `branch:${item.path}`,
      }))
    : [];
  const gymItems: NavItem[] = [
    {
      path: "/overview",
      label: "Gym overview",
      icon: <DashboardIcon />,
    },
    {
      path: "/people",
      label: "People",
      icon: <MembersIcon />,
      badge: badgeFor(summaryStatus, counts?.people),
    },
    {
      path: "/memberships",
      label: "Memberships",
      icon: <PaymentsIcon />,
      badge: badgeFor(summaryStatus, counts?.memberships),
    },
    {
      path: "/settings",
      label: "Gym settings",
      icon: <SettingsIcon />,
    },
  ].map((item) => ({
    ...item,
    show: organization.canRunOrganization,
    group: branchItems.length > 0 ? GYM_GROUP : undefined,
    href: organizationHref(item.path, selectedBranch?.id),
    path: `gym:${item.path}`,
  }));
  const items = [
    ...branchItems,
    ...gymItems.filter((item) => item.show),
    ...(organization.canCreateBranches
      ? [
          {
            path: "gym:add-branch",
            href: "#add-branch",
            label: "Add branch",
            icon: <PlusIcon />,
            show: true,
            group: GYM_GROUP,
            onSelect: () => setAddingBranch(true),
          },
        ]
      : []),
  ];
  const isCurrent = (path: string) => {
    if (path.startsWith("gym:")) {
      const target = path.slice(4);
      return (
        organizationRoute &&
        (pathname === target || pathname.startsWith(`${target}/`))
      );
    }
    if (path.startsWith("branch:")) {
      if (organizationRoute) return false;
      const target = path.slice(7);
      return target === "/"
        ? within === "/"
        : within === target || within.startsWith(`${target}/`);
    }
    return false;
  };
  const columnClass = `mx-auto w-full ${
    organizationRoute ? "max-w-6xl" : contentWidth(within, isStaff)
  } px-6 md:px-8`;
  const href = (path: string) =>
    entityId ? entityHref(entityId, path) : organizationHref("/overview");

  return (
    <ShellFrame
      items={items}
      isCurrent={isCurrent}
      homeHref={
        organizationRoute
          ? organizationHref("/overview", selectedBranch?.id)
          : href("/")
      }
      profileHref={entityId ? href("/profile") : "/profile"}
      selector={
        <EntitySelector
          organization={organization}
          activeId={selectedBranch?.id}
          organizationRoute={organizationRoute}
        />
      }
      user={user}
      roleLabel={
        isPending ? "pending" : (activeBranch?.role ?? organization.role)
      }
      columnClass={columnClass}
      sidebarExtra={
        academy && isStaff ? (
          <ShareLinksDialog
            trigger={
              <button
                type="button"
                className="text-sidebar-foreground hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors"
              >
                <ShareIcon />
                Send someone a link
              </button>
            }
          />
        ) : undefined
      }
      headerExtra={
        academy ? (
          <>
            {isStaff && (
              <ShareLinksDialog
                trigger={
                  <button
                    type="button"
                    aria-label="Send someone a link"
                    className="text-muted-foreground hover:text-foreground flex size-11 shrink-0 items-center justify-center rounded-md transition-colors"
                  >
                    <ShareIcon />
                  </button>
                }
              />
            )}
            {!isPending && (
              <Link
                href={href("/notifications")}
                aria-label={
                  unreadCount === undefined
                    ? "Notifications, count unavailable"
                    : unreadCount > 0
                      ? `Notifications, ${unreadCount} unread`
                      : "Notifications"
                }
                aria-current={
                  isCurrent("branch:/notifications") ? "page" : undefined
                }
                className={`relative flex size-11 shrink-0 items-center justify-center rounded-md transition-colors ${
                  isCurrent("branch:/notifications")
                    ? "text-brand-strong"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <NotificationsIcon />
                {unreadCount !== undefined && unreadCount > 0 && (
                  <span className="bg-error absolute top-1 right-1 size-2 rounded-full" />
                )}
              </Link>
            )}
          </>
        ) : undefined
      }
      banners={
        academy ? (
          <>
            {isPending && (
              <div className="border-brand/25 bg-brand-wash text-brand-strong border-b">
                <p className={`${columnClass} py-2.5 text-sm`}>
                  Waiting for branch approval. You can browse classes and
                  memberships, but booking is not available yet.
                </p>
              </div>
            )}
            {duesStrip && (
              <Link
                href={href("/payments")}
                className={`block border-b transition-colors ${
                  duesStripLocked
                    ? "border-error/25 bg-error/10 hover:bg-error/15"
                    : "border-warning/25 bg-warning/10 hover:bg-warning/15"
                }`}
              >
                <span className={`${columnClass} block py-2.5 text-sm`}>
                  {duesStrip}
                </span>
              </Link>
            )}
          </>
        ) : undefined
      }
    >
      {academy && !canVisit(within, academy) ? <NoAccessState /> : children}
      <AddBranchDialog
        open={addingBranch}
        onOpenChange={setAddingBranch}
        canCreateGeneralBranches={organization.canCreateGeneralBranches}
        branches={organization.entities}
      />
    </ShellFrame>
  );
}
