"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarDays,
  ChartNoAxesColumn,
  CreditCard,
  LayoutGrid,
  SlidersHorizontal,
  User,
  Users,
} from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import {
  canVisit,
  entityFromPath,
  entityHref,
  isActiveMember,
  isStaff as isStaffOf,
  pathWithinEntity,
  runsBranch,
} from "@matops/domain";

import type { NavBadge, NavItem } from "./shell-frame";
import { useTRPC } from "~/trpc/react";
import { AcademyIcon } from "./avatar";
import {
  EntityProvider,
  useAnyBranchTakesPayment,
  useOrganization,
} from "./entity";
import { PageLoader } from "./mat-loader";
import { ShellFrame } from "./shell-frame";
import { ErrorState, NoAccessState } from "./states";

const NARROW_ROUTES = ["/class", "/profile"];

function contentWidth(pathname: string, isStaff: boolean): string {
  if (pathname.startsWith("/schedule")) return "max-w-[1600px]";
  if (!isStaff) {
    return pathname.startsWith("/class") ? "max-w-3xl" : "max-w-6xl";
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
  membershipEnforced: boolean;
}

/** The academy's sidebar items. */
function branchNavItems(
  branch: BranchNav,
  badges: {
    students?: NavBadge;
    coaches?: NavBadge;
  } = {},
): NavItem[] {
  const isOwner = runsBranch(branch);
  const isStaff = isStaffOf(branch);
  return [
    {
      path: "/",
      label: isStaff ? "Dashboard" : "Schedule",
      icon: isStaff ? <LayoutGrid aria-hidden /> : <CalendarDays aria-hidden />,
      show: true,
    },
    {
      path: "/training",
      label: "My classes",
      icon: <CalendarCheck aria-hidden />,
      show: !isStaff,
    },
    {
      path: "/schedule",
      label: "Schedule",
      icon: <CalendarDays aria-hidden />,
      show: canVisit("/schedule", branch),
    },
    {
      path: "/members",
      label: "Students",
      icon: <Users aria-hidden />,
      show: canVisit("/members", branch),
      badge: badges.students,
    },
    {
      path: "/coaches",
      label: "Coaches",
      icon: <ChartNoAxesColumn aria-hidden />,
      show: canVisit("/coaches", branch),
      badge: isOwner ? badges.coaches : undefined,
    },
    {
      path: "/payments",
      label: "Membership",
      icon: <CreditCard aria-hidden />,
      show: !isStaff && branch.membershipEnforced,
    },
    {
      path: "/settings",
      label: "Settings",
      icon: <SlidersHorizontal aria-hidden />,
      show: canVisit("/settings", branch),
    },
    {
      path: "/profile",
      label: "Profile",
      icon: <User aria-hidden />,
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
  const organization = useOrganization();
  const routeEntityId = entityFromPath(pathname);
  const selectedBranch = routeEntityId
    ? organization.entities.find((entity) => entity.id === routeEntityId)
    : organization.entities[0];

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
      content = <PageLoader label="Opening your gym" />;
    } else if (current.isError) {
      content = (
        <div className="mx-auto w-full max-w-md p-8">
          <ErrorState label="your gym" onRetry={() => void current.refetch()} />
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
  selectedBranch,
  academy,
  summary,
  summaryStatus,
  children,
}: {
  user: { name: string; email: string };
  pathname: string;
  selectedBranch:
    ReturnType<typeof useOrganization>["entities"][number] | undefined;
  academy: RouterOutputs["academy"]["current"] | undefined;
  summary: NavigationSummary | undefined;
  summaryStatus: "pending" | "error" | "success";
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const organization = useOrganization();
  const anyBranchTakesPayment = useAnyBranchTakesPayment();
  const activeBranch = academy ?? selectedBranch;
  const entityId = academy?.academyId ?? selectedBranch?.id;
  const within = pathWithinEntity(pathname);
  const isStaff = activeBranch ? isStaffOf(activeBranch) : false;
  const isPending = activeBranch?.status === "pending";
  const branch = activeBranch
    ? { ...activeBranch, id: entityId ?? "" }
    : undefined;
  const counts = summary?.counts;
  const memberships = useQuery({
    ...trpc.accessPlan.mine.queryOptions(),
    enabled:
      !!academy &&
      academy.membershipEnforced &&
      !isStaff &&
      isActiveMember({ status: academy.status }),
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
      })
    : [];
  const isSettings = (item: NavItem) => item.path === "/settings";
  const items: NavItem[] = [
    ...branchItems.filter((item) => !isSettings(item)),
    ...(organization.canRunOrganization && anyBranchTakesPayment
      ? [
          {
            path: "/memberships",
            href: "/memberships",
            label: "Memberships",
            icon: <CreditCard aria-hidden />,
            show: true,
            badge: badgeFor(summaryStatus, counts?.memberships),
          },
        ]
      : []),
    ...branchItems.filter(isSettings),
  ];
  const isCurrent = (path: string) =>
    path === "/"
      ? within === "/"
      : within === path || within.startsWith(`${path}/`);
  const columnClass = `mx-auto w-full ${contentWidth(
    within,
    isStaff,
  )} px-6 md:px-8`;
  const href = (path: string) => (entityId ? entityHref(entityId, path) : "/");

  return (
    <ShellFrame
      items={items}
      isCurrent={isCurrent}
      homeHref={href("/")}
      profileHref={entityId ? href("/profile") : "/profile"}
      brand={
        <>
          <AcademyIcon
            src={academy?.iconUrl}
            name={activeBranch?.name ?? "Your academy"}
            className="size-8 text-sm"
          />
          <span className="text-foreground truncate text-sm font-semibold md:text-base">
            {activeBranch?.name ?? "Your academy"}
          </span>
        </>
      }
      user={{ ...user, avatarUrl: academy?.avatarUrl ?? null }}
      branchLabel={activeBranch?.name}
      roleLabel={
        isPending ? "pending" : (activeBranch?.role ?? organization.role)
      }
      columnClass={columnClass}
      banners={
        academy ? (
          <>
            {isPending && (
              <div className="border-border bg-surface-1 text-foreground border-b">
                <p className={`${columnClass} py-2 text-sm font-medium`}>
                  Waiting for your gym to approve you. You can browse classes
                  {academy.membershipEnforced ? " and memberships" : ""}, but
                  booking is not available yet.
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
                <span
                  className={`${columnClass} text-foreground-secondary block py-2 text-sm`}
                >
                  {duesStrip}
                </span>
              </Link>
            )}
          </>
        ) : undefined
      }
    >
      <title>{activeBranch?.name ?? "MatOps"}</title>
      {academy && !canVisit(within, academy) ? <NoAccessState /> : children}
    </ShellFrame>
  );
}
