import type { ReactNode } from "react";

import { cn } from "@matops/ui";

import { LIST, Panel, panelCell } from "./primitives";

export function Bar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-muted block max-w-full animate-pulse rounded-sm motion-reduce:animate-none",
        className,
      )}
    />
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-6">
      {children}
    </div>
  );
}

function SkeletonHeader({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      <Bar className="h-7 w-44" />
      {subtitle && <Bar className="h-4 w-80" />}
    </div>
  );
}

function SkeletonRow({
  action = false,
  lines = 2,
  className,
}: {
  action?: boolean;
  lines?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "border-border bg-card flex items-center gap-3 rounded-lg border p-4",
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-2">
        <Bar className="h-4 w-2/3" />
        {lines > 1 && <Bar className="h-3 w-1/2" />}
      </div>
      {action && <Bar className="h-8 w-20 rounded-md" />}
    </div>
  );
}

export function SkeletonRows({
  rows = 3,
  action = false,
  lines = 2,
  gap = "gap-2",
  inList = false,
}: {
  rows?: number;
  action?: boolean;
  lines?: number;
  gap?: string;
  inList?: boolean;
}) {
  return (
    <div className={inList ? LIST : cn("flex flex-col", gap)}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow
          key={i}
          action={action}
          lines={lines}
          className={inList ? "rounded-none border-0" : undefined}
        />
      ))}
    </div>
  );
}

export function SkeletonLines({
  n = 3,
  className,
}: {
  n?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: n }, (_, i) => (
        <Bar key={i} className={cn("h-3", i === n - 1 ? "w-1/2" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <SkeletonLines n={lines} />
    </div>
  );
}

function SkeletonControlPanel() {
  return <SkeletonCard lines={2} />;
}
/**
 * The dashboard's "needs you" strip, cut to the shape it resolves into: a
 * hairline panel of equal channels, not a stack of cards that jumps into one
 * short row when the counts land.
 */
export function SkeletonQueue({ cells = 3 }: { cells?: number }) {
  return (
    <Panel role="status" aria-label="Loading" cols={cells}>
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} aria-hidden className={cn(panelCell, "px-2.5 py-3")}>
          <Bar className="h-6 w-8" />
          <Bar className="mt-2 h-3 w-20" />
        </div>
      ))}
    </Panel>
  );
}

/** The day's classes on their vertical rail, dot and clock column included. */
export function SkeletonDayRail({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="relative">
      <span
        aria-hidden
        className="bg-border absolute top-4 bottom-4 left-[3.5px] w-px"
      />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="flex min-h-11 items-center gap-3 py-2"
        >
          <Bar className="size-2 shrink-0 rounded-full" />
          <Bar className="h-3 w-12 shrink-0" />
          <Bar className="h-3.5 flex-1" />
          <Bar className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}
export function SkeletonCoachCards({
  n = 2,
}: {
  n?: number;
  toggle?: boolean;
}) {
  return <SkeletonRows rows={n} action inList />;
}
export function SkeletonRoster({ rows = 5 }: { rows?: number }) {
  return <SkeletonRows rows={rows} />;
}
export function SkeletonInviteCard() {
  return <SkeletonCard lines={2} />;
}
export function SkeletonClassDays({
  rows = 3,
}: {
  days?: number;
  rows?: number;
  action?: boolean;
}) {
  return <SkeletonRows rows={rows} action inList />;
}
export function SkeletonDuesBody() {
  return <SkeletonCard lines={3} />;
}
export function SkeletonMyClassesBody() {
  return <SkeletonRows action inList />;
}
export function SkeletonScheduleWeek() {
  return <SkeletonRows />;
}

function ScreenSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <SkeletonRows />
    </Frame>
  );
}

export const HomeSkeleton = ScreenSkeleton;
export const MyClassesSkeleton = ScreenSkeleton;
export const ScheduleSkeleton = ScreenSkeleton;
export const MembersSkeleton = ScreenSkeleton;
export function CoachesSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Bar className="h-5 w-36" />
            <Bar className="h-3 w-24" />
          </div>
          <Bar className="h-8 w-64" />
          <SkeletonRows rows={3} action inList />
        </div>
        <div className="flex flex-col gap-4">
          <Bar className="h-5 w-16" />
          <SkeletonRows rows={2} action inList />
          <SkeletonInviteCard />
        </div>
      </div>
    </Frame>
  );
}
export const PaymentsSkeleton = ScreenSkeleton;
export function SettingsSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <div className="flex flex-col gap-8">
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonRow action />
          <SkeletonRow action />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonControlPanel />
          <SkeletonControlPanel />
          <SkeletonControlPanel />
          <SkeletonControlPanel />
        </div>
        <SkeletonCard lines={3} />
      </div>
    </Frame>
  );
}
export const ProfileSkeleton = ScreenSkeleton;
export const AttendanceSkeleton = ScreenSkeleton;
export const ClassDetailSkeleton = ScreenSkeleton;
