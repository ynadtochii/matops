import type { QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import { authClient } from "~/auth/client";

export const ACCESS_ENDED_HREF = "/sign-in?access=ended";

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
  await authClient.signOut().catch(() => null);
  queryClient.clear();
  window.location.replace(ACCESS_ENDED_HREF);
}
