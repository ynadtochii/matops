"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@matops/ui/collapsible";
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
  badge?: NavBadge;
  group?: string;
  /** Runs an action instead of navigating: "Add branch" in gym management. */
  onSelect?: () => void;
}

export type NavBadge =
  | { state: "ready"; count: number }
  | { state: "loading" }
  | { state: "error" }
  | { state: "unavailable" };

const MAX_TABS = 5;

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

interface ShellFrameProps {
  /** Already filtered by `show` and given an `href`. */
  items: NavItem[];
  isCurrent: (path: string) => boolean;
  homeHref: string;
  profileHref: string;
  selector: ReactNode;
  user: { name: string; email: string };
  /** The heading over the ungrouped items: the current branch's name. */
  branchLabel?: string;
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
  branchLabel = "Branch",
  roleLabel,
  columnClass,
  sidebarExtra,
  headerExtra,
  banners,
  children,
}: ShellFrameProps) {
  const tabItems = items;

  // A phone gives a tab about 50px. An owner has seven of them, which shreds
  // every label, so past the cap the tail moves into one "More" menu and its
  // badges roll up onto that tab. A grouped item never competes for a slot:
  // gym management is a menu on a phone, not five more tabs (ADR 129).
  const own = tabItems.filter((i) => !i.group);
  const grouped = tabItems.filter((i) => i.group);
  const overflows = own.length + grouped.length > MAX_TABS;
  const barItems = overflows ? own.slice(0, MAX_TABS - 1) : own;
  const moreItems = overflows
    ? [...own.slice(MAX_TABS - 1), ...grouped]
    : grouped;
  const moreBadge = combineBadges(moreItems.map((i) => i.badge));
  const moreActive = moreItems.some((i) => isCurrent(i.path));
  const hasGroups = items.some((i) => i.group);

  return (
    <div className="flex h-dvh overflow-hidden">
      <a
        href="#main"
        className="bg-background text-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:outline-none"
      >
        Skip to content
      </a>
      {/* Desktop sidebar — the logo, the branch picker and the footer are pinned;
          only the nav list scrolls, so the picker cannot move under the pointer. */}
      <aside className="bg-sidebar border-sidebar-border hidden h-full w-60 shrink-0 flex-col overflow-hidden border-r p-2 md:flex">
        <Link
          href={homeHref}
          className="flex items-center gap-2 px-1.5 pt-1.5 pb-3"
        >
          <Logo size={20} />
        </Link>

        <div className="mb-2">{selector}</div>

        {items.length > 1 && (
          <nav
            aria-label="Primary"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
          >
            {groupsOf(items).map(({ group, members }) =>
              hasGroups ? (
                <Collapsible
                  key={group ?? ""}
                  defaultOpen
                  className="flex flex-col"
                >
                  <CollapsibleTrigger className="group/fold text-muted-foreground hover:text-foreground flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors">
                    <span className="truncate">{group ?? branchLabel}</span>
                    <ChevronDown className="size-3 transition-transform group-data-[state=closed]/fold:-rotate-90 motion-reduce:transition-none" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="flex flex-col gap-px pt-px">
                      {members.map((i) => (
                        <NavLink
                          key={i.href}
                          item={i}
                          active={isCurrent(i.path)}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <div key={group ?? ""} className="flex flex-col gap-px">
                  {members.map((i) => (
                    <NavLink key={i.href} item={i} active={isCurrent(i.path)} />
                  ))}
                </div>
              ),
            )}
          </nav>
        )}

        <div className="border-sidebar-border mt-auto flex flex-col gap-1 border-t pt-2">
          {sidebarExtra}
          <Link
            href={profileHref}
            aria-current={isCurrent("/profile") ? "page" : undefined}
            className={`flex items-center gap-2 rounded-md p-1.5 transition-colors ${
              isCurrent("/profile") ? "bg-active" : "hover:bg-hover"
            }`}
          >
            <div className="bg-active text-foreground-secondary flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase">
              {initials(user.name, user.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="text-muted-foreground text-xs capitalize">
                {roleLabel}
              </p>
            </div>
          </Link>
          <FeedbackLink />
          <div className="flex items-center gap-2 px-1.5 pb-1">
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
            <Logo size={20} withWordmark={false} />
          </Link>
          <div className="min-w-0 flex-1">{selector}</div>
          {headerExtra}
          <Link
            href={profileHref}
            aria-label="Profile"
            aria-current={isCurrent("/profile") ? "page" : undefined}
            className="bg-active text-foreground-secondary relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase after:absolute after:-inset-1.5 after:content-['']"
          >
            {initials(user.name, user.email)}
          </Link>
        </header>

        {banners}

        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
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
                <TabFace icon={<Menu aria-hidden />} badge={moreBadge} />
                <span className="max-w-full truncate">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                sideOffset={8}
                className="mr-2 min-w-44"
              >
                {moreItems.map((i) =>
                  i.onSelect ? (
                    <DropdownMenuItem key={i.href} onSelect={i.onSelect}>
                      {i.icon}
                      <span className="flex-1">{i.label}</span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={i.href} asChild>
                      <Link
                        href={i.href}
                        aria-current={isCurrent(i.path) ? "page" : undefined}
                        className={
                          isCurrent(i.path) ? "bg-active text-foreground" : ""
                        }
                      >
                        {i.icon}
                        <span className="flex-1">{i.label}</span>
                        <BadgeFace badge={i.badge} />
                      </Link>
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
      )}
    </div>
  );
}

function groupsOf(items: NavItem[]): { group?: string; members: NavItem[] }[] {
  const out: { group?: string; members: NavItem[] }[] = [];
  for (const item of items) {
    const held = out.find((g) => g.group === item.group);
    if (held) held.members.push(item);
    else out.push({ group: item.group, members: [item] });
  }
  return out.sort((a, b) => (a.group ? 1 : 0) - (b.group ? 1 : 0));
}

const tabClass = (active: boolean) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-2xs font-medium transition-colors motion-reduce:transition-none [&_svg]:size-5 ${
    active ? "text-foreground" : "text-muted-foreground"
  }`;

function combineBadges(badges: (NavBadge | undefined)[]): NavBadge {
  const visible = badges.filter(
    (badge): badge is NavBadge =>
      badge !== undefined && badge.state !== "unavailable",
  );
  if (visible.some((badge) => badge.state === "error")) {
    return { state: "error" };
  }
  if (visible.some((badge) => badge.state === "loading")) {
    return { state: "loading" };
  }
  return {
    state: "ready",
    count: visible.reduce(
      (total, badge) => total + (badge.state === "ready" ? badge.count : 0),
      0,
    ),
  };
}

function BadgeFace({ badge }: { badge?: NavBadge }) {
  if (!badge || badge.state === "unavailable") return null;
  if (badge.state === "loading") {
    return (
      <span
        aria-label="Count loading"
        className="bg-active text-muted-foreground text-2xs rounded-full px-1.5 tabular-nums"
      >
        …
      </span>
    );
  }
  if (badge.state === "error") {
    return (
      <span
        aria-label="Count unavailable"
        className="bg-error/10 text-error-text text-2xs rounded-full px-1.5 tabular-nums"
      >
        !
      </span>
    );
  }
  if (badge.count === 0) return null;
  return (
    <span className="bg-active text-foreground text-2xs rounded-full px-1.5 font-medium tabular-nums">
      {badge.count > 9 ? "9+" : badge.count}
    </span>
  );
}

function TabFace({ icon, badge }: { icon: ReactNode; badge?: NavBadge }) {
  return (
    <span className="relative">
      {icon}
      <span className="absolute -top-1.5 -right-2">
        <BadgeFace badge={badge} />
      </span>
    </span>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const face = (
    <>
      {item.icon}
      <span className="flex-1 truncate">{item.label}</span>
      <BadgeFace badge={item.badge} />
    </>
  );
  const className = `flex h-7 items-center gap-2 rounded-md px-1.5 text-left text-sm font-medium transition-colors motion-reduce:transition-none [&_svg]:shrink-0 ${
    active
      ? "bg-active text-foreground [&_svg]:text-foreground"
      : "text-foreground-secondary hover:bg-hover [&_svg]:text-muted-foreground"
  }`;

  if (item.onSelect) {
    return (
      <button type="button" onClick={item.onSelect} className={className}>
        {face}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {face}
    </Link>
  );
}
