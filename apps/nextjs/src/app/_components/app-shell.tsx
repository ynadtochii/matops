"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  bookingAccessMessage,
  isActiveMember,
  isOwner as isOwnerOf,
  isPendingCoach,
  isStaff as isStaffOf,
} from "@matops/domain";
import { Logo } from "@matops/ui/logo";
import { ThemeToggle } from "@matops/ui/theme";

import { useTRPC } from "~/trpc/react";
import { AcademyProvider, useAcademy } from "./academy";
import { AcademyGate } from "./academy-gate";
import { AcademySwitcher } from "./academy-switcher";
import { FeedbackLink } from "./feedback-link";
import { PageLoader } from "./mat-loader";
import { canVisit } from "./routes";
import { SignOutButton } from "./sign-out";
import { ErrorState, NoAccessState } from "./states";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  show: boolean;
  badge?: number;
}

const iconClass = "size-[18px] shrink-0";

const NARROW_ROUTES = ["/class", "/profile"];

function contentWidth(pathname: string, isStaff: boolean): string {
  if (pathname.startsWith("/schedule")) return "max-w-[1600px]";
  if (!isStaff || NARROW_ROUTES.some((r) => pathname.startsWith(r))) {
    return "max-w-3xl";
  }
  return "max-w-6xl";
}

/** Two-letter avatar fallback: initials of the first two name words, else the
 * first two letters of the name, else the email — never blank. */
function initials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const second = words[1];
  if (first && second) {
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  if (first) return first.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

const DashboardIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </svg>
);
const ScheduleIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </svg>
);
const TrainingIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M5.5 8.5l2 2 3.5-4" />
  </svg>
);
const NotificationsIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <path d="M4 6.5a4 4 0 018 0c0 3 1 4 1 4H3s1-1 1-4z" />
    <path d="M6.5 13a1.5 1.5 0 003 0" />
  </svg>
);
const ProfileIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <circle cx="8" cy="5.5" r="2.5" />
    <path d="M3 13.5c0-2.2 2.2-3.5 5-3.5s5 1.3 5 3.5" />
  </svg>
);
const MembersIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <circle cx="6" cy="6" r="2.4" />
    <path d="M2 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M11 5.2a2.2 2.2 0 010 4.2M12.5 13.5c0-1.7-.9-2.9-2.2-3.3" />
  </svg>
);
const SettingsIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <path d="M3 5h1.3M7.7 5h5.3M3 11h5.3M11.7 11h1.3" />
    <circle cx="6" cy="5" r="1.7" />
    <circle cx="10" cy="11" r="1.7" />
  </svg>
);
const PaymentsIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <rect x="2" y="4" width="12" height="8" rx="1.5" />
    <path d="M2 7h12" />
  </svg>
);
const ReferralsIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <circle cx="4" cy="5" r="2" />
    <circle cx="12" cy="5" r="2" />
    <circle cx="8" cy="12" r="2" />
    <path d="M5.7 6.2l1.2 3.6M10.3 6.2L9.1 9.8" />
  </svg>
);

const CoachesIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <path d="M2.5 13V9M6.5 13V5.5M10.5 13v-3M14.5 13V3" />
  </svg>
);

/**
 * The owner/instructor web shell (IA ticket 02). A sidebar on desktop + a
 * bottom-tab bar on mobile, driven by one role-aware nav config. Fetches the
 * active academy: while it loads → the mat loader; if the user has no academy →
 * onboarding (no chrome); otherwise the shell wraps the routed screen and puts
 * the resolved academy in context, so no screen under it re-fetches or re-tests
 * it. `routes.ts` says who may open which path: the sidebar hides what a person
 * cannot use and the shell refuses to render it if they type the URL anyway.
 * That is convenience, not security. The tRPC tier is the guard.
 */
export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const pathname = usePathname();
  const current = useQuery(trpc.academy.current.queryOptions());
  const mine = useQuery(trpc.academy.memberships.queryOptions());

  // Boot: no chrome to mirror yet, and the answer may be the shell or the gate,
  // so a skeleton would draw a layout that half the time never arrives (ADR 80).
  if (current.isPending || mine.isPending) {
    return <PageLoader label="Opening your academy" />;
  }

  if (current.isError || mine.isError) {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <ErrorState
          label="your academy"
          onRetry={() => {
            void current.refetch();
            void mine.refetch();
          }}
        />
      </div>
    );
  }

  const academies = mine.data.map((a) => ({
    academyId: a.academyId,
    name: a.name,
  }));

  // No active academy → the post-login gate decides where to land (ADR 49):
  // open the one academy, pick among several, or join a new one by code.
  if (!current.data) {
    return <AcademyGate />;
  }

  return (
    <AcademyProvider academy={current.data}>
      <ShellChrome academies={academies} user={user} pathname={pathname}>
        {children}
      </ShellChrome>
    </AcademyProvider>
  );
}

function ShellChrome({
  academies,
  user,
  pathname,
  children,
}: {
  academies: { academyId: string; name: string }[];
  user: { name: string; email: string };
  pathname: string;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const academy = useAcademy();
  const { name: academyName, academyId: activeId, role, status } = academy;
  const isOwner = isOwnerOf(academy);
  const isStaff = isStaffOf(academy);
  const isPending = status === "pending";
  // Staff badges: student requests sit on Members, coach requests on Coaches —
  // same split as the two screens (ADR 64). Dedupes with their own queries.
  // An instructor sees the student queue (ADR 75), never the coach one.
  const memberList = useQuery({
    ...trpc.membership.members.queryOptions(),
    enabled: isStaff,
  });
  const waiting = memberList.data?.filter((m) => m.status === "pending") ?? [];
  const pendingCoachCount = waiting.filter(isPendingCoach).length;
  const pendingStudentCount = waiting.length - pendingCoachCount;

  // Payments badge: how many "I paid" claims are waiting for the owner (ADR 40).
  const claims = useQuery({
    ...trpc.payments.claims.queryOptions(),
    enabled: isOwner,
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

  const items: NavItem[] = [
    {
      href: "/",
      label: isStaff ? "Dashboard" : "Schedule",
      icon: isStaff ? <DashboardIcon /> : <ScheduleIcon />,
      show: true,
    },
    {
      href: "/training",
      label: "My classes",
      icon: <TrainingIcon />,
      show: !isStaff,
    },
    {
      href: "/schedule",
      label: "Schedule",
      icon: <ScheduleIcon />,
      show: canVisit("/schedule", academy),
    },
    {
      href: "/members",
      label: "Members",
      icon: <MembersIcon />,
      show: canVisit("/members", academy),
      badge: pendingStudentCount,
    },
    {
      href: "/coaches",
      label: "Coaches",
      icon: <CoachesIcon />,
      show: canVisit("/coaches", academy),
      badge: isOwner ? pendingCoachCount : 0,
    },
    {
      href: "/referrals",
      label: "Referrals",
      icon: <ReferralsIcon />,
      show: canVisit("/referrals", academy),
    },
    {
      href: "/payments",
      label: isOwner ? "Payments" : "Dues",
      icon: <PaymentsIcon />,
      show: isOwner || (!isStaff && !isPending),
      badge: isOwner ? claimsCount : 0,
    },
    {
      href: "/settings",
      label: "Settings",
      icon: <SettingsIcon />,
      show: canVisit("/settings", academy),
    },
    {
      href: "/notifications",
      label: "Notifications",
      icon: <NotificationsIcon />,
      show: !isPending,
      badge: unreadCount,
    },
    {
      href: "/profile",
      label: "Profile",
      icon: <ProfileIcon />,
      show: !isStaff,
    },
  ].filter((i) => i.show);

  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Phones reach the feed from the header bell, so it never spends a tab slot.
  const tabItems = items.filter((i) => i.href !== "/notifications");

  const columnClass = `mx-auto w-full ${contentWidth(pathname, isStaff)} px-6 md:px-8`;

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar — pinned full height, never scrolls */}
      <aside className="bg-sidebar border-sidebar-border hidden h-full w-60 shrink-0 flex-col overflow-hidden border-r p-3 md:flex">
        <Link href="/" className="flex items-center gap-2 px-2 pt-1 pb-4">
          <Logo size={22} />
        </Link>

        <div className="mb-3 px-1">
          {academies.length >= 2 ? (
            <AcademySwitcher academies={academies} activeId={activeId} />
          ) : (
            <p className="text-sidebar-foreground px-1 text-sm font-medium">
              {academyName}
            </p>
          )}
        </div>

        {items.length > 1 && (
          <nav aria-label="Primary" className="flex flex-col gap-0.5">
            {items.map((i) => (
              <NavLink key={i.href} item={i} active={isCurrent(i.href)} />
            ))}
          </nav>
        )}

        <div className="border-sidebar-border mt-auto space-y-2 border-t pt-3">
          <Link
            href="/profile"
            aria-current={isCurrent("/profile") ? "page" : undefined}
            className={`flex items-center gap-2 rounded-md p-1 transition-colors ${
              isCurrent("/profile") ? "bg-brand-wash" : "hover:bg-muted"
            }`}
          >
            <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase">
              {initials(user.name, user.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="text-muted-foreground font-mono text-[10px] capitalize">
                {isPending ? "pending" : role}
              </p>
            </div>
          </Link>
          <FeedbackLink />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar — top padding clears the status-bar notch when installed
            as a PWA (viewport-fit=cover; ADR 42). env() is 0 elsewhere. */}
        <header className="bg-sidebar border-sidebar-border flex items-center gap-2 border-b px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 md:hidden">
          <Link href="/" aria-label="Home">
            <Logo size={22} withWordmark={false} />
          </Link>
          <div className="min-w-0 flex-1">
            {academies.length >= 2 ? (
              <AcademySwitcher academies={academies} activeId={activeId} />
            ) : (
              <span className="block truncate text-sm font-medium">
                {academyName}
              </span>
            )}
          </div>
          <ThemeToggle />
          {!isPending && (
            <Link
              href="/notifications"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              aria-current={isCurrent("/notifications") ? "page" : undefined}
              className={`relative flex size-8 shrink-0 items-center justify-center rounded-md transition-colors ${
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
          <Link
            href="/profile"
            aria-label="Profile"
            aria-current={isCurrent("/profile") ? "page" : undefined}
            className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase"
          >
            {initials(user.name, user.email)}
          </Link>
          <SignOutButton iconOnly />
        </header>

        {isPending && (
          <div className="border-brand/25 bg-brand-wash text-brand-strong border-b">
            <p className={`${columnClass} py-2.5 text-sm`}>
              Pending approval — your academy owner will confirm you soon.
            </p>
          </div>
        )}

        {duesStrip && (
          <Link
            href="/payments"
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

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={`${columnClass} pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pt-8 md:pb-8`}
          >
            {canVisit(pathname, academy) ? children : <NoAccessState />}
          </div>
        </main>
      </div>

      {/* Mobile bottom tabs — bottom padding clears the home indicator when
          installed as a PWA (viewport-fit=cover; ADR 42). env() is 0 elsewhere. */}
      {tabItems.length > 1 && (
        <nav
          aria-label="Primary"
          className="bg-sidebar border-sidebar-border fixed inset-x-0 bottom-0 z-20 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {tabItems.map((i) => {
            const active = isCurrent(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium tracking-tight ${
                  active ? "text-brand-strong" : "text-muted-foreground"
                }`}
              >
                <span className="relative">
                  {i.icon}
                  {!!i.badge && i.badge > 0 && (
                    <span className="bg-brand text-brand-foreground absolute -top-1.5 -right-2 flex min-w-4 items-center justify-center rounded-full px-1 py-px font-mono text-[10px] leading-none tabular-nums">
                      {i.badge > 9 ? "9+" : i.badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{i.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ${
        active
          ? "bg-brand-wash text-brand-strong font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {active && (
        <span className="bg-brand absolute top-1.5 bottom-1.5 -left-3 w-0.5 rounded-full" />
      )}
      {item.icon}
      <span className="flex-1">{item.label}</span>
      {!!item.badge && item.badge > 0 && (
        <span className="bg-brand text-brand-foreground rounded-full px-1.5 font-mono text-[10px]">
          {item.badge}
        </span>
      )}
    </Link>
  );
}
