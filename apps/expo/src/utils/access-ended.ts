import type { QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { TRPCClientError } from "@trpc/client";

import { authClient } from "./auth";
import { clearActiveEntity } from "./entity-store";
import { forgetPushToken } from "./push";
import { clearClassReminders } from "./reminders";

export function isMembershipGone(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;
  const data: unknown = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "membershipGone" in data &&
    data.membershipGone === true
  );
}

let leaving = false;

export async function leaveEndedGym(queryClient: QueryClient): Promise<void> {
  if (leaving) return;
  leaving = true;
  try {
    void clearClassReminders();
    await forgetPushToken().catch(() => null);
    await authClient.signOut().catch(() => null);
    await clearActiveEntity();
    queryClient.clear();
    router.replace({ pathname: "/sign-in", params: { access: "ended" } });
  } finally {
    leaving = false;
  }
}
