import type { ComponentProps, CSSProperties, ReactNode } from "react";

import type {
  DisciplineTone,
  DriftStatus,
  PaymentStatus,
} from "@matops/domain";
import { disciplineTone } from "@matops/domain";
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
 * The roster list shape (class-roster.tsx), shared with its skeleton so the two
 * cannot drift: a bordered card that scrolls its own rows, and a 44px hairline
 * row inside it.
 */
export const ROSTER_LIST =
  "border-border bg-card max-h-[26rem] overflow-y-auto rounded-lg border px-3";

export const ROSTER_ROW =
  "border-border/60 flex min-h-11 items-center gap-3 border-b py-1.5 last:border-b-0";

export const ENTER =
  "animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300 motion-reduce:animate-none";

export const TAP =
  "relative min-h-0! min-w-0! after:absolute after:-inset-2.5 after:content-[''] sm:after:hidden";

export const RESOLVE =
  "animate-in fade-in-0 duration-200 motion-reduce:animate-none";

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
      <p className="text-sm font-medium">{title}</p>
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
  as: Tag = "p",
  children,
  className,
}: {
  as?: "p" | "dt" | "span";
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "text-muted-foreground font-mono text-[10px] tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </Tag>
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
      className={cn(
        "border-border flex [scrollbar-width:none] gap-1 overflow-x-auto border-b [&::-webkit-scrollbar]:hidden",
        className,
      )}
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
              "relative flex min-h-11 shrink-0 items-center gap-2 px-3 py-2 text-sm whitespace-nowrap transition-colors sm:min-h-0",
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
              <span className="bg-brand absolute inset-x-0 bottom-0 h-0.5" />
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

/** Payment status → dot colour. The words are `PAYMENT_STATUS_LABEL` (ADR 40). */
export const DUES_TONE: Record<PaymentStatus, string> = {
  paid: "bg-success",
  due_soon: "bg-warning",
  overdue: "bg-error",
};

/**
 * Which discipline a class is, as a dot on a list rail. A dot rather than a
 * tinted row: a list of tinted bars would drown the page, and the category is a
 * whisper, not the point.
 */
const DOT_SKIN: Record<DisciplineTone, string> = {
  gi: "bg-gi",
  nogi: "bg-nogi",
  other: "border-border bg-background border",
};

export function disciplineDot(discipline: string | null): string {
  return DOT_SKIN[disciplineTone(discipline)];
}

export const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("size-4", className)}
    aria-hidden="true"
  >
    <path d="m4 6 4 4 4-4" />
  </svg>
);

export const PencilIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("size-3.5", className)}
    aria-hidden="true"
  >
    <path d="M10.9 2.6a1.5 1.5 0 0 1 2.1 2.1l-7.3 7.3-2.8.7.7-2.8z" />
  </svg>
);

export const NoteIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("size-3.5", className)}
    aria-hidden="true"
  >
    <path d="M3.5 2.5h9v11h-9z" />
    <path d="M5.75 5.5h4.5M5.75 8h4.5M5.75 10.5h2.5" />
  </svg>
);

export const MoreIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    className="size-4"
    aria-hidden="true"
  >
    <circle cx="3" cy="8" r="1.4" />
    <circle cx="8" cy="8" r="1.4" />
    <circle cx="13" cy="8" r="1.4" />
  </svg>
);

export const GripIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    className={cn("size-4", className)}
    aria-hidden="true"
  >
    <circle cx="6" cy="3.5" r="1.3" />
    <circle cx="10" cy="3.5" r="1.3" />
    <circle cx="6" cy="8" r="1.3" />
    <circle cx="10" cy="8" r="1.3" />
    <circle cx="6" cy="12.5" r="1.3" />
    <circle cx="10" cy="12.5" r="1.3" />
  </svg>
);

export const PlusIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className={cn("size-4", className)}
    aria-hidden="true"
  >
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

export const MinusIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className={cn("size-4", className)}
    aria-hidden="true"
  >
    <path d="M3.5 8h9" />
  </svg>
);

export const ArrowUpIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("size-4", className)}
    aria-hidden="true"
  >
    <path d="M8 12.5v-9M4 7.5 8 3.5l4 4" />
  </svg>
);

export const ArrowDownIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("size-4", className)}
    aria-hidden="true"
  >
    <path d="M8 3.5v9M4 8.5l4 4 4-4" />
  </svg>
);

export const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("size-3.5", className)}
    aria-hidden="true"
  >
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

export const XIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className={cn("size-3.5", className)}
    aria-hidden="true"
  >
    <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
  </svg>
);
