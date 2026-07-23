"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@matops/ui/button";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { authClient } from "~/auth/client";

export function SignOutButton() {
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

  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={signOut}>
      {busy && <Spinner size="sm" className="text-current" />}
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
