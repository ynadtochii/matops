"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matops/ui/dropdown-menu";
import { Logo } from "@matops/ui/logo";
import { ThemeToggle } from "@matops/ui/theme";

import { FeedbackLink } from "./feedback-link";
import { SignOutButton } from "./sign-out";

export interface NavItem {
  path: string;
  href: string;
  label: string;
  icon: ReactNode;
  show: boolean;
  badge?: number;
}

const iconClass = "size-[18px] shrink-0";

const MAX_TABS = 5;

/** Two-letter avatar fallback: initials of the first two name words, else the
 * first two letters of the name, else the email — never blank. */
export function initials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const second = words[1];
  if (first && second) {
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  if (first) return first.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export const DashboardIcon = () => (
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
export const ScheduleIcon = () => (
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
export const TrainingIcon = () => (
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
export const NotificationsIcon = () => (
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
export const ProfileIcon = () => (
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
export const MembersIcon = () => (
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
export const SettingsIcon = () => (
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
export const PaymentsIcon = () => (
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
export const ReferralsIcon = () => (
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

export const CoachesIcon = () => (
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

const MoreIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    className={iconClass}
  >
    <path d="M3 5.5h10M3 10.5h10" />
  </svg>
);

export const ShareIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={iconClass}
  >
    <path d="M13 8.5V13a1 1 0 01-1 1H4a1 1 0 01-1-1V8.5" />
    <path d="M8 10V2M5 5l3-3 3 3" />
  </svg>
);

export interface ShellFrameProps {
  /** Already filtered by `show` and given an `href`. */
  items: NavItem[];
  isCurrent: (path: string) => boolean;
  homeHref: string;
  profileHref: string;
  selector: ReactNode;
  user: { name: string; email: string };
  /** The word under the name in the footer: a role, or "pending". */
  roleLabel: string;
  columnClass: string;
  /** Sidebar footer extras: the share-links dialog at a branch. */
  sidebarExtra?: ReactNode;
  /** Mobile header extras between the selector and the avatar. */
  headerExtra?: ReactNode;
  /** Full-width strips under the header: pending approval, dues. */
  banners?: ReactNode;
  children: ReactNode;
}

/**
 * The shell both levels draw (IA ticket 02, ADR 127). A sidebar on desktop and
 * a bottom-tab bar on mobile, from one list of items.
 *
 * It knows nothing about academies or organizations: the caller decides what
 * the items are, who may see them and what a badge counts. That is what lets
 * the branch screens and the organization screens share one frame instead of
 * two copies that drift.
 */
export function ShellFrame({
  items,
  isCurrent,
  homeHref,
  profileHref,
  selector,
  user,
  roleLabel,
  columnClass,
  sidebarExtra,
  headerExtra,
  banners,
  children,
}: ShellFrameProps) {
  // Phones reach the feed from the header bell, so it never spends a tab slot.
  const tabItems = items.filter((i) => i.path !== "/notifications");

  // A phone gives a tab about 50px. An owner has seven of them, which shreds
  // every label, so past the cap the tail moves into one "More" menu and its
  // badges roll up onto that tab.
  const overflows = tabItems.length > MAX_TABS;
  const barItems = overflows ? tabItems.slice(0, MAX_TABS - 1) : tabItems;
  const moreItems = overflows ? tabItems.slice(MAX_TABS - 1) : [];
  const moreBadge = moreItems.reduce((n, i) => n + (i.badge ?? 0), 0);
  const moreActive = moreItems.some((i) => isCurrent(i.path));

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar — pinned full height, never scrolls */}
      <aside className="bg-sidebar border-sidebar-border hidden h-full w-60 shrink-0 flex-col overflow-hidden border-r p-3 md:flex">
        <Link
          href={homeHref}
          className="flex items-center gap-2 px-2 pt-1 pb-4"
        >
          <Logo size={22} />
        </Link>

        <div className="mb-3 px-1">{selector}</div>

        {items.length > 1 && (
          <nav aria-label="Primary" className="flex flex-col gap-0.5">
            {items.map((i) => (
              <NavLink key={i.href} item={i} active={isCurrent(i.path)} />
            ))}
          </nav>
        )}

        <div className="border-sidebar-border mt-auto space-y-2 border-t pt-3">
          {sidebarExtra}
          <Link
            href={profileHref}
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
                {roleLabel}
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
        <header className="bg-sidebar border-sidebar-border flex items-center gap-0.5 border-b px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 md:hidden">
          <Link
            href={homeHref}
            aria-label="Home"
            className="-m-1.5 flex size-11 shrink-0 items-center justify-center p-1.5 md:m-0 md:size-auto md:p-0"
          >
            <Logo size={22} withWordmark={false} />
          </Link>
          <div className="min-w-0 flex-1">{selector}</div>
          {headerExtra}
          <Link
            href={profileHref}
            aria-label="Profile"
            aria-current={isCurrent("/profile") ? "page" : undefined}
            className="bg-muted text-muted-foreground relative flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase after:absolute after:-inset-1 after:content-['']"
          >
            {initials(user.name, user.email)}
          </Link>
        </header>

        {banners}

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={`${columnClass} pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pt-8 md:pb-8`}
          >
            {children}
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
          {barItems.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={isCurrent(i.path) ? "page" : undefined}
              className={tabClass(isCurrent(i.path))}
            >
              <TabFace icon={i.icon} badge={i.badge} />
              <span className="max-w-full truncate">{i.label}</span>
            </Link>
          ))}

          {moreItems.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className={tabClass(moreActive)}>
                <TabFace icon={<MoreIcon />} badge={moreBadge} />
                <span className="max-w-full truncate">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                sideOffset={8}
                className="mr-2 min-w-44"
              >
                {moreItems.map((i) => (
                  <DropdownMenuItem key={i.href} asChild>
                    <Link
                      href={i.href}
                      aria-current={isCurrent(i.path) ? "page" : undefined}
                      className={
                        isCurrent(i.path) ? "text-brand-strong font-medium" : ""
                      }
                    >
                      {i.icon}
                      <span className="flex-1">{i.label}</span>
                      {!!i.badge && i.badge > 0 && (
                        <span className="bg-brand text-brand-foreground rounded-full px-1.5 font-mono text-[10px]">
                          {i.badge}
                        </span>
                      )}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
      )}
    </div>
  );
}

const tabClass = (active: boolean) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium tracking-tight ${
    active ? "text-brand-strong" : "text-muted-foreground"
  }`;

function TabFace({ icon, badge }: { icon: ReactNode; badge?: number }) {
  return (
    <span className="relative">
      {icon}
      {!!badge && badge > 0 && (
        <span className="bg-brand text-brand-foreground absolute -top-1.5 -right-2 flex min-w-4 items-center justify-center rounded-full px-1 py-px font-mono text-[10px] leading-none tabular-nums">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </span>
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
