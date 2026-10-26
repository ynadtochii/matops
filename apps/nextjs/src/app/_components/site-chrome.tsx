import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@matops/ui";
import { buttonClass } from "@matops/ui/button";
import { Logo } from "@matops/ui/logo";
import { FOCUS_RING } from "@matops/ui/motion";

export const FOOTER_LINK = cn(
  "hover:text-foreground rounded-sm transition-colors motion-reduce:transition-none",
  FOCUS_RING,
);

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
      <Link href="/" className={cn("rounded-md", FOCUS_RING)}>
        <Logo size={24} />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1">
        <Link href="/features" className={buttonClass({ variant: "ghost" })}>
          Features
        </Link>
        <Link href="/sign-in" className={buttonClass({ variant: "ghost" })}>
          Sign in
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="border-border border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-xs sm:px-6">
        <Logo size={18} withWordmark={false} />
        <div className="flex items-center gap-4">
          {children}
          <Link href="/features" className={FOOTER_LINK}>
            Features
          </Link>
          <Link href="/privacy" className={FOOTER_LINK}>
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
