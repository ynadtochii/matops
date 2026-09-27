import type { ComponentProps, CSSProperties, ReactNode } from "react";

import type { DriftStatus } from "@matops/domain";
import type { BadgeTone } from "@matops/ui/badge";
import { cn } from "@matops/ui";
import { Badge } from "@matops/ui/badge";

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
    interactive &&
      "hover:border-border-strong hover:bg-hover transition-colors motion-reduce:transition-none",
  );
}

/**
 * The roster list shape (class-roster.tsx), shared with its skeleton so the two
 * cannot drift: a bordered card that scrolls its own rows, and a 44px hairline
 * row inside it.
 */
export const ROSTER_LIST =
  "border-border bg-card max-h-[26rem] overflow-y-auto rounded-lg border px-3";

export const ROSTER_ROW =
  "border-border flex min-h-11 items-center gap-3 border-b py-1.5 last:border-b-0";

export const LIST =
  "border-border bg-card divide-border divide-y overflow-hidden rounded-lg border";

export function SettingsRow({
  title,
  description,
  stacked = false,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  stacked?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4",
        !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {title && (
          <div className="text-foreground text-sm font-medium">{title}</div>
        )}
        {description && (
          <div className="text-muted-foreground max-w-xl text-sm text-pretty">
            {description}
          </div>
        )}
      </div>
      {children && (
        <div
          className={
            stacked
              ? "flex min-w-0 flex-col gap-3"
              : "flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end"
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}

export const ENTER =
  "animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300 ease-out motion-reduce:animate-none";

export const TAP =
  "relative min-h-0! min-w-0! after:absolute after:-inset-2.5 after:content-[''] sm:after:hidden";

/**
 * A capped entrance stagger for list rows: the first few land one after
 * another, everything past the cap arrives together. Uncapped, a hundred-row
 * roster would still be dealing itself out seconds after it loaded.
 */
export const stagger = (index: number): CSSProperties => ({
  animationDelay: `${Math.min(index, 6) * 40}ms`,
});

export const RESOLVE =
  "animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none";

export function Panel({
  cols = 1,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { cols?: number }) {
  return (
    <div
      className={cn(
        "border-border bg-grid-small overflow-hidden rounded-lg border",
        className,
      )}
      {...props}
    >
      {/* Pulled a pixel past the strip and clipped, so the last column and row
          shed their hairline into the strip's edge instead of doubling it. */}
      <div
        style={{ "--panel-cols": cols } as CSSProperties}
        className="-mr-px -mb-px grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] lg:grid-cols-[repeat(var(--panel-cols),minmax(0,1fr))]"
      >
        {children}
      </div>
    </div>
  );
}

export const panelCell = "border-border bg-background/90 border-r border-b";

export function PanelNotice({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn(panelCell, "col-span-full px-4 py-5")}>
      <p className="text-foreground text-sm font-medium">{title}</p>
      {children && (
        <p className="text-muted-foreground mt-1 text-sm">{children}</p>
      )}
    </div>
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
      <h2 className="text-md flex items-center gap-2 font-semibold">
        {children}
        {count != null && count > 0 && <CountBadge>{count}</CountBadge>}
      </h2>
      {action}
    </div>
  );
}

/**
 * The rule-and-label look `Section` wears, on its own, for a heading that sits
 * inside a section and so cannot be another `Section`.
 */
const SECTION_LABEL = "text-sm font-medium";

export function Section({
  label,
  meta,
  className,
  children,
}: {
  label: string;
  meta?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="bg-border h-px w-5 shrink-0" />
        <h2 className={cn("text-muted-foreground shrink-0", SECTION_LABEL)}>
          {label}
        </h2>
        <span aria-hidden className="bg-border h-px flex-1" />
        {meta && (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
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
    <span className="bg-active text-foreground text-2xs inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 leading-none font-medium tabular-nums">
      {children}
    </span>
  );
}

/**
 * A glanceable metric: a large numeral over a small label, with an
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
        <span className="text-xl font-medium tabular-nums">{value}</span>
        {delta != null && delta !== 0 && (
          <span
            className={cn(
              "text-2xs font-medium tabular-nums",
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

/** The small metadata label used under stats and above sub-lists. */
export function Eyebrow({
  as: Tag = "p",
  children,
  className,
  style,
}: {
  as?: "p" | "dt" | "span";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Tag
      style={style}
      className={cn("text-muted-foreground text-xs", className)}
    >
      {children}
    </Tag>
  );
}

const DRIFT_LABEL: Record<DriftStatus, string> = {
  active: "Active",
  cooling: "Cooling",
  at_risk: "At risk",
  dormant: "Dormant",
};

const DRIFT_TONE: Record<DriftStatus, BadgeTone> = {
  active: "success",
  cooling: "neutral",
  at_risk: "warning",
  dormant: "error",
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
    <Badge tone={DRIFT_TONE[drift]} className={className}>
      {DRIFT_LABEL[drift]}
    </Badge>
  );
}

/**
 * Which discipline a class is, as a dot on a list rail. A dot rather than a
 * tinted row: a list of tinted bars would drown the page, and the category is a
 * whisper, not the point.
 */
export const DISCIPLINE_BG = [
  "bg-discipline-1",
  "bg-discipline-2",
  "bg-discipline-3",
  "bg-discipline-4",
  "bg-discipline-5",
];

export function disciplineDot(hue: number | null): string {
  return hue === null
    ? "bg-discipline-default"
    : (DISCIPLINE_BG[hue] ?? "bg-discipline-default");
}
