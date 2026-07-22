"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Logo } from "@matops/ui/logo";

import { useTRPC } from "~/trpc/react";
import { AcademySwitcher } from "./academy-switcher";
import { Onboarding } from "./onboarding";
import { SignOutButton } from "./sign-out";
import { ErrorState, SkeletonRows } from "./states";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  show: boolean;
  badge?: number;
}

const iconClass = "size-[18px] shrink-0";

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
const RosterIcon = () => (
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
const AttendanceIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <rect x="2" y="2" width="12" height="12" rx="2" />
    <path d="M5 8.2l2 2 4-4.4" />
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
    <path d="M3 5h10M3 11h10" />
    <circle cx="6" cy="5" r="1.7" fill="var(--sidebar)" />
    <circle cx="10" cy="11" r="1.7" fill="var(--sidebar)" />
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

/**
 * The owner/instructor web shell (IA ticket 02). A sidebar on desktop + a
 * bottom-tab bar on mobile, driven by one role-aware nav config. Fetches the
 * active academy: while it loads → a skeleton; if the user has no academy →
 * onboarding (no chrome); otherwise the shell wraps the routed screen. Nav
 * hiding is convenience only — every screen keeps its server-side role guard.
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
  const mine = useQuery(trpc.academy.listMine.queryOptions());

  if (current.isPending || mine.isPending) {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <SkeletonRows rows={5} />
      </div>
    );
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

  // No active academy → onboarding, no shell.
  if (!current.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Onboarding academies={academies} />
      </div>
    );
  }

  const c = current.data;
  const isActive = c.status === "active";
  const isOwner = c.role === "owner" && isActive;
  const isStaff = isActive && (c.role === "owner" || c.role === "instructor");
  const isPending = c.status === "pending";

  return (
    <ShellChrome
      academyName={c.name}
      academies={academies}
      activeId={c.academyId}
      isOwner={isOwner}
      isStaff={isStaff}
      isPending={isPending}
      role={c.role}
      user={user}
      pathname={pathname}
    >
      {children}
    </ShellChrome>
  );
}

function ShellChrome({
  academyName,
  academies,
  activeId,
  isOwner,
  isStaff,
  isPending,
  role,
  user,
  pathname,
  children,
}: {
  academyName: string;
  academies: { academyId: string; name: string }[];
  activeId: string;
  isOwner: boolean;
  isStaff: boolean;
  isPending: boolean;
  role: string;
  user: { name: string; email: string };
  pathname: string;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  // Owner badge: how many are waiting for approval. Dedupes with the Roster
  // screen's own query, so it costs nothing extra.
  const roster = useQuery({
    ...trpc.membership.roster.queryOptions(),
    enabled: isOwner,
  });
  const pendingCount =
    roster.data?.filter((m) => m.status === "pending").length ?? 0;

  // Payments badge: how many "I paid" claims are waiting for the owner (ADR 40).
  const claims = useQuery({
    ...trpc.payments.claims.queryOptions(),
    enabled: isOwner,
  });
  const claimsCount = claims.data?.length ?? 0;

  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: <DashboardIcon />, show: true },
    {
      href: "/schedule",
      label: "Schedule",
      icon: <ScheduleIcon />,
      show: isStaff,
    },
    {
      href: "/roster",
      label: "Roster",
      icon: <RosterIcon />,
      show: isOwner,
      badge: pendingCount,
    },
    {
      href: "/attendance",
      label: "Attendance",
      icon: <AttendanceIcon />,
      show: isStaff,
    },
    {
      href: "/payments",
      label: "Payments",
      icon: <PaymentsIcon />,
      show: isOwner,
      badge: claimsCount,
    },
    {
      href: "/settings",
      label: "Settings",
      icon: <SettingsIcon />,
      show: isOwner,
    },
  ].filter((i) => i.show);

  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="bg-sidebar border-sidebar-border hidden w-60 shrink-0 flex-col border-r p-3 md:flex">
        <div className="flex items-center gap-2 px-2 pt-1 pb-4">
          <Logo size={22} />
        </div>

        <div className="mb-3 px-1">
          {academies.length >= 2 ? (
            <AcademySwitcher academies={academies} activeId={activeId} />
          ) : (
            <p className="text-sidebar-foreground px-1 text-sm font-medium">
              {academyName}
            </p>
          )}
        </div>

        <nav className="flex flex-col gap-0.5">
          {items.map((i) => (
            <NavLink key={i.href} item={i} active={isCurrent(i.href)} />
          ))}
        </nav>

        <div className="border-sidebar-border mt-auto flex items-center gap-2 border-t pt-3">
          <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase">
            {user.name.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-muted-foreground font-mono text-[10px] capitalize">
              {isPending ? "pending" : role}
            </p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar — top padding clears the status-bar notch when installed
            as a PWA (viewport-fit=cover; ADR 42). env() is 0 elsewhere. */}
        <header className="bg-sidebar border-sidebar-border flex items-center justify-between border-b px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 md:hidden">
          <Logo size={20} />
          {academies.length >= 2 ? (
            <AcademySwitcher academies={academies} activeId={activeId} />
          ) : (
            <span className="text-sm font-medium">{academyName}</span>
          )}
        </header>

        {isPending && (
          <div className="border-brand/25 bg-brand-wash text-brand-strong border-b px-6 py-2.5 text-sm">
            Pending approval — your academy owner will confirm you soon.
          </div>
        )}

        <main className="mx-auto w-full max-w-5xl flex-1 p-6 pb-24 md:p-8 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs — bottom padding clears the home indicator when
          installed as a PWA (viewport-fit=cover; ADR 42). env() is 0 elsewhere. */}
      <nav className="bg-sidebar border-sidebar-border fixed inset-x-0 bottom-0 z-20 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2 font-mono text-[9px] tracking-wide uppercase ${
              isCurrent(i.href) ? "text-brand-strong" : "text-muted-foreground"
            }`}
          >
            {i.icon}
            {i.label}
            {!!i.badge && i.badge > 0 && (
              <span className="bg-brand text-brand-foreground absolute top-1 right-1/2 mr-1 translate-x-full rounded-full px-1 text-[8px]">
                {i.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
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
