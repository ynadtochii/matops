import type { ReactNode } from "react";
import Link from "next/link";

import { Button } from "@matops/ui/button";

/**
 * The shared state system for every dashboard section (slice 4.3). One
 * disciplined pattern - an invitation when empty, a retry when a fetch fails -
 * so a failure never masquerades as "no data" and every panel behaves the same.
 * The loading half lives in `skeletons.tsx`, where each placeholder is cut to
 * the shape of the screen it stands in for (ADR 80). Mirrored on mobile in
 * `apps/expo` (ui.tsx).
 */

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

/** A paused membership: the same dead end on every student screen (ADR 68). */
export function SuspendedState() {
  return (
    <EmptyState title="Your membership is paused.">
      Contact your gym to restore your access.
    </EmptyState>
  );
}

/**
 * A page this account does not have. The sidebar never offers it; this is what
 * a typed URL lands on, instead of a screen full of forbidden queries (ADR 73).
 */
export function NoAccessState() {
  return (
    <EmptyState
      title="That page isn't part of your account."
      action={
        <Button asChild size="sm" variant="outline">
          <Link href="/">Go to your home page</Link>
        </Button>
      }
    >
      Ask the owner of your gym if you think you should have it.
    </EmptyState>
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
    <div className="border-error/30 bg-error/5 flex flex-col items-start gap-2 rounded-lg border p-4">
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
