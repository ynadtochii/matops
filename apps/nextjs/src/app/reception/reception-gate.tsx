"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";

import { ReceptionScreen } from "./reception-screen";

type Phase = "opening" | "ready" | "handover" | "failed";

const KEY = /^[a-f0-9]{64}$/;
const UNAVAILABLE = "This reception link is not available. Please ask staff.";

function keyFromHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("key");
  return value && KEY.test(value) ? value : null;
}

/**
 * Exchange the permanent link for this browser's cookie (ADR 139).
 *
 * The secret arrives in the URL FRAGMENT, which browsers never send to a
 * server, so it stays out of ordinary request logs. It is posted once, stripped
 * from the address bar, and never written to storage: the cookie is what the
 * bookmark relies on afterwards.
 *
 * A browser still signed in to a staff account is not signed out behind
 * anybody's back. It is offered one explicit handover, and readiness is only
 * reported once that has actually worked.
 */
export function ReceptionGate() {
  const client = useQueryClient();
  // The fragment is client-only, so it is read through a store with an empty
  // server snapshot rather than an effect that would then have to correct the
  // first render.
  const hash = useSyncExternalStore(
    () => () => undefined,
    () => window.location.hash,
    () => "",
  );
  const key = keyFromHash(hash);
  const [reached, setReached] = useState<Phase | null>(null);
  const phase: Phase = reached ?? (key ? "opening" : "ready");
  const [error, setError] = useState(UNAVAILABLE);
  const secret = useRef<string | null>(null);

  const exchange = useCallback(
    async (secretKey: string, handover: boolean) => {
      setReached("opening");
      try {
        const response = await fetch("/api/reception", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: secretKey, handover }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          needsHandover?: boolean;
        };
        if (response.ok) {
          secret.current = null;
          client.clear();
          // A full navigation, so nothing an owner's session rendered before
          // the handover survives in this document.
          window.location.replace("/reception");
          return;
        }
        if (body.needsHandover) {
          setReached("handover");
          return;
        }
        setError(body.error ?? UNAVAILABLE);
        setReached("failed");
      } catch {
        setError("Could not open reception. Check the connection and retry.");
        setReached("failed");
      }
    },
    [client],
  );

  useEffect(() => {
    if (!key || secret.current) return;
    secret.current = key;
    window.history.replaceState(null, "", window.location.pathname);
    void exchange(key, false);
  }, [key, exchange]);

  if (phase === "ready") return <ReceptionScreen />;

  return (
    <main className="bg-muted/30 relative flex min-h-dvh items-center overflow-hidden px-4 py-8">
      <div aria-hidden className="bg-grid absolute inset-0 opacity-35" />
      <div className="bg-background relative mx-auto flex w-full max-w-lg flex-col gap-7 border p-6 sm:p-10">
        <div className="flex items-center gap-4 border-b pb-6">
          <span
            className="bg-brand grid size-11 shrink-0 grid-cols-2 gap-px p-2.5"
            aria-hidden
          >
            <span className="bg-brand-foreground row-span-2" />
            <span className="bg-brand-foreground" />
            <span className="border-brand-foreground border" />
          </span>
          <div>
            <p className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
              MatOps
            </p>
            <h1 className="text-3xl tracking-tight">Reception</h1>
          </div>
        </div>
        {phase === "opening" && (
          <p className="flex items-center gap-3" role="status">
            <span className="border-brand size-5 animate-spin rounded-full border-2 border-r-transparent" />
            Opening reception…
          </p>
        )}
        {phase === "handover" && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl tracking-tight">
                Switch to reception mode
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                This browser is signed in to a staff account. Signing out is
                required before the screen can be left at the door.
              </p>
            </div>
            <Button
              className="min-h-14 text-base"
              onClick={() => {
                const key = secret.current;
                if (key) void exchange(key, true);
              }}
            >
              Sign out and open reception
            </Button>
          </div>
        )}
        {phase === "failed" && (
          <div
            className="border-error bg-muted flex flex-col gap-3 border-l-2 p-4"
            role="alert"
          >
            <p className="font-medium">Reception could not open</p>
            <p className="text-muted-foreground text-sm">{error}</p>
            <Button
              className="min-h-12 self-start"
              variant="outline"
              onClick={() => {
                const key = secret.current;
                if (key) void exchange(key, false);
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
