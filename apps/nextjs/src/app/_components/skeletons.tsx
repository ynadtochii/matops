import type { ReactNode } from "react";

import { cn } from "@matops/ui";

import {
  cardClass,
  Panel,
  panelCell,
  ROSTER_LIST,
  ROSTER_ROW,
} from "./primitives";

/**
 * The loading vocabulary (ADR 80). Three tiers, one per kind of wait:
 *  1. the app boot, where no chrome exists yet — `MatLoader` (mat-loader.tsx);
 *  2. a route change, where the shell is drawn but the screen is not — the
 *     screen skeletons below, rendered from each route's `loading.tsx`;
 *  3. data filling into a drawn screen — the same skeletons, so the placeholder
 *     never re-flows between the two.
 *
 * Every shape here mirrors a real one: `SkeletonRow` is `cardClass()`,
 * `SkeletonSection` is `Section`, `SkeletonQueue` is the O1 instrument strip.
 * When a real shape changes, change its skeleton in the same edit.
 */

const pick = (list: string[], i: number) => list[i % list.length] ?? list[0];

const TITLE_W = ["w-40", "w-52", "w-32", "w-44", "w-36", "w-48"];
const META_W = ["w-56", "w-44", "w-64", "w-48", "w-60", "w-52"];
const LINE_W = ["w-full", "w-4/5", "w-2/3", "w-3/4", "w-1/2"];
const TAB_W = ["w-16", "w-20", "w-14", "w-24"];

/** One muted block. Every skeleton is built from these. */
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

/** The root of a screen skeleton — one "Loading" for the screen reader. */
function Frame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-label="Loading" className={className}>
      {children}
    </div>
  );
}

const Dot = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={cn(
      "bg-muted block size-2 shrink-0 animate-pulse rounded-full motion-reduce:animate-none",
      className,
    )}
  />
);

/* --------------------------------------------------------------- the parts */

/** A screen title and its one-line subtitle, at PageHeader's rhythm. */
export function SkeletonHeader({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div aria-hidden className="mb-6 flex flex-col gap-2">
      <Bar className="h-7 w-44" />
      {subtitle && <Bar className="h-4 w-80" />}
    </div>
  );
}

/** The Section rule: real hairlines, a placeholder label. */
export function SkeletonSection({
  meta = false,
  children,
}: {
  meta?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div aria-hidden className="flex items-center gap-3">
        <span className="bg-border h-px w-5 shrink-0" />
        <Bar className="h-2.5 w-20 shrink-0" />
        <span className="bg-border h-px flex-1" />
        {meta && <Bar className="h-2.5 w-12 shrink-0" />}
      </div>
      {children}
    </section>
  );
}

/** The tab bar above a tabbed screen. */
export function SkeletonTabs({
  tabs = 3,
  className,
}: {
  tabs?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("border-border flex gap-1 border-b", className)}
    >
      {Array.from({ length: tabs }).map((_, i) => (
        <div key={i} className="px-3 py-2.5">
          <Bar className={cn("h-3.5", pick(TAB_W, i))} />
        </div>
      ))}
    </div>
  );
}

/**
 * One list row on a card surface — the app's default list shape: an optional
 * discipline dot, a title, a meta line, and the row action on the right.
 */
export function SkeletonRow({
  i = 0,
  dot = false,
  action = false,
  lines = 2,
  variant = "filled",
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
        cardClass({ variant }),
        "flex items-center justify-between gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {dot && <Dot className="mt-1.5" />}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Bar className={cn("h-4", pick(TITLE_W, i))} />
          {lines > 1 && <Bar className={cn("h-3", pick(META_W, i))} />}
        </div>
      </div>
      {action && <Bar className="h-8 w-20 shrink-0 rounded-md" />}
    </div>
  );
}

/** A stack of card rows — the shape behind most lists in the app. */
export function SkeletonRows({
  rows = 3,
  dot = false,
  action = false,
  lines = 2,
  variant = "filled",
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
    <div aria-hidden className={cn("flex flex-col", gap)}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow
          key={i}
          i={i}
          dot={dot}
          action={action}
          lines={lines}
          variant={variant}
        />
      ))}
    </div>
  );
}

/** Paragraph-shaped text: a few lines of falling width. */
export function SkeletonLines({
  n = 3,
  className,
}: {
  n?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: n }).map((_, i) => (
        <Bar key={i} className={cn("h-3.5", pick(LINE_W, i))} />
      ))}
    </div>
  );
}

/** A card surface holding a few lines — a details or summary card. */
export function SkeletonCard({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn(cardClass(), className)}>
      <SkeletonLines n={lines} />
    </div>
  );
}

/** The same, flush on the page background — settings and requisites panels. */
export function SkeletonPanel({
  lines = 2,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(cardClass({ variant: "outline" }), className)}
    >
      <SkeletonLines n={lines} />
    </div>
  );
}

/** Glanceable metrics — a big numeral over its eyebrow, repeated. */
export function SkeletonStats({
  n = 3,
  className,
}: {
  n?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("flex flex-wrap gap-x-8 gap-y-3", className)}
    >
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Bar className="h-6 w-14" />
          <Bar className="h-2.5 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A labelled form control. */
export function SkeletonField({
  className,
  width = "w-full",
}: {
  className?: string;
  width?: string;
}) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-1.5", className)}>
      <Bar className="h-3 w-24" />
      <Bar className={cn("h-9 rounded-md", width)} />
    </div>
  );
}

/* ------------------------------------------------------- named screen parts */

/** A bordered panel holding one control - the settings selects and inputs. */
export function SkeletonControlPanel({
  width = "max-w-xs",
}: {
  width?: string;
}) {
  return (
    <div aria-hidden className={cardClass({ variant: "outline" })}>
      <Bar className={cn("h-9 rounded-md", width)} />
    </div>
  );
}

/** A coach's breakdown: which classes, then the weekday and hour bars. */
export function SkeletonBreakdown() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div>
        <Bar className="h-2.5 w-28" />
        <div className="mt-2 flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <Bar className={cn("h-3.5", pick(TITLE_W, i))} />
              <Bar className="h-3 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Bar className="h-2.5 w-24" />
            <div className="flex h-9 items-end gap-1.5">
              {[16, 28, 10, 34, 22, 30, 14].map((h, j) => (
                <span
                  key={j}
                  className="bg-muted flex-1 animate-pulse rounded-sm motion-reduce:animate-none"
                  style={{ height: h }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div>
        <Bar className="h-2.5 w-24" />
        <div className="mt-2 flex flex-col gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <Bar className={cn("h-3.5", pick(TITLE_W, i))} />
              <Bar className="h-3 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The O1 "needs you" strip — equal channels on a hairline grid. */
export function SkeletonQueue({ tiles = 4 }: { tiles?: number }) {
  return (
    <Panel aria-hidden cols={tiles}>
      {Array.from({ length: tiles }).map((_, i) => (
        <div key={i} className={cn(panelCell, "px-2.5 py-3")}>
          <Bar className="h-7 w-10" />
          <Bar className="mt-2 h-2.5 w-20" />
        </div>
      ))}
    </Panel>
  );
}

/** The dashboard's day block — classes hanging off the timeline rail. */
export function SkeletonDayRail({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="relative">
      <span className="bg-border absolute top-4 bottom-4 left-[3.5px] w-px" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="-mx-2.5 flex items-center gap-3 px-2.5 py-2.5">
          <Dot className="relative z-10" />
          <Bar className="h-3.5 w-10 shrink-0" />
          <Bar className={cn("h-4", pick(TITLE_W, i))} />
          <Bar className="ml-auto h-3.5 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Gym insights — the numbers, then the busiest-classes bars. */
export function SkeletonInsights() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <SkeletonStats
        n={4}
        className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-1"
      />
      <div className="flex flex-col gap-1">
        <Bar className="h-2.5 w-36" />
        {["w-3/4", "w-1/2", "w-1/3"].map((w) => (
          <div key={w} className="py-1.5">
            <Bar className={cn("h-5 rounded-[2px]", w)} />
          </div>
        ))}
      </div>
    </div>
  );
}

const GRID_BLOCKS: { top: number; h: number }[][] = [
  [{ top: 12, h: 52 }],
  [
    { top: 76, h: 52 },
    { top: 204, h: 52 },
  ],
  [
    { top: 12, h: 52 },
    { top: 140, h: 84 },
  ],
  [{ top: 76, h: 52 }],
  [
    { top: 12, h: 52 },
    { top: 140, h: 52 },
  ],
  [{ top: 204, h: 52 }],
  [],
];

/** The O2 week grid: the hour gutter, seven day columns, blocks in them. */
export function SkeletonWeekGrid({ hours = 5 }: { hours?: number }) {
  const days = GRID_BLOCKS.length;
  return (
    <div aria-hidden className="hidden md:block">
      <div className="mb-3 flex items-center justify-end gap-3">
        <Bar className="h-3 w-14" />
        <Bar className="h-3 w-14" />
      </div>
      <div className="border-border overflow-hidden rounded-lg border">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `3.25rem repeat(${days}, minmax(0, 1fr))`,
          }}
        >
          <span />
          {GRID_BLOCKS.map((_, i) => (
            <div
              key={i}
              className="border-border flex flex-col gap-1.5 border-b border-l px-2 py-2"
            >
              <Bar className="h-2.5 w-8" />
              <Bar className="h-4 w-6" />
            </div>
          ))}
        </div>
        <div className="relative" style={{ height: hours * 64 }}>
          {Array.from({ length: hours }).map((_, i) => (
            <div
              key={i}
              className="border-border absolute inset-x-0 border-t"
              style={{ top: i * 64, height: 64 }}
            >
              <Bar className="absolute top-1.5 left-2 h-2.5 w-8" />
            </div>
          ))}
          <div
            className="absolute inset-y-0 right-0 left-[3.25rem] grid"
            style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}
          >
            {GRID_BLOCKS.map((blocks, i) => (
              <div key={i} className="border-border relative border-l">
                {blocks.map((b) => (
                  <span
                    key={b.top}
                    className="bg-muted absolute inset-x-1 animate-pulse rounded-md motion-reduce:animate-none"
                    style={{ top: b.top, height: b.h }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The notification feed — days of cards, each a title, a body and its kind. */
export function SkeletonFeed({
  days = 2,
  rows = 2,
}: {
  days?: number;
  rows?: number;
}) {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      {Array.from({ length: days }).map((_, d) => (
        <SkeletonSection key={d}>
          <div className="flex flex-col gap-2">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className={cardClass()}>
                <div className="flex items-baseline gap-2">
                  <Bar className={cn("h-4", pick(TITLE_W, d + i))} />
                  <span className="flex-1" />
                  <Bar className="h-2.5 w-8 shrink-0" />
                </div>
                <Bar className="mt-2.5 h-3 w-full" />
                <Bar className="mt-1.5 h-3 w-2/3" />
                <Bar className="mt-3 h-2.5 w-24" />
              </div>
            ))}
          </div>
        </SkeletonSection>
      ))}
    </div>
  );
}

/** A coach card — the name, the breakdown toggle, five numbers. */
export function SkeletonCoachCards({
  n = 2,
  toggle = true,
}: {
  n?: number;
  toggle?: boolean;
}) {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={cn(cardClass(), "flex flex-col gap-4")}>
          <div className="flex items-center justify-between gap-2">
            <Bar className={cn("h-4", pick(TITLE_W, i))} />
            {toggle && <Bar className="h-8 w-28 shrink-0 rounded-md" />}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex flex-col gap-2">
                <Bar className="h-6 w-12" />
                <Bar className="h-2.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The O5 roster — the coach picker, the counts line, then who is on the mat. */
export function SkeletonRoster({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <Bar className="h-8 w-64 rounded-md" />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <Bar className="h-3 w-48" />
          <Bar className="h-8 w-32 shrink-0 rounded-md" />
        </div>
        <Bar className="h-0.5 w-full rounded-full" />
      </div>
      <ul className={cn(ROSTER_LIST, "overflow-hidden")}>
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className={ROSTER_ROW}>
            <Bar className="size-2.5 shrink-0 rounded-full" />
            <Bar className={cn("h-4", pick(TITLE_W, i))} />
            <Bar className="ml-auto h-9 w-32 shrink-0 rounded-md" />
          </li>
        ))}
      </ul>
      <Bar className="h-12 w-full rounded-lg" />
    </div>
  );
}

/** An invite link card — the label, its hint, the link and its buttons. */
export function SkeletonInviteCard() {
  return (
    <div aria-hidden className={cn(cardClass(), "flex flex-col gap-2")}>
      <div className="flex items-center justify-between gap-2">
        <Bar className="h-4 w-32" />
        <Bar className="h-8 w-24 shrink-0 rounded-md" />
      </div>
      <Bar className="h-3 w-96" />
      <div className="flex gap-2 pt-1">
        <Bar className="h-9 flex-1 rounded-md" />
        <Bar className="h-9 w-20 shrink-0 rounded-md" />
      </div>
    </div>
  );
}

/** Days of classes — the student schedule, and the schedule screen on a phone. */
export function SkeletonClassDays({
  days = 3,
  rows = 2,
  dot = true,
  action = true,
}: {
  days?: number;
  rows?: number;
  dot?: boolean;
  action?: boolean;
}) {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      {Array.from({ length: days }).map((_, d) => (
        <SkeletonSection key={d} meta>
          <SkeletonRows rows={rows} dot={dot} action={action} />
        </SkeletonSection>
      ))}
    </div>
  );
}

/** The student dues screen below its title: what you owe, then how to pay. */
export function SkeletonDuesBody() {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      <SkeletonSection>
        <div className={cardClass()}>
          <div className="flex flex-wrap items-center gap-3">
            <Bar className="h-7 w-28" />
            <Bar className="h-3.5 w-20" />
          </div>
          <Bar className="mt-2 h-3.5 w-48" />
        </div>
      </SkeletonSection>
      <SkeletonSection>
        <div className="flex flex-col gap-3">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
          <Bar className="h-9 w-32 rounded-md" />
        </div>
      </SkeletonSection>
    </div>
  );
}

/** My classes below its title: the next one, the stats, upcoming, past. */
export function SkeletonMyClassesBody() {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      <SkeletonSection>
        <SkeletonCard lines={2} className="border-brand/30 bg-brand-wash" />
      </SkeletonSection>
      <SkeletonSection>
        <div className={cardClass()}>
          <SkeletonStats n={3} />
        </div>
      </SkeletonSection>
      <SkeletonSection meta>
        <SkeletonRows rows={2} action />
      </SkeletonSection>
      <SkeletonSection meta>
        <SkeletonRows rows={3} />
      </SkeletonSection>
    </div>
  );
}

/** Referrals below its title: the summary sentence, the search, the board. */
export function SkeletonReferralsBody() {
  return (
    <div aria-hidden className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <SkeletonLines n={3} className="max-w-2xl" />
        <div className="flex flex-wrap items-center gap-3">
          <Bar className="h-9 min-w-56 flex-1 rounded-md" />
          <Bar className="h-4 w-48 shrink-0" />
        </div>
      </div>
      <section className="space-y-3">
        <Bar className="h-5 w-24" />
        <ul className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className={cn(cardClass(), "flex gap-4")}>
              <div className="flex w-12 shrink-0 flex-col gap-2">
                <Bar className="h-6 w-8" />
                <Bar className="h-2.5 w-12" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-baseline gap-2">
                  <Bar className={cn("h-4", pick(TITLE_W, i))} />
                  <span className="flex-1" />
                  <Bar className="h-3 w-40 shrink-0" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["w-24", "w-32", "w-20"].map((w) => (
                    <Bar key={w} className={cn("h-7 rounded-full", w)} />
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The schedule week: the grid on a desktop, the day list on a phone. */
export function SkeletonScheduleWeek() {
  return (
    <div aria-hidden>
      <SkeletonWeekGrid />
      <div className="md:hidden">
        <SkeletonClassDays days={3} rows={2} action={false} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------- the screens, whole */

/**
 * The home route, which is the owner dashboard for staff and the week's
 * schedule for a student. The role is not known until the shell mounts, so this
 * draws what both share: a title and days of classes. Each screen swaps in its
 * own shape the moment it renders.
 */
export function HomeSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
    </Frame>
  );
}

export function MyClassesSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <SkeletonMyClassesBody />
    </Frame>
  );
}

export function ScheduleSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <SkeletonTabs tabs={2} className="mb-6" />
      <SkeletonScheduleWeek />
    </Frame>
  );
}

export function MembersSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <Bar className="h-5 w-48" />
          <Bar className="h-3.5 w-full max-w-xl" />
          <SkeletonInviteCard />
        </section>
        <div className="flex flex-col gap-6">
          <SkeletonTabs />
          <div className="flex flex-col gap-3">
            <Bar className="h-9 w-full rounded-md" />
            <SkeletonRows rows={5} action gap="gap-3" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function CoachesSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SkeletonTabs tabs={3} />
          <Bar className="h-2.5 w-32" />
        </div>
        <SkeletonCoachCards n={1} toggle={false} />
      </div>
    </Frame>
  );
}

export function ReferralsSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <SkeletonReferralsBody />
    </Frame>
  );
}

/**
 * Payments is the owner's claims screen or the student's dues screen, and the
 * role is not known until the shell mounts. This draws only what both are - a
 * title over a stack of cards - rather than tabs a student never gets.
 */
export function PaymentsSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <SkeletonRows rows={3} action gap="gap-3" />
    </Frame>
  );
}

export function SettingsSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <Bar className="h-5 w-40" />
          <Bar className="h-3.5 w-full max-w-xl" />
          <SkeletonPanel lines={2} />
        </section>
        <section className="flex flex-col gap-3">
          <Bar className="h-5 w-28" />
          <Bar className="h-3.5 w-full max-w-xl" />
          <SkeletonControlPanel />
        </section>
        <section className="flex flex-col gap-3">
          <Bar className="h-5 w-32" />
          <SkeletonPanel lines={2} />
        </section>
      </div>
    </Frame>
  );
}

export function NotificationsSkeleton() {
  return (
    <Frame className="flex flex-col gap-8">
      <SkeletonHeader />
      <SkeletonFeed />
    </Frame>
  );
}

export function ProfileSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <div className="flex flex-col gap-8">
        <SkeletonSection>
          <div
            className={cn(
              cardClass({ variant: "outline" }),
              "flex flex-col divide-y p-0",
            )}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div className="flex flex-col gap-2">
                  <Bar className="h-3 w-16" />
                  <Bar className={cn("h-4", pick(TITLE_W, i))} />
                </div>
                {i === 0 && <Bar className="h-8 w-16 shrink-0 rounded-md" />}
              </div>
            ))}
          </div>
        </SkeletonSection>
        <SkeletonSection>
          <SkeletonCard lines={3} />
        </SkeletonSection>
        <SkeletonSection>
          <SkeletonPanel lines={2} />
        </SkeletonSection>
      </div>
    </Frame>
  );
}

export function AttendanceSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <div className="flex flex-col gap-4">
        <Bar className="h-9 w-full rounded-md" />
        <SkeletonRoster />
      </div>
    </Frame>
  );
}

export function ClassDetailSkeleton() {
  return (
    <Frame>
      <SkeletonHeader />
      <div className="flex flex-col gap-8">
        <SkeletonSection>
          <div className={cn(cardClass(), "grid gap-4 sm:grid-cols-2")}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Bar className="h-2.5 w-20" />
                <Bar className="h-4 w-32" />
              </div>
            ))}
          </div>
        </SkeletonSection>
        <SkeletonSection>
          <SkeletonCard lines={2} />
        </SkeletonSection>
        <div className="flex gap-3">
          <Bar className="h-9 w-32 rounded-md" />
        </div>
      </div>
    </Frame>
  );
}
