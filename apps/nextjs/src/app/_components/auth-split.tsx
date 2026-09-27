import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@matops/ui";
import { Logo, Mark } from "@matops/ui/logo";
import { FOCUS_RING } from "@matops/ui/motion";

import { ENTER, Eyebrow, stagger } from "./primitives";

/**
 * The signed-out door, shared by `/sign-in` and `/start`: a blueprint brand
 * panel beside the form. It is capped at one screen on purpose. `lg:h-dvh`
 * with the form column scrolling on its own keeps the form reachable on a
 * short laptop instead of clipping it. The panel is desktop-only; on a phone
 * the form column carries the whole page.
 */
export function AuthSplit({
  headline,
  blurb,
  anchors,
  children,
}: {
  headline: ReactNode;
  blurb: string;
  anchors?: readonly string[];
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:h-dvh lg:grid-cols-[1.1fr_1fr] lg:overflow-hidden">
      <aside className="bg-surface-1 border-border relative hidden overflow-hidden border-r lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="bg-grid absolute inset-0 opacity-40" aria-hidden />
        <Mark
          size={560}
          className="pointer-events-none absolute -right-44 -bottom-44 opacity-[0.08]"
        />

        <Logo size={26} className="relative" />

        <div className="relative max-w-md">
          <p
            className={cn(
              "text-foreground text-4xl font-semibold tracking-tight text-balance",
              ENTER,
            )}
          >
            {headline}
          </p>
          <p
            className={cn(
              "text-foreground-secondary mt-4 max-w-sm text-base leading-relaxed text-pretty",
              ENTER,
            )}
            style={stagger(1)}
          >
            {blurb}
          </p>
          {anchors && (
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
              {anchors.map((a, i) => (
                <Eyebrow key={a} className={ENTER} style={stagger(i + 2)}>
                  {a}
                </Eyebrow>
              ))}
            </div>
          )}
        </div>

        <Eyebrow className="relative">Built for BJJ academies</Eyebrow>
      </aside>

      <div className="bg-background flex flex-col justify-center overflow-y-auto p-4 sm:p-6">
        <div
          className={cn(
            "mx-auto flex w-full max-w-sm flex-col gap-5 sm:gap-6",
            ENTER,
          )}
        >
          <Logo size={28} className="lg:hidden" />

          {children}

          <p className="text-muted-foreground text-xs text-balance">
            By continuing you agree to our{" "}
            <Link
              href="/privacy"
              className={cn(
                "hover:text-foreground rounded-sm underline underline-offset-4 transition-colors motion-reduce:transition-none",
                FOCUS_RING,
              )}
            >
              privacy notice
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
