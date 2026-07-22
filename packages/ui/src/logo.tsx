import { cn } from "@matops/ui";

/**
 * matops mark — a rounded tile of a **basketweave** mat bond (the woven plank
 * pairs real mats are laid in), filled `--brand` with the seams in
 * `--brand-foreground`. The one signature mark; restrained-violet per the
 * design system (docs/design.md §6, ADR 37). `logo.native.tsx` is the RN twin.
 */
const SEAMS = "M16 1.6V30.4M1.6 16H30.4M8.5 1.6V16M16 8.5H30.4M1.6 23.5H16M23.5 16V30.4";

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
      <rect x="1" y="1" width="30" height="30" rx="6.5" fill="var(--brand)" />
      <path
        d={SEAMS}
        stroke="var(--brand-foreground)"
        strokeOpacity={0.85}
        strokeWidth={1.5}
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
          mat<span className="text-brand-strong">ops</span>
        </span>
      )}
    </span>
  );
}
