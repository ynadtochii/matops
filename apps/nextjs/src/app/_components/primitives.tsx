import type { ReactNode } from "react";

import type { DriftStatus } from "@matops/domain";
import { cn } from "@matops/ui";

/**
 * Shared layout vocabulary for the owner/instructor screens: section headings,
 * count badges, stat blocks, card surfaces. Web-only composition helpers (not
 * the cross-platform UI kit), so they live next to `states.tsx` / `page-header.tsx`.
 */

/**
 * The two surface languages, unified. Both carry the hairline: on the black
 * theme the edge separates a card from the page, not a lightness jump.
 *  - `filled`  — a card surface for static list items (a class, a member, a
 *    claim). The app's default list surface.
 *  - `outline` — flush on the page background, for things that navigate or act.
 * Returns a className so it drops onto a `div`, `Link`, `li`, or `button` alike.
 */
export function cardClass({
  variant = "filled",
  interactive = false,
}: { variant?: "filled" | "outline"; interactive?: boolean } = {}) {
  return cn(
    "border-border rounded-lg border p-4",
    variant === "filled" && "bg-card",
    interactive && "hover:border-brand/40 hover:bg-muted transition-colors",
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

export function Section({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className="bg-border h-px w-5 shrink-0" />
        <h2 className="shrink-0 font-mono text-[11px] font-medium tracking-[0.16em] uppercase">
          {label}
        </h2>
        <span aria-hidden className="bg-border h-px flex-1" />
        {meta && (
          <span className="text-muted-foreground shrink-0 font-mono text-[10px] tracking-wide uppercase">
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
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

/**
 * A glanceable metric: big mono numeral over a small uppercase label, with an
 * optional comparison line beneath. The comparison stays in the muted colour on
 * purpose — a drop in visits is not an error, and painting direction green or
 * red would both overload the callout colours and encode meaning in hue alone.
 */
export function Stat({
  value,
  label,
  delta,
  deltaLabel,
  formatDelta = String,
}: {
  value: ReactNode;
  label: string;
  delta?: number;
  deltaLabel?: string;
  formatDelta?: (size: number) => string;
}) {
  const size = formatDelta(Math.abs(delta ?? 0));
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className="font-mono text-xl tabular-nums">{value}</span>
        {delta != null && delta !== 0 && (
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              // Down is `--warning` ("careful"), never `--error` — a quiet week
              // is worth a look, not a failure. The arrow carries the direction
              // too, so nothing here is encoded in hue alone.
              delta > 0 ? "text-success" : "text-warning",
            )}
          >
            <span aria-hidden>
              {delta > 0 ? "↑" : "↓"}
              {size}
            </span>
            <span className="sr-only">
              {size} {delta > 0 ? "more" : "fewer"} than {deltaLabel}
            </span>
          </span>
        )}
      </p>
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

export function Tabs<T extends string>({
  label,
  value,
  onChange,
  tabs,
  className,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  tabs: { id: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("border-border flex gap-1 border-b", className)}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative -mb-px flex items-center gap-2 px-3 py-2 text-sm transition-colors",
              active
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <CountBadge>{t.count}</CountBadge>
            )}
            {active && (
              <span className="bg-brand absolute inset-x-0 -bottom-px h-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}

const DRIFT_LABEL: Record<DriftStatus, string> = {
  active: "Active",
  cooling: "Cooling",
  at_risk: "At risk",
  dormant: "Dormant",
};

const DRIFT_TONE: Record<DriftStatus, string> = {
  active: "text-success border-success/40",
  cooling: "text-muted-foreground border-border",
  at_risk: "text-warning border-warning/40",
  dormant: "text-error border-error/40",
};

/** How long since a member last trained, as a band (C.2). */
export function DriftBadge({
  drift,
  className,
}: {
  drift: DriftStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-medium",
        DRIFT_TONE[drift],
        className,
      )}
    >
      {DRIFT_LABEL[drift]}
    </span>
  );
}
