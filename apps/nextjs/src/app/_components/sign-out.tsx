"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@matops/ui/button";
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
        busy={busy}
        disabled={busy}
        onClick={signOut}
      >
        <LogOut aria-hidden />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      busy={busy}
      disabled={busy}
      onClick={signOut}
    >
      Sign out
    </Button>
  );
}
