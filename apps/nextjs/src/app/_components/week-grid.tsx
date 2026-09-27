"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import type { RouterOutputs } from "@matops/api";
import {
  busyHours,
  capacityDisplay,
  DAY_MS,
  DISCIPLINE_HUE_COUNT,
  hourSlots,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { FOCUS_RING_INSET } from "@matops/ui/motion";

import { time24Fmt, weekdayFmt } from "~/lib/format";
import { useMinuteClock } from "./use-clock";
import { useDisciplineHue } from "./use-discipline-hue";

type ClassRow = RouterOutputs["class"]["week"][number];

const HOUR_H = 64;
const GAP_H = 26;

const HUE_SKIN = [
  "border-l-discipline-1 bg-[color-mix(in_oklab,var(--color-discipline-1)_8%,var(--color-card))] glow-edge-discipline-1",
  "border-l-discipline-2 bg-[color-mix(in_oklab,var(--color-discipline-2)_8%,var(--color-card))] glow-edge-discipline-2",
  "border-l-discipline-3 bg-[color-mix(in_oklab,var(--color-discipline-3)_8%,var(--color-card))] glow-edge-discipline-3",
  "border-l-discipline-4 bg-[color-mix(in_oklab,var(--color-discipline-4)_8%,var(--color-card))] glow-edge-discipline-4",
  "border-l-discipline-5 bg-[color-mix(in_oklab,var(--color-discipline-5)_8%,var(--color-card))] glow-edge-discipline-5",
];
const DEFAULT_SKIN =
  "border-l-discipline-default bg-[color-mix(in_oklab,var(--color-discipline-default)_8%,var(--color-card))] glow-edge-discipline-default";

const hueSkin = (hue: number | null) =>
  cn(
    "border-border border border-l-[3px]",
    hue === null ? DEFAULT_SKIN : HUE_SKIN[hue],
  );

function blockSkin(hue: number | null, cancelled: boolean) {
  if (cancelled)
    return "border border-dashed border-error/40 bg-[color-mix(in_oklab,var(--color-error)_5%,var(--color-card))] text-muted-foreground";
  return hueSkin(hue);
}

interface Placed {
  row: ClassRow;
  start: Date;
  endMin: number;
  startMin: number;
  lane: number;
  lanes: number;
}

function placeDay(rows: ClassRow[]): Placed[] {
  const items = rows
    .map((row) => {
      const start = new Date(row.startsAt);
      const startMin = start.getHours() * 60 + start.getMinutes();
      return {
        row,
        start,
        startMin,
        endMin: startMin + row.durationMinutes,
        lane: 0,
        lanes: 1,
      };
    })
    .sort((a, b) => a.startMin - b.startMin);

  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const item of cluster)
      item.lanes = Math.max(...cluster.map((c) => c.lane)) + 1;
    cluster = [];
  };
  for (const item of items) {
    if (item.startMin >= clusterEnd) {
      flush();
      clusterEnd = item.endMin;
    } else {
      clusterEnd = Math.max(clusterEnd, item.endMin);
    }
    const taken = new Set(
      cluster.filter((c) => c.endMin > item.startMin).map((c) => c.lane),
    );
    while (taken.has(item.lane)) item.lane += 1;
    cluster.push(item);
  }
  flush();
  return items;
}

type Slot =
  | { kind: "hour"; hour: number; y: number; h: number }
  | { kind: "gap"; from: number; to: number; y: number; h: number };

function buildSlots(rows: ClassRow[]): {
  slots: Slot[];
  total: number;
  offsetOf: (h: number) => number | null;
} {
  const busy = busyHours(
    rows.map((r) => {
      const start = new Date(r.startsAt);
      return {
        startMinutes: start.getHours() * 60 + start.getMinutes(),
        durationMinutes: r.durationMinutes,
      };
    }),
  );
  const hours = [...busy].sort((a, b) => a - b);
  const first = Math.max(0, (hours[0] ?? 8) - 1);
  const last = Math.min(24, (hours[hours.length - 1] ?? 20) + 2);

  const slots: Slot[] = [];
  const offsets = new Map<number, number>();
  let y = 0;
  for (const s of hourSlots(busy, first, last)) {
    if (s.kind === "gap") {
      slots.push({ kind: "gap", from: s.from, to: s.to, y, h: GAP_H });
      y += GAP_H;
    } else {
      slots.push({ kind: "hour", hour: s.from, y, h: HOUR_H });
      offsets.set(s.from, y);
      y += HOUR_H;
    }
  }
  return {
    slots,
    total: y,
    offsetOf: (h: number) => offsets.get(h) ?? null,
  };
}

const hourLabel = (h: number) => time24Fmt.format(new Date(2000, 0, 1, h, 0));

function Legend({ names }: { names: string[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-end gap-4">
      {names.slice(0, DISCIPLINE_HUE_COUNT).map((name, hue) => (
        <li key={name} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("h-3 w-5 rounded-xs", hueSkin(hue))}
          />
          <span className="text-muted-foreground text-xs">{name}</span>
        </li>
      ))}
    </ul>
  );
}

export function WeekGrid({
  rows,
  weekStart,
  action,
  onSelect,
}: {
  rows: ClassRow[];
  weekStart: Date;
  action?: (c: ClassRow) => ReactNode;
  onSelect?: (c: ClassRow) => void;
}) {
  const now = useMinuteClock();
  const { names, hueOf } = useDisciplineHue();

  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart.getTime() + i * DAY_MS);
      const key = date.toDateString();
      return {
        date,
        key,
        items: placeDay(
          rows.filter((r) => new Date(r.startsAt).toDateString() === key),
        ),
      };
    });
    const sunday = all[6];
    return sunday?.items.length === 0 ? all.slice(0, 6) : all;
  }, [rows, weekStart]);

  const { slots, total, offsetOf } = useMemo(() => buildSlots(rows), [rows]);

  const todayKey = now.toDateString();
  const nowHourY = offsetOf(now.getHours());
  const nowY =
    days.some((d) => d.key === todayKey) && nowHourY !== null
      ? nowHourY + (now.getMinutes() / 60) * HOUR_H
      : null;

  return (
    <div className="hidden md:block">
      <div className="mb-3 flex items-center justify-end">
        <Legend names={names} />
      </div>

      <div className="border-border overflow-hidden rounded-lg border">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <span />
          {days.map((d) => {
            const today = d.key === todayKey;
            return (
              <div
                key={d.key}
                className={cn(
                  "border-border border-b border-l px-2 py-2",
                  today && "bg-hover",
                )}
              >
                <p
                  className={cn(
                    "text-2xs font-medium",
                    today ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {weekdayFmt.format(d.date)}
                </p>
                <p
                  className={cn(
                    "text-sm tabular-nums",
                    today
                      ? "text-foreground font-semibold"
                      : "text-foreground-secondary",
                  )}
                >
                  {d.date.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        <div className="relative" style={{ height: total }}>
          {slots.map((s) => (
            <div
              key={`${s.kind}-${s.y}`}
              className="absolute inset-x-0"
              style={{ top: s.y, height: s.h }}
            >
              <div
                className={cn(
                  "border-border h-full border-t",
                  s.kind === "gap" && "bg-muted/40 border-dashed",
                )}
              />
              {s.kind === "hour" ? (
                <span className="text-muted-foreground text-2xs absolute top-1 left-0 w-[3.25rem] pr-2 text-right tabular-nums">
                  {hourLabel(s.hour)}
                </span>
              ) : (
                <span className="text-muted-foreground text-2xs absolute inset-0 flex items-center justify-center">
                  no classes {hourLabel(s.from)}-{hourLabel(s.to)}
                </span>
              )}
            </div>
          ))}

          <div
            className="absolute inset-y-0 right-0 left-[3.25rem] grid"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
            }}
          >
            {days.map((d) => (
              <div
                key={d.key}
                className={cn(
                  "border-border relative border-l",
                  d.key === todayKey && "bg-hover/50",
                )}
              >
                {d.items.map(({ row, start, startMin, lane, lanes }) => {
                  const cancelled = row.status === "cancelled";
                  const full = capacityDisplay(
                    row.bookingCount,
                    row.capacity,
                  ).isOver;
                  const top =
                    (offsetOf(start.getHours()) ?? 0) +
                    ((startMin % 60) / 60) * HOUR_H;
                  const height = Math.max(
                    (row.durationMinutes / 60) * HOUR_H - 3,
                    34,
                  );
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        "group absolute z-10 overflow-hidden rounded-sm px-1.5 py-1",
                        blockSkin(hueOf(row.discipline), cancelled),
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    >
                      <p className="text-2xs flex items-baseline gap-1 tabular-nums">
                        <span className="text-muted-foreground">
                          {time24Fmt.format(start)}
                        </span>
                        {cancelled && (
                          <span className="text-error-text">cancelled</span>
                        )}
                      </p>
                      <p
                        className={cn(
                          "truncate text-xs leading-tight font-medium",
                          cancelled && "line-through",
                        )}
                      >
                        {row.title}
                      </p>
                      {row.instructorName && height > 52 && (
                        <p className="text-muted-foreground text-2xs truncate leading-tight">
                          {row.instructorName}
                        </p>
                      )}
                      {!cancelled && (
                        <p
                          className={cn(
                            "text-2xs absolute right-1.5 bottom-1 tabular-nums",
                            full
                              ? "text-warning font-semibold"
                              : "text-muted-foreground",
                          )}
                        >
                          {row.bookingCount}/{row.capacity}
                          {row.pendingCount > 0 && (
                            <span className="text-foreground">
                              {" "}
                              +{row.pendingCount}
                            </span>
                          )}
                        </p>
                      )}
                      {onSelect && (
                        <button
                          type="button"
                          className={cn(
                            "absolute inset-0 z-[1] cursor-pointer rounded-sm",
                            FOCUS_RING_INSET,
                          )}
                          aria-label={`Open ${row.title} at ${time24Fmt.format(start)}`}
                          onClick={() => onSelect(row)}
                        />
                      )}
                      {action && !cancelled && (
                        <div className="absolute top-0.5 right-0.5 z-[2] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
                          {action(row)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {nowY !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-20"
              style={{ top: nowY }}
              aria-hidden
            >
              <div className="bg-foreground absolute right-0 left-[3.25rem] h-px" />
              <span className="bg-foreground text-background text-2xs absolute top-1/2 left-0 -translate-y-1/2 rounded-xs px-1 tabular-nums">
                {time24Fmt.format(now)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
