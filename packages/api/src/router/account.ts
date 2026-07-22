import type { TRPCRouterRecord } from "@trpc/server";

import { updateUserProfile } from "@matops/db";
import { UpdateProfileSchema } from "@matops/validators";

import { protectedProcedure } from "../trpc";

/**
 * The signed-in user's own account (slice B.3, spec S7). Not academy-scoped —
 * the profile is one identity across every gym — so it runs on
 * `protectedProcedure` and writes the Better Auth `user` row via the
 * `updateUserProfile` base-connection helper (that table has no RLS).
 */
export const accountRouter = {
  /**
   * Update the caller's display name + phone. Email is intentionally NOT
   * editable here — it is the login identity and notification channel; changing
   * it is a later concern. The client refetches its Better Auth session after
   * this so the new values show at once.
   */
  updateProfile: protectedProcedure
    .input(UpdateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      await updateUserProfile(ctx.session.user.id, {
        name: `${input.firstName} ${input.lastName}`.trim(),
        phone: input.phone,
      });
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
