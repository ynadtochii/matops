"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "~/auth/client";

export function FinishSignOut() {
  const router = useRouter();
  useEffect(() => {
    void authClient
      .signOut()
      .catch(() => null)
      .then(() => router.refresh());
  }, [router]);
  return null;
}
