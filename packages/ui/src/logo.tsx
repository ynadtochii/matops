import { cn } from "@matops/ui";

/**
 * matops mark — a rounded tile of a **basketweave** mat bond (the woven plank
 * pairs real mats are laid in), filled `--brand` with the seams in
 * `--brand-foreground`. The one signature mark; restrained-violet per the
 * design system (docs/design.md §6, ADR 37). `logo.native.tsx` is the RN twin.
 */
const SEAMS = "M16 0V32M0 16H32M8.5 0V16M16 8.5H32M0 23.5H16M23.5 16V32";

export function Mark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="var(--brand)" />
      <path
        d={SEAMS}
        stroke="var(--brand-foreground)"
        strokeOpacity={0.85}
        strokeWidth={1.6}
      />
    </svg>
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
