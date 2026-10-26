import type { ReactNode } from "react";
import { Instrument_Serif } from "next/font/google";
import Link from "next/link";

import { cn } from "@matops/ui";
import { Logo } from "@matops/ui/logo";
import { FOCUS_RING } from "@matops/ui/motion";

import { ENTER, stagger } from "./primitives";

export const display = Instrument_Serif({ subsets: ["latin"], weight: "400" });

export function AuthDoor({
  headline,
  blurb,
  children,
}: {
  headline: ReactNode;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <main className="bg-background relative isolate flex min-h-dvh flex-col items-center overflow-hidden px-4 pt-10 pb-12 sm:pt-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 hidden h-[70vh] bg-[radial-gradient(ellipse_55%_60%_at_50%_0%,rgb(255_255_255/0.07),transparent)] dark:block"
      />
      <MatFloor />

      <Logo size={26} className={ENTER} />

      <p
        className={cn(
          display.className,
          "from-foreground to-muted-foreground mt-10 max-w-[14ch] bg-linear-to-b bg-clip-text pb-1 text-center text-5xl leading-[1.02] tracking-[-0.01em] text-balance text-transparent sm:mt-12 sm:text-7xl dark:drop-shadow-[0_0_24px_rgb(255_255_255/0.12)]",
          ENTER,
        )}
        style={stagger(1)}
      >
        {headline}
      </p>
      <p
        className={cn(
          "text-muted-foreground mt-4 max-w-md text-center text-base leading-relaxed text-pretty",
          ENTER,
        )}
        style={stagger(2)}
      >
        {blurb}
      </p>

      <div
        className={cn(
          "edge-rim-card shadow-float mt-9 flex w-full max-w-sm flex-col gap-5 rounded-xl p-6 sm:mt-10 sm:gap-6 sm:p-7",
          ENTER,
        )}
        style={stagger(4)}
      >
        {children}
      </div>

      <p
        className={cn(
          "text-muted-foreground mt-6 max-w-sm text-center text-xs text-balance",
          ENTER,
        )}
        style={stagger(5)}
      >
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
    </main>
  );
}

const WEAVE =
  "M0 0H160M0 40H80M0 80H160M80 120H160M0 0V160M40 80V160M80 0V160M120 0V80";

export function MatFloor() {
  return (
    <div
      aria-hidden
      className="animate-in fade-in-0 pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[60vh] [mask-image:radial-gradient(ellipse_55%_85%_at_50%_60%,#000_15%,transparent_78%)] duration-1000 ease-out perspective-[900px] motion-reduce:animate-none"
    >
      <svg className="text-border-strong dark:text-control absolute top-0 left-1/2 h-[180%] w-[240%] origin-top -translate-x-1/2 rotate-x-[52deg]">
        <defs>
          <pattern
            id="mat-weave"
            width="160"
            height="160"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 0h80v80H0zM80 80h80v80H80z"
              fill="currentColor"
              fillOpacity="0.28"
            />
            <path
              d={WEAVE}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mat-weave)" />
      </svg>
    </div>
  );
}
