import type { TRPCRouterRecord } from "@trpc/server";

import { deletePushToken, upsertPushToken } from "@matops/db";
import {
  RegisterPushTokenSchema,
  UnregisterPushTokenSchema,
} from "@matops/validators";

import { protectedProcedure } from "../trpc";

/**
 * Push-token registration (Phase 4, docs/issues/17, 34). On `protectedProcedure`
 * — a token is user-global identity data (NOT academy-scoped), so this needs an
 * authenticated user but NO active academy / tenant seam. The writes hit the
 * base connection inside `@matops/db` helpers (push_token has no RLS), keyed by
 * `ctx.session.user.id`. The mobile app registers on sign-in and unregisters on
 * sign-out.
 */
export const pushTokenRouter = {
  register: protectedProcedure
    .input(RegisterPushTokenSchema)
    .mutation(async ({ ctx, input }) => {
      await upsertPushToken(ctx.session.user.id, {
        token: input.token,
        platform: input.platform,
        deviceId: input.deviceId,
      });
      return { ok: true as const };
    }),

  unregister: protectedProcedure
    .input(UnregisterPushTokenSchema)
    .mutation(async ({ ctx, input }) => {
      await deletePushToken(ctx.session.user.id, input.token);
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
