"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import type { RouterOutputs } from "@matops/api";
import type { DisciplineTone } from "@matops/domain";
import {
  busyHours,
  capacityDisplay,
  disciplineTone,
  hourSlots,
} from "@matops/domain";
import { cn } from "@matops/ui";

import { time24Fmt, weekdayFmt } from "~/lib/format";

type ClassRow = RouterOutputs["class"]["week"][number];

const HOUR_H = 64;
const GAP_H = 26;
const DAY_MS = 86400000;

/** The grid block paint for each tone. The Legend below reads the same map. */
const TONE_SKIN: Record<DisciplineTone, string> = {
  gi: "border-border bg-[color-mix(in_oklab,var(--color-gi)_8%,var(--color-card))] border border-l-[3px] border-l-gi",
  nogi: "border-border bg-[color-mix(in_oklab,var(--color-nogi)_8%,var(--color-card))] border border-l-[3px] border-l-nogi",
  other: "border-border bg-card border border-dashed",
};

function blockSkin(discipline: string | null, cancelled: boolean) {
  if (cancelled)
    return "border border-dashed border-error/40 bg-[color-mix(in_oklab,var(--color-error)_5%,var(--color-card))] text-muted-foreground";
  return TONE_SKIN[disciplineTone(discipline)];
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

function Legend() {
  const items: { label: string; tone: DisciplineTone }[] = [
    { label: "Gi", tone: "gi" },
    { label: "NoGi", tone: "nogi" },
    { label: "Open mat", tone: "other" },
  ];
  return (
    <ul className="flex items-center gap-4">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("h-3 w-5 rounded-[2px]", TONE_SKIN[i.tone])}
          />
          <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
            {i.label}
          </span>
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
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
        <Legend />
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
                  today && "bg-brand-wash",
                )}
              >
                <p
                  className={cn(
                    "font-mono text-[10px] tracking-[0.14em] uppercase",
                    today ? "text-brand-strong" : "text-muted-foreground",
                  )}
                >
                  {weekdayFmt.format(d.date)}
                </p>
                <p
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    today
                      ? "text-brand-strong font-semibold"
                      : "text-foreground",
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
                <span className="text-muted-foreground absolute top-1 left-0 w-[3.25rem] pr-2 text-right font-mono text-[10px] tabular-nums">
                  {hourLabel(s.hour)}
                </span>
              ) : (
                <span className="text-muted-foreground absolute inset-0 flex items-center justify-center font-mono text-[10px] tracking-wide uppercase">
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
                  d.key === todayKey && "bg-brand-wash/40",
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
                        "group absolute z-10 overflow-hidden rounded-[3px] px-1.5 py-1",
                        blockSkin(row.discipline, cancelled),
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    >
                      <p className="flex items-baseline gap-1 font-mono text-[10px] tabular-nums">
                        <span className="text-muted-foreground">
                          {time24Fmt.format(start)}
                        </span>
                        {cancelled && (
                          <span className="text-error tracking-wide uppercase">
                            cancelled
                          </span>
                        )}
                      </p>
                      <p
                        className={cn(
                          "truncate text-[12.5px] leading-tight font-medium",
                          cancelled && "line-through",
                        )}
                      >
                        {row.title}
                      </p>
                      {row.instructorName && height > 52 && (
                        <p className="text-muted-foreground truncate text-[10.5px] leading-tight">
                          {row.instructorName}
                        </p>
                      )}
                      {!cancelled && (
                        <p
                          className={cn(
                            "absolute right-1.5 bottom-1 font-mono text-[10px] tabular-nums",
                            full
                              ? "text-warning font-semibold"
                              : "text-muted-foreground",
                          )}
                        >
                          {row.bookingCount}/{row.capacity}
                          {row.pendingCount > 0 && (
                            <span className="text-brand-strong">
                              {" "}
                              +{row.pendingCount}
                            </span>
                          )}
                        </p>
                      )}
                      {onSelect && (
                        <button
                          type="button"
                          className="absolute inset-0 z-[1] cursor-pointer"
                          aria-label={`${row.title} at ${time24Fmt.format(start)} — open details`}
                          onClick={() => onSelect(row)}
                        />
                      )}
                      {action && !cancelled && (
                        <div className="absolute top-0.5 right-0.5 z-[2] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
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
              <div className="bg-brand absolute right-0 left-[3.25rem] h-px" />
              <span className="bg-brand text-brand-foreground absolute top-1/2 left-0 -translate-y-1/2 rounded-[2px] px-1 font-mono text-[9px] tabular-nums">
                {time24Fmt.format(now)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
