"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sendGAEvent } from "@next/third-parties/google";

import { cn } from "@matops/ui";
import { buttonClass } from "@matops/ui/button";
import { FOCUS_RING } from "@matops/ui/motion";

import type { Consent } from "~/lib/consent";
import { CONSENT_OPEN_EVENT, consentCookie } from "~/lib/consent";
import { ENTER } from "./primitives";

function clearAnalyticsCookies() {
  const host = window.location.hostname;
  const domains = [host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const pair of document.cookie.split("; ")) {
    const name = pair.split("=")[0];
    if (!name?.startsWith("_ga")) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}`;
    }
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

export function ConsentBanner({
  initial,
  analytics,
}: {
  initial: Consent | null;
  analytics: boolean;
}) {
  const [open, setOpen] = useState(initial === null);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  function choose(value: Consent) {
    document.cookie = consentCookie(
      value,
      new Date(),
      window.location.protocol === "https:",
    );
    if (analytics) {
      sendGAEvent("consent", "update", { analytics_storage: value });
    }
    if (value === "denied") clearAnalyticsCookies();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <section
      aria-label="Cookie choice"
      className={cn(
        "edge-rim-card shadow-float fixed inset-x-4 bottom-4 z-50 flex flex-col gap-3 rounded-xl p-4 sm:right-auto sm:max-w-sm",
        ENTER,
      )}
    >
      <p className="text-foreground-secondary text-sm text-pretty">
        We use Google Analytics cookies to see how people find MatOps.{" "}
        <Link
          href="/privacy"
          className={cn(
            "text-foreground decoration-muted-foreground rounded-sm underline underline-offset-4 hover:decoration-current",
            FOCUS_RING,
          )}
        >
          Privacy
        </Link>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={buttonClass({ variant: "secondary" })}
          onClick={() => choose("granted")}
        >
          Accept
        </button>
        <button
          type="button"
          className={buttonClass({ variant: "secondary" })}
          onClick={() => choose("denied")}
        >
          Decline
        </button>
      </div>
    </section>
  );
}

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
    >
      Cookie settings
    </button>
  );
}
