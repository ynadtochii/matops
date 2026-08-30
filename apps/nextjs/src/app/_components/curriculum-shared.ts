import type { RouterOutputs } from "@matops/api";
import { cn } from "@matops/ui";
import { FOCUS_RING, PRESS } from "@matops/ui/motion";

import { monthDayFmt } from "~/lib/format";

export type Board = RouterOutputs["curriculum"]["board"];
export type Block = Board["blocks"][number];
export type Placed = Board["plan"][number];
export type Theme = Placed["themes"][number];

export const WEEK_H = 80;
export const DAY_H = WEEK_H / 7;
export const GAP = 10;
export const BLANK_WEEKS = 6;
export const MIN_WEEKS = 16;
export const EMPTY_WEEKS = 8;

/** The id the drag preview gives its stand-in row, so the view can draw it dimmed. */
export const GHOST = "ghost-block";

export function dayDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function dayLabel(iso: string): string {
  return monthDayFmt.format(dayDate(iso));
}

export function slotLabel(placed: Placed): string {
  const names = placed.themes.map((on) => on.theme);
  if (names.length < 2) return names[0] ?? "The block";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function weeksLabel(weeks: number): string {
  if (weeks === 4) return "a month";
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}

export function movedLabel(moved: number): string {
  if (moved === 0) return "Nothing after it moved.";
  return `${moved} ${moved === 1 ? "block" : "blocks"} after it moved.`;
}

export const SURFACE = cn(
  "transition-[background-color,border-color,color,opacity,scale] duration-150",
  PRESS,
  FOCUS_RING,
);

export const CONTROL = cn(
  "border-border hover:bg-muted grid size-8 shrink-0 place-items-center rounded-md border",
  "disabled:pointer-events-none disabled:opacity-40",
  SURFACE,
);

export const STEP = cn(
  "hover:bg-muted grid size-8 place-items-center",
  "focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-40",
  SURFACE,
);

export const ICON_BTN = cn(
  "text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center rounded",
  "disabled:pointer-events-none disabled:opacity-40",
  SURFACE,
);

export const GRIP = cn(
  ICON_BTN,
  "cursor-grab touch-none active:cursor-grabbing",
);

export function chipClass(active: boolean): string {
  return cn(
    "min-h-11 rounded-md border px-3 py-1.5 text-sm sm:min-h-0",
    SURFACE,
    active
      ? "bg-primary text-primary-foreground border-primary"
      : "bg-background hover:bg-muted",
  );
}
