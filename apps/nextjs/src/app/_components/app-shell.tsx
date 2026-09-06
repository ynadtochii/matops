"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  bookingAccessMessage,
  canVisit,
  entityFromPath,
  entityHref,
  isActiveMember,
  isPendingCoach,
  isStaff as isStaffOf,
  pathWithinEntity,
  runsBranch,
} from "@matops/domain";

import type { NavItem } from "./shell-frame";
import { useTRPC } from "~/trpc/react";
import {
  EntityProvider,
  useEntity,
  useOrganization,
  useRememberBranch,
} from "./entity";
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

export const GYM_GROUP = "Organization";

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

export interface BranchNav {
  id: string;
  type: string;
  role: string;
  status: string;
  membershipEnforced?: boolean;
  hasLegacyDues?: boolean;
}

/**
 * The branch section of the sidebar, from one list both levels read. The
 * organization screens draw it too (ADR 129), so opening the gym no longer
 * swaps the whole menu out. They pass no badges: a count needs the branch
 * scope those screens never open.
 */
export function branchNavItems(
  branch: BranchNav,
  badges: {
    students?: number;
    coaches?: number;
    claims?: number;
    unread?: number;
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
      badge: badges.students ?? 0,
    },
    {
      path: "/coaches",
      label: "Coaches",
      icon: <CoachesIcon />,
      show: canVisit("/coaches", branch),
      badge: isOwner ? (badges.coaches ?? 0) : 0,
    },
    {
      path: "/referrals",
      label: "Referrals",
      icon: <ReferralsIcon />,
      show: canVisit("/referrals", branch),
    },
    {
      path: "/payments",
      label: isOwner
        ? "Payments"
        : branch.membershipEnforced
          ? "Membership"
          : "Dues",
      icon: <PaymentsIcon />,
      // An activated branch has no owner Payments screen: its plans, dues and
      // claims belong to the gym, and Memberships is where they live (ADR 127).
      // A branch opened after the cutover never ran branch dues at all, so it
      // has no Payments screen even switched off (ADR 128): `hasLegacyDues`
      // says whether there is a history to show.
      show:
        (isOwner &&
          !branch.membershipEnforced &&
          branch.hasLegacyDues === true) ||
        !isStaff,
      badge: isOwner ? (badges.claims ?? 0) : 0,
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
      badge: badges.unread ?? 0,
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
export function AppShell({
  entityId: fromLayout,
  user,
  children,
}: {
  entityId: string;
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const pathname = usePathname();
  // The URL wins over the prop: a soft navigation can reuse this layout, and
  // then the prop still names the branch you left while the router has moved on.
  const entityId = entityFromPath(pathname) ?? fromLayout;
  const current = useQuery({
    ...trpc.academy.current.queryOptions(),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 10000 : false,
  });

  // Boot: no chrome to mirror yet, and the answer may be the shell or the gate,
  // so a skeleton would draw a layout that half the time never arrives (ADR 80).
  if (current.isPending) {
    return <PageLoader label="Opening your branch" />;
  }

  if (current.isError) {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <ErrorState
          label="your branch"
          onRetry={() => void current.refetch()}
        />
      </div>
    );
  }

  // The URL names an academy this person cannot open. The tRPC tier refuses it
  // anyway; this is the readable version of the same answer.
  if (!current.data) {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <NoAccessState />
      </div>
    );
  }

  return (
    <EntityProvider entity={current.data}>
      <ShellChrome entityId={entityId} user={user} pathname={pathname}>
        {children}
      </ShellChrome>
    </EntityProvider>
  );
}

function ShellChrome({
  entityId,
  user,
  pathname,
  children,
}: {
  entityId: string;
  user: { name: string; email: string };
  pathname: string;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const academy = useEntity();
  const organization = useOrganization();
  const [addingBranch, setAddingBranch] = useState(false);
  useRememberBranch(entityId);
  const href = (path: string) => entityHref(entityId, path);
  const within = pathWithinEntity(pathname);
  const { academyId: activeId, role, status } = academy;
  const isOwner = runsBranch(academy);
  const isStaff = isStaffOf(academy);
  const isPending = status === "pending";
  // Staff badges: student requests sit on the Roster, coach requests on Coaches —
  // same split as the two screens (ADR 64). Dedupes with their own queries.
  // An instructor sees the student queue (ADR 75), never the coach one.
  const memberList = useQuery({
    ...trpc.membership.members.queryOptions({ audience: "all" }),
    enabled: isStaff,
  });
  const waiting = memberList.data?.filter((m) => m.status === "pending") ?? [];
  const pendingCoachCount = waiting.filter(isPendingCoach).length;
  const pendingStudentCount = waiting.length - pendingCoachCount;

  // Payments badge: how many "I paid" claims are waiting for the owner (ADR 40).
  // Only on a branch still running its own dues: an activated one has no
  // Payments screen and its claims live at the organization level (ADR 127).
  const claims = useQuery({
    ...trpc.payments.claims.queryOptions(),
    enabled: isOwner && !academy.membershipEnforced && academy.hasLegacyDues,
  });
  const claimsCount = claims.data?.length ?? 0;

  // Inbox badge: unread notifications for this member in this academy (ADR 77).
  const unread = useQuery({
    ...trpc.notification.unreadCount.queryOptions(),
    enabled: !isPending,
  });
  const unreadCount = unread.data ?? 0;

  const myDues = useQuery({
    ...trpc.payments.myDues.queryOptions(),
    enabled: !isStaff && isActiveMember({ status }),
  });
  const access = myDues.data?.access;
  const gateMessage = access ? bookingAccessMessage(access) : null;
  const overdue = myDues.data?.dues?.status === "overdue";
  const duesStrip =
    gateMessage ??
    (overdue ? "Membership payment overdue — tap to pay." : null);
  const duesStripLocked = access?.state === "locked";

  const items = branchNavItems(
    { ...academy, id: entityId },
    {
      students: pendingStudentCount,
      coaches: pendingCoachCount,
      claims: claimsCount,
      unread: unreadCount,
    },
  );

  // The gym's own screens, beside the branch rather than behind a second menu
  // (ADR 129). Same paths the organization shell draws, so a link is a link
  // and nothing here sends `x-matops-entity`.
  const gymItems: NavItem[] = [
    {
      path: "/overview",
      label: "Organization overview",
      icon: <DashboardIcon />,
    },
    { path: "/people", label: "People", icon: <MembersIcon /> },
    { path: "/memberships", label: "Memberships", icon: <PaymentsIcon /> },
    {
      path: "/settings",
      label: "Organization settings",
      icon: <SettingsIcon />,
    },
  ].map((i) => ({
    ...i,
    show: organization.canRunOrganization,
    group: GYM_GROUP,
    href: i.path,
    // Namespaced so `isCurrent`, which reads the path within the branch, can
    // never light up "Organization settings" because you are on the branch's own.
    path: `gym:${i.path}`,
  }));

  const isCurrent = (path: string) =>
    path === "/" ? within === "/" : within.startsWith(path);

  const columnClass = `mx-auto w-full ${contentWidth(within, isStaff)} px-6 md:px-8`;

  return (
    <ShellFrame
      items={[
        ...items,
        ...gymItems.filter((i) => i.show),
        // The selector hides itself at a gym with one branch, so this is the
        // only way an owner opens a second one (ADR 129).
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
      ]}
      isCurrent={isCurrent}
      homeHref={href("/")}
      profileHref={href("/profile")}
      selector={
        <EntitySelector organization={organization} activeId={activeId} />
      }
      user={user}
      roleLabel={isPending ? "pending" : role}
      columnClass={columnClass}
      sidebarExtra={
        isStaff && (
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
        )
      }
      headerExtra={
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
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              aria-current={isCurrent("/notifications") ? "page" : undefined}
              className={`relative flex size-11 shrink-0 items-center justify-center rounded-md transition-colors ${
                isCurrent("/notifications")
                  ? "text-brand-strong"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <NotificationsIcon />
              {unreadCount > 0 && (
                <span className="bg-error absolute top-1 right-1 size-2 rounded-full" />
              )}
            </Link>
          )}
        </>
      }
      banners={
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
      }
    >
      {canVisit(within, academy) ? children : <NoAccessState />}
      <AddBranchDialog
        open={addingBranch}
        onOpenChange={setAddingBranch}
        canCreateGeneralBranches={organization.canCreateGeneralBranches}
        branches={organization.entities}
      />
    </ShellFrame>
  );
}
