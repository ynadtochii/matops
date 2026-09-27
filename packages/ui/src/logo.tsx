import { useId } from "react";

import { cn } from "@matops/ui";

/**
 * matops mark — a rounded tile of a **basketweave** mat bond (the woven plank
 * pairs real mats are laid in), filled `--brand` with the seams in
 * `--brand-foreground`. The one signature mark (docs/design.md §6, ADR 37).
 */
const SEAMS = "M16 0V32M0 16H32M8.5 0V16M16 8.5H32M0 23.5H16M23.5 16V32";

export function Mark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const bloom = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <MarkBloom id={bloom} />
      <rect width="32" height="32" rx="7" fill="var(--brand)" />
      <path d={SEAMS} filter={`url(#${bloom})`} {...SEAM_GLOW} />
      <path d={SEAMS} {...SEAM_LINE} />
      <MarkRim />
    </svg>
  );
}

export const SEAM_LINE = {
  stroke: "var(--brand-foreground)",
  strokeOpacity: 0.92,
  strokeWidth: 1.1,
} as const;

export const SEAM_GLOW = { ...SEAM_LINE, strokeOpacity: 0.5 } as const;

export function MarkBloom({ id }: { id: string }) {
  return (
    <defs>
      <filter
        id={id}
        x="0"
        y="0"
        width="32"
        height="32"
        filterUnits="userSpaceOnUse"
      >
        <feGaussianBlur stdDeviation="1" />
      </filter>
    </defs>
  );
}

export function MarkRim() {
  return (
    <rect
      x="0.5"
      y="0.5"
      width="31"
      height="31"
      rx="6.5"
      stroke="var(--brand-foreground)"
      strokeOpacity={0.3}
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** Mark + `matops` wordmark lockup. "ops" carries the brand-strong accent. */
export function Logo({
  size = 24,
  withWordmark = true,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Mark size={size} />
      {withWordmark && (
        <span className="text-lg font-semibold tracking-tight">
          Mat<span className="text-brand-strong">Ops</span>
        </span>
      )}
    </span>
  );
}
