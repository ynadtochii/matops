import type { ReactNode } from "react";

import { cn } from "@matops/ui";

/**
 * Shared layout vocabulary for the owner/instructor screens. Before this, every
 * screen re-implemented its own section headings, count badges, stat blocks, and
 * card surfaces — three different "card" treatments drifted apart. These are the
 * one true set. Web-only composition helpers (not the cross-platform UI kit), so
 * they live here next to `states.tsx` / `page-header.tsx`.
 */

/**
 * The two surface languages, unified:
 *  - `filled`  — a quiet muted row for static list items (a class, a member, a
 *    claim). The app's default list surface.
 *  - `outline` — a card on the page background, for things that navigate or act.
 * Returns a className so it drops onto a `div`, `Link`, `li`, or `button` alike.
 */
export function cardClass({
  variant = "filled",
  interactive = false,
}: { variant?: "filled" | "outline"; interactive?: boolean } = {}) {
  return cn(
    "rounded-lg p-4",
    variant === "filled" ? "bg-muted" : "border-border border",
    interactive &&
      "transition-colors " +
        (variant === "filled"
          ? "hover:bg-secondary"
          : "hover:border-brand/40 hover:bg-muted"),
  );
}

/**
 * A section heading (h2) with an optional attention count and a right-aligned
 * action. The count carries the brand spark — matching the nav badges — because
 * it always means "N things here want you", never a data status (ADR 37).
 */
export function SectionHeading({
  children,
  count,
  action,
  className,
}: {
  children: ReactNode;
  count?: number;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {children}
        {count != null && count > 0 && <CountBadge>{count}</CountBadge>}
      </h2>
      {action}
    </div>
  );
}

/** A small pill of a number — the brand spark for "N things want you". */
export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="bg-brand text-brand-foreground inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[11px] leading-none tabular-nums">
      {children}
    </span>
  );
}

/** A glanceable metric: big mono numeral over a small uppercase label. */
export function Stat({
  value,
  label,
}: {
  value: ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="font-mono text-xl tabular-nums">{value}</p>
      <Eyebrow>{label}</Eyebrow>
    </div>
  );
}

/** The small mono uppercase metadata label used above stats and sub-lists. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground font-mono text-[10px] tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}
