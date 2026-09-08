import type { ReactNode } from "react";

import { cn } from "@matops/ui";

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

export function SkeletonHeader({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      <Bar className="h-7 w-44" />
      {subtitle && <Bar className="h-4 w-80" />}
    </div>
  );
}

export function SkeletonRow({
  action = false,
  lines = 2,
  className,
}: {
  i?: number;
  dot?: boolean;
  action?: boolean;
  lines?: number;
  variant?: "filled" | "outline";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-card flex items-center gap-3 rounded-lg border p-4",
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
}: {
  rows?: number;
  dot?: boolean;
  action?: boolean;
  lines?: number;
  variant?: "filled" | "outline";
  gap?: string;
}) {
  return (
    <div className={cn("flex flex-col", gap)}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} action={action} lines={lines} />
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
    <div className="bg-card rounded-lg border p-4">
      <SkeletonLines n={lines} />
    </div>
  );
}

export function SkeletonControlPanel() {
  return <SkeletonCard lines={2} />;
}
export function SkeletonQueue() {
  return <SkeletonRows rows={4} />;
}
export function SkeletonDayRail({ rows = 3 }: { rows?: number }) {
  return <SkeletonRows rows={rows} />;
}
export function SkeletonFeed() {
  return <SkeletonRows rows={3} />;
}
export function SkeletonCoachCards({
  n = 2,
}: {
  n?: number;
  toggle?: boolean;
}) {
  return <SkeletonRows rows={n} action />;
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
  return <SkeletonRows rows={rows} action />;
}
export function SkeletonDuesBody() {
  return <SkeletonCard lines={3} />;
}
export function SkeletonMyClassesBody() {
  return <SkeletonRows />;
}
export function SkeletonReferralsBody() {
  return <SkeletonRows />;
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
export const CoachesSkeleton = ScreenSkeleton;
export const ReferralsSkeleton = ScreenSkeleton;
export const PaymentsSkeleton = ScreenSkeleton;
export const SettingsSkeleton = ScreenSkeleton;
export const NotificationsSkeleton = ScreenSkeleton;
export const ProfileSkeleton = ScreenSkeleton;
export const AttendanceSkeleton = ScreenSkeleton;
export const ClassDetailSkeleton = ScreenSkeleton;
