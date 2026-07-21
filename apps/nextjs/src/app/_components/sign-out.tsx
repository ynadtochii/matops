"use client";

import { useRouter } from "next/navigation";

import { Button } from "@matops/ui/button";

import { authClient } from "~/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
