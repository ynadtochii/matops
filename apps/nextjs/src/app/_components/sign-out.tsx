"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@matops/ui/button";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { authClient } from "~/auth/client";

export function SignOutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await authClient.signOut();
      router.refresh();
    } catch {
      toast.error("Couldn't sign out. Try again.");
      setBusy(false);
    }
  };

  if (iconOnly) {
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label="Sign out"
        disabled={busy}
        onClick={signOut}
      >
        {busy ? (
          <Spinner size="sm" className="text-current" />
        ) : (
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden
          >
            <path d="M6.5 2.5H3.5a1 1 0 00-1 1v9a1 1 0 001 1h3M10 5l3 3-3 3M13 8H6.5" />
          </svg>
        )}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={signOut}>
      {busy && <Spinner size="sm" className="text-current" />}
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
