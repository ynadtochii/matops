import type { ReactNode } from "react";

import { Button } from "@matops/ui/button";

/**
 * The shared state system for every dashboard section (slice 4.3). One
 * disciplined pattern — skeleton while loading, an invitation when empty, a
 * retry when a fetch fails — so a failure never masquerades as "no data" and
 * every panel behaves the same. Mirrored on mobile in `apps/expo` (ui.tsx).
 */

/** Loading placeholder: a few muted bars sized to a list row. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="bg-muted h-12 animate-pulse rounded-md motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

/**
 * Empty state — an invitation to the next action, never a dead end. `title` says
 * what's absent; `children` says what to do about it; `action` is an optional
 * button.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-border/70 flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
      <p className="text-foreground text-sm font-medium">{title}</p>
      {children && <p className="text-muted-foreground text-sm">{children}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

/**
 * Error state — names what failed and offers a retry. Kept visually distinct
 * from EmptyState so "couldn't load" is never read as "nothing here". No
 * apology; just what happened and the way forward.
 */
export function ErrorState({
  label,
  onRetry,
}: {
  label: string;
  onRetry?: () => void;
}) {
  return (
    <div className="border-destructive/30 bg-destructive/5 flex flex-col items-start gap-2 rounded-lg border p-4">
      <p className="text-foreground text-sm font-medium">
        Couldn&apos;t load {label}.
      </p>
      <p className="text-muted-foreground text-sm">
        Check your connection and try again.
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-1">
          Try again
        </Button>
      )}
    </div>
  );
}
